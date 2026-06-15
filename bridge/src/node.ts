import { createServer, type IncomingMessage, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type RawData, type WebSocket as WsSocket } from "ws";
import {
  type BridgePolicy,
  type Role,
  type SocketState,
  authorityConnectDecision,
  authorityMessageAction,
  b64urlEncode,
  consumerConnectDecision,
  disconnectAction,
  gateMessage,
  originAllowed,
  parseLimit,
  parseMessage,
  parsePolicy,
  presenceDecision,
  relayPayloadGate,
  validAuthorityId,
  PROTO_VERSION,
} from "./logic.js";
import { renderShareShell } from "./share.js";
import { VERSION } from "./version.js";
import { VARCO_CLIENT_BUNDLE } from "./varco-client-bundle.js";

export type NodeBridgeEnv = Record<string, string | undefined>;
export type StartNodeBridgeOptions = { port?: number; host?: string; env?: NodeBridgeEnv };
export type StartedNodeBridge = { server: Server; close: () => Promise<void> };

type Peer = { ws: WsSocket; session: SocketState; authTimer?: NodeJS.Timeout };

type NodeBridgeLimits = {
  maxClientsPerAuthority: number;
  maxMessageSize: number;
  maxMessagesPerMinute: number;
  maxPendingAuthorities: number;
};

const AUTH_DEADLINE_MS = 30_000;

function randomId(bytes = 16): string { return b64urlEncode(randomBytes(bytes)); }
function sendJson(ws: WsSocket, value: unknown): void { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(value)); }
function origin(req: IncomingMessage): string | null { return typeof req.headers.origin === "string" ? req.headers.origin : null; }
function parts(req: IncomingMessage): string[] { return new URL(req.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean); }
function limits(env: NodeBridgeEnv): NodeBridgeLimits {
  return {
    maxClientsPerAuthority: parseLimit(env.MAX_CLIENTS_PER_AUTHORITY, 64),
    maxMessageSize: parseLimit(env.MAX_MESSAGE_SIZE, 2 * 1024 * 1024),
    maxMessagesPerMinute: parseLimit(env.MAX_MESSAGES_PER_MINUTE, 240),
    maxPendingAuthorities: parseLimit(env.MAX_PENDING_AUTHORITIES, 4),
  };
}

function body(data: RawData): string | ArrayBuffer {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return data;
  if (Array.isArray(data)) return Uint8Array.from(Buffer.concat(data)).buffer;
  return Uint8Array.from(data).buffer;
}

function corsHeaders(policy: BridgePolicy, reqOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (reqOrigin !== null && originAllowed(policy, reqOrigin)) {
    headers["Access-Control-Allow-Origin"] = reqOrigin;
    headers.Vary = "Origin";
  }
  return headers;
}

function writeJson(res: any, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(value));
}

class Room {
  private authority: Peer | null = null;
  private readonly pendingAuthorities = new Set<Peer>();
  private readonly consumers = new Map<string, Peer>();

  constructor(private readonly authorityId: string, private readonly env: NodeBridgeEnv) {}

  online(): boolean { return this.authority !== null && this.authority.ws.readyState === this.authority.ws.OPEN; }

  acceptAuthority(ws: WsSocket, policy: BridgePolicy, roomLimits: NodeBridgeLimits): void {
    const allowlisted = authorityConnectDecision(policy.authorityAllowlist, this.authorityId);
    const session = this.newState("authority", { authorityId: this.authorityId, challenge: randomId(32), authed: false, connectedAt: Date.now() });
    const peer: Peer = { ws, session };
    if (allowlisted.kind === "close") { ws.close(allowlisted.code, allowlisted.reason); return; }
    if (this.pendingAuthorities.size >= roomLimits.maxPendingAuthorities) { ws.close(4429, "Too many pending authorities"); return; }
    this.pendingAuthorities.add(peer);
    peer.authTimer = setTimeout(() => ws.close(4408, "Auth timeout"), AUTH_DEADLINE_MS);
    this.bind(peer, policy, roomLimits);
    sendJson(ws, { type: "challenge", nonce: session.challenge, proto: PROTO_VERSION });
  }

  acceptConsumer(ws: WsSocket, policy: BridgePolicy, roomLimits: NodeBridgeLimits): void {
    const decision = consumerConnectDecision(this.online(), this.consumers.size + 1, roomLimits.maxClientsPerAuthority);
    const sessionId = randomId(16);
    const peer: Peer = { ws, session: this.newState("consumer", { sessionId }) };
    this.bind(peer, policy, roomLimits);
    if (decision.kind === "reject") {
      if (decision.notice !== undefined) sendJson(ws, decision.notice);
      ws.close(decision.code, decision.reason);
      return;
    }
    this.consumers.set(sessionId, peer);
    sendJson(this.authority!.ws, { type: "client_connected", sessionId });
  }

  closeAll(): void {
    this.authority?.ws.terminate();
    for (const peer of this.pendingAuthorities) {
      if (peer.authTimer) clearTimeout(peer.authTimer);
      peer.ws.terminate();
    }
    for (const peer of this.consumers.values()) peer.ws.terminate();
    this.pendingAuthorities.clear();
    this.consumers.clear();
    this.authority = null;
  }

  private bind(peer: Peer, policy: BridgePolicy, roomLimits: NodeBridgeLimits): void {
    peer.ws.on("message", (data) => this.message(peer, data, policy, roomLimits));
    peer.ws.on("close", () => this.closed(peer));
    peer.ws.on("error", () => this.closed(peer));
  }

  private message(peer: Peer, data: RawData, policy: BridgePolicy, roomLimits: NodeBridgeLimits): void {
    const payload = body(data);
    const gate = gateMessage(peer.session, payload, roomLimits.maxMessageSize, roomLimits.maxMessagesPerMinute, Date.now());
    if (!gate.ok) { peer.ws.close(gate.code, gate.reason); return; }
    const parsed = parseMessage(payload);
    if (!parsed.ok) { peer.ws.close(4400, "Invalid JSON"); return; }
    if (peer.session.role === "consumer") {
      const relayGate = relayPayloadGate(policy.mode, parsed.message, peer.session, policy.maxSignalingMessages);
      if (!relayGate.ok) { sendJson(peer.ws, relayGate.notice); peer.ws.close(relayGate.code, relayGate.reason); return; }
      this.handleConsumer(peer, parsed.message);
      return;
    }
    this.handleAuthority(peer, parsed.message, policy);
  }

  private handleAuthority(peer: Peer, message: any, policy: BridgePolicy): void {
    const action = authorityMessageAction(peer.session, message);
    if (action.kind === "close") { peer.ws.close(action.code, action.reason); return; }
    if (action.kind === "ready") {
      if (peer.authTimer) clearTimeout(peer.authTimer);
      this.pendingAuthorities.delete(peer);
      const stale = this.authority;
      this.authority = peer;
      if (stale && stale !== peer) stale.ws.close(4409, "Replaced by newer authority connection");
      for (const consumer of this.consumers.values()) consumer.ws.close(4404, "Authority offline");
      this.consumers.clear();
      sendJson(peer.ws, { type: "ready" });
      return;
    }
    if (action.kind === "send_to_consumer") {
      const relayGate = relayPayloadGate(policy.mode, action.payload, peer.session, policy.maxSignalingMessages);
      if (!relayGate.ok) { sendJson(peer.ws, relayGate.notice); peer.ws.close(relayGate.code, relayGate.reason); return; }
      const client = this.consumers.get(action.sessionId);
      if (client) sendJson(client.ws, { type: "authority_message", payload: action.payload });
    } else if (action.kind === "close_consumer") {
      this.consumers.get(action.sessionId)?.ws.close(4400, action.reason);
    }
  }

  private handleConsumer(peer: Peer, message: any): void {
    if (this.authority && peer.session.sessionId) sendJson(this.authority.ws, { type: "client_message", sessionId: peer.session.sessionId, payload: message });
  }

  private closed(peer: Peer): void {
    if (peer.authTimer) clearTimeout(peer.authTimer);
    this.pendingAuthorities.delete(peer);
    if (this.authority === peer) this.authority = null;
    if (peer.session.sessionId) this.consumers.delete(peer.session.sessionId);
    const action = disconnectAction(peer.session);
    if (action.kind === "evict_consumers") {
      for (const consumer of this.consumers.values()) consumer.ws.close(4404, "Authority offline");
      this.consumers.clear();
    }
    if (action.kind === "notify_authority" && this.authority) sendJson(this.authority.ws, { type: "client_disconnected", sessionId: action.sessionId });
  }

  private newState(role: Role, values: Partial<SocketState>): SocketState { return { role, windowStart: Date.now(), messagesInWindow: 0, ...values }; }
}

export async function startNodeBridge(options: StartNodeBridgeOptions = {}): Promise<StartedNodeBridge> {
  const env = options.env ?? process.env;
  const rooms = new Map<string, Room>();
  const server = createServer((req, res) => {
    const policy = parsePolicy(env);
    const reqOrigin = origin(req);
    const path = parts(req);
    if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders(policy, reqOrigin)); res.end(); return; }
    if (path[0] === "health" || path[0] === "healthz") { writeJson(res, 200, { ok: true, version: VERSION }, corsHeaders(policy, reqOrigin)); return; }
    if (path[0] === "varco-client.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(VARCO_CLIENT_BUNDLE);
      return;
    }
    if (path[0] === "share" && path[1]) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(renderShareShell(decodeURIComponent(path[1])));
      return;
    }
    if (path[0] === "presence" && path[1]) {
      const decision = presenceDecision(policy, reqOrigin);
      if (decision.kind === "not_found") { res.writeHead(404); res.end("Not found"); return; }
      if (decision.kind === "forbidden") { res.writeHead(403); res.end("Forbidden origin"); return; }
      writeJson(res, 200, { online: rooms.get(path[1])?.online() ?? false }, corsHeaders(policy, reqOrigin));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Varco opaque bridge");
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const policy = parsePolicy(env);
    const path = parts(req);
    const role = path[0];
    const authorityId = path[1];
    if ((role !== "authority" && role !== "consumer") || !authorityId) { socket.destroy(); return; }
    if (!originAllowed(policy, origin(req))) { socket.destroy(); return; }
    if (role === "authority" && !validAuthorityId(authorityId)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const room = rooms.get(authorityId) ?? new Room(authorityId, env);
      rooms.set(authorityId, room);
      const roomLimits = limits(env);
      if (role === "authority") room.acceptAuthority(ws, policy, roomLimits);
      else room.acceptConsumer(ws, policy, roomLimits);
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? Number(process.env.PORT ?? 8787), options.host ?? "127.0.0.1", resolve));
  return {
    server,
    close: async () => {
      for (const room of rooms.values()) room.closeAll();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bridge = await startNodeBridge({ host: process.env.HOST ?? "0.0.0.0" });
  const address = bridge.server.address();
  const port = typeof address === "object" && address ? address.port : process.env.PORT ?? 8787;
  console.log(`Varco Node bridge listening on ${process.env.HOST ?? "0.0.0.0"}:${port}`);
}
