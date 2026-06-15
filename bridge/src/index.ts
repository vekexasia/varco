import {
  type BridgePolicy,
  PROTO_VERSION,
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
} from "./logic";
import { shareShellResponse } from "./share";
import { VARCO_CLIENT_BUNDLE } from "./varco-client-bundle";

export interface Env {
  AUTHORITY_ROOMS: DurableObjectNamespace;
  MAX_CLIENTS_PER_AUTHORITY?: string;
  MAX_MESSAGE_SIZE?: string;
  MAX_MESSAGES_PER_MINUTE?: string;
  MAX_PENDING_AUTHORITIES?: string;
  ORIGIN_POLICY?: string;
  ALLOWED_ORIGINS?: string;
  PRESENCE_VISIBILITY?: string;
  AUTHORITY_ALLOWLIST?: string;
  BRIDGE_MODE?: string;
  MAX_SIGNALING_MESSAGES?: string;
}

const AUTH_DEADLINE_MS = 30_000;

function randomId(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return b64urlEncode(data);
}

function limit(env: Env, key: keyof Env, fallback: number): number {
  return parseLimit(env[key] as string | undefined, fallback);
}

function websocketResponse(server: WebSocket): Response { return new Response(null, { status: 101, webSocket: server }); }
function corsHeaders(policy: BridgePolicy, origin: string | null): HeadersInit {
  // Reflect the request Origin only when it passes the origin policy; with the
  // default (public) policy this reflects any origin, matching the previous
  // wildcard behaviour so the deployed demo and local dev keep working.
  const headers: Record<string, string> = { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (origin !== null && originAllowed(policy, origin)) { headers["Access-Control-Allow-Origin"] = origin; headers["Vary"] = "Origin"; }
  return headers;
}
function jsonResponse(body: unknown, policy: BridgePolicy, origin: string | null): Response { return Response.json(body, { headers: corsHeaders(policy, origin) }); }
function presenceGate(policy: BridgePolicy, origin: string | null): Response | null {
  const decision = presenceDecision(policy, origin);
  if (decision.kind === "not_found") return new Response("Not found", { status: 404 });
  if (decision.kind === "forbidden") return new Response("Forbidden origin", { status: 403 });
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const origin = request.headers.get("Origin");
    const policy = parsePolicy(env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(policy, origin) });
    if (parts[0] === "health" || parts[0] === "healthz") return jsonResponse({ ok: true }, policy, origin);
    if (parts[0] === "varco-client.js") return new Response(VARCO_CLIENT_BUNDLE, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" } });
    if (parts[0] === "share" && parts[1]) return shareShellResponse(decodeURIComponent(parts[1]));
    if (parts[0] === "presence" && parts[1]) {
      const denied = presenceGate(policy, origin);
      if (denied) return denied;
      return env.AUTHORITY_ROOMS.get(env.AUTHORITY_ROOMS.idFromName(parts[1])).fetch(request);
    }
    if ((parts[0] === "authority" || parts[0] === "consumer") && parts[1]) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      if (!originAllowed(policy, origin)) return new Response("Forbidden origin", { status: 403 });
      return env.AUTHORITY_ROOMS.get(env.AUTHORITY_ROOMS.idFromName(parts[1])).fetch(request);
    }
    return new Response("Varco opaque bridge", { status: 200 });
  },
};

export class AuthorityRoom implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const policy = parsePolicy(this.env);
    if (parts[0] === "presence") {
      const origin = request.headers.get("Origin");
      // The worker fetch already gates /presence, but the DO applies the same
      // decision so direct DO access (tests, refactors) stays consistent.
      const denied = presenceGate(policy, origin);
      if (denied) return denied;
      return jsonResponse({ online: this.findAuthority() !== null }, policy, origin);
    }
    if (parts[0] === "authority") return this.acceptAuthority(parts[1], policy);
    if (parts[0] === "consumer") return this.acceptConsumer();
    return new Response("Not found", { status: 404 });
  }

  private async acceptAuthority(authorityId: string, policy: BridgePolicy): Promise<Response> {
    if (!validAuthorityId(authorityId)) return new Response("Invalid authority id", { status: 400 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, ["authority"]);
    const allowlisted = authorityConnectDecision(policy.authorityAllowlist, authorityId);
    if (allowlisted.kind === "close") {
      server.close(allowlisted.code, allowlisted.reason);
      return websocketResponse(client);
    }
    // A connection attempt while another authority is connected is accepted and
    // challenged instead of rejected: a successful auth replaces the previous
    // socket (see handleAuthorityMessage). This recovers from zombie hibernated
    // sockets whose peer died without a close frame, which previously caused an
    // endless 4409 reject/reconnect loop against the Durable Object.
    const pending = this.state.getWebSockets("authority").filter((ws) => this.getState(ws)?.authed === false);
    if (pending.length >= limit(this.env, "MAX_PENDING_AUTHORITIES", 4)) {
      server.close(4429, "Too many pending authorities");
      return websocketResponse(client);
    }
    const challenge = randomId(32);
    this.setState(server, this.newState("authority", { authorityId, challenge, authed: false, connectedAt: Date.now() }));
    server.send(JSON.stringify({ type: "challenge", nonce: challenge, proto: PROTO_VERSION }));
    if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(Date.now() + AUTH_DEADLINE_MS);
    return websocketResponse(client);
  }

  private acceptConsumer(): Response {
    const authority = this.findAuthority();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, ["consumer"]);
    const decision = consumerConnectDecision(authority !== null, this.state.getWebSockets("consumer").length, limit(this.env, "MAX_CLIENTS_PER_AUTHORITY", 64));
    if (decision.kind === "reject") {
      if (decision.notice !== undefined) server.send(JSON.stringify(decision.notice));
      server.close(decision.code, decision.reason);
      return websocketResponse(client);
    }
    const sessionId = randomId(16);
    this.setState(server, this.newState("consumer", { sessionId }));
    authority!.send(JSON.stringify({ type: "client_connected", sessionId }));
    return websocketResponse(client);
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    const session = this.getState(ws);
    if (!session) return;
    const gate = gateMessage(session, data, limit(this.env, "MAX_MESSAGE_SIZE", 2 * 1024 * 1024), limit(this.env, "MAX_MESSAGES_PER_MINUTE", 240), Date.now());
    if (!gate.ok) { ws.close(gate.code, gate.reason); return; }
    const parsed = parseMessage(data);
    if (!parsed.ok) { ws.close(4400, "Invalid JSON"); return; }
    const policy = parsePolicy(this.env);
    if (session.role === "consumer") {
      const relayGate = relayPayloadGate(policy.mode, parsed.message, session, policy.maxSignalingMessages);
      if (!relayGate.ok) { this.setState(ws, session); ws.send(JSON.stringify(relayGate.notice)); ws.close(relayGate.code, relayGate.reason); return; }
    }
    if (session.role === "authority") this.handleAuthorityMessage(ws, session, parsed.message, policy);
    else this.handleConsumerMessage(session, parsed.message);
    this.setState(ws, session);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    let nextDeadline: number | null = null;
    for (const ws of this.state.getWebSockets("authority")) {
      const session = this.getState(ws);
      if (!session || session.authed) continue;
      const deadline = (session.connectedAt ?? 0) + AUTH_DEADLINE_MS;
      if (deadline <= now) ws.close(4408, "Auth timeout");
      else if (nextDeadline === null || deadline < nextDeadline) nextDeadline = deadline;
    }
    if (nextDeadline !== null) await this.state.storage.setAlarm(nextDeadline);
  }

  webSocketClose(ws: WebSocket): void { this.closeSocket(ws); }
  webSocketError(ws: WebSocket): void { this.closeSocket(ws); }

  private handleAuthorityMessage(ws: WebSocket, session: SocketState, message: any, policy: BridgePolicy): void {
    const action = authorityMessageAction(session, message);
    if (action.kind === "close") { ws.close(action.code, action.reason); return; }
    if (action.kind === "ready") {
      // Auth-then-replace: only a caller that proved ownership of the authority
      // key displaces the previous connection, so an attacker cannot evict the
      // real authority by just connecting.
      const stale = this.state.getWebSockets("authority").filter((other) => other !== ws && this.getState(other)?.authed);
      if (stale.length > 0) {
        for (const other of stale) other.close(4409, "Replaced by newer authority connection");
        for (const consumer of this.state.getWebSockets("consumer")) consumer.close(4404, "Authority offline");
      }
      ws.send(JSON.stringify({ type: "ready" }));
      return;
    }
    if (action.kind === "send_to_consumer") {
      const relayGate = relayPayloadGate(policy.mode, action.payload, session, policy.maxSignalingMessages);
      if (!relayGate.ok) { ws.send(JSON.stringify(relayGate.notice)); ws.close(relayGate.code, relayGate.reason); return; }
      const client = this.findConsumer(action.sessionId);
      if (client) client.send(JSON.stringify({ type: "authority_message", payload: action.payload }));
    } else if (action.kind === "close_consumer") {
      this.findConsumer(action.sessionId)?.close(4400, action.reason);
    }
  }

  private handleConsumerMessage(session: SocketState, message: any): void {
    const authority = this.findAuthority();
    if (authority && session.sessionId) authority.send(JSON.stringify({ type: "client_message", sessionId: session.sessionId, payload: message }));
  }

  private closeSocket(ws: WebSocket): void {
    const session = this.getState(ws);
    if (!session) return;
    const action = disconnectAction(session);
    if (action.kind === "evict_consumers") for (const client of this.state.getWebSockets("consumer")) client.close(4404, "Authority offline");
    if (action.kind === "notify_authority") this.findAuthority()?.send(JSON.stringify({ type: "client_disconnected", sessionId: action.sessionId }));
  }

  private getState(ws: WebSocket): SocketState | null { return (ws.deserializeAttachment() as SocketState | null) ?? null; }
  private setState(ws: WebSocket, value: SocketState): void { ws.serializeAttachment(value); }
  private newState(role: Role, values: Partial<SocketState>): SocketState { return { role, windowStart: Date.now(), messagesInWindow: 0, ...values }; }
  private findAuthority(): WebSocket | null { return this.state.getWebSockets("authority").find((ws) => this.getState(ws)?.authed) ?? null; }
  private findConsumer(sessionId: string): WebSocket | null { return this.state.getWebSockets("consumer").find((ws) => this.getState(ws)?.sessionId === sessionId) ?? null; }
}
