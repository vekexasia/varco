import { ed25519 } from "@noble/curves/ed25519";

export interface Env {
  AUTHORITY_ROOMS: DurableObjectNamespace;
  MAX_CLIENTS_PER_AUTHORITY?: string;
  MAX_MESSAGE_SIZE?: string;
  MAX_MESSAGES_PER_MINUTE?: string;
  MAX_PENDING_AUTHORITIES?: string;
}

const AUTH_DEADLINE_MS = 30_000;

type Role = "authority" | "consumer";
type SocketState = { role: Role; authed?: boolean; sessionId?: string; challenge?: string; authorityId?: string; connectedAt?: number; windowStart: number; messagesInWindow: number };

function b64urlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomId(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return b64urlEncode(data);
}

function limit(env: Env, key: keyof Env, fallback: number): number {
  const raw = env[key];
  return typeof raw === "string" ? Number(raw) : fallback;
}

function websocketResponse(server: WebSocket): Response { return new Response(null, { status: 101, webSocket: server }); }
function corsHeaders(): HeadersInit { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }; }
function jsonResponse(body: unknown): Response { return Response.json(body, { headers: corsHeaders() }); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (parts[0] === "health" || parts[0] === "healthz") return jsonResponse({ ok: true });
    if (parts[0] === "presence" && parts[1]) return env.AUTHORITY_ROOMS.get(env.AUTHORITY_ROOMS.idFromName(parts[1])).fetch(request);
    if ((parts[0] === "authority" || parts[0] === "consumer") && parts[1]) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
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
    if (parts[0] === "presence") return jsonResponse({ online: this.findAuthority() !== null });
    if (parts[0] === "authority") return this.acceptAuthority(parts[1]);
    if (parts[0] === "consumer") return this.acceptConsumer();
    return new Response("Not found", { status: 404 });
  }

  private async acceptAuthority(authorityId: string): Promise<Response> {
    if (!this.validAuthorityId(authorityId)) return new Response("Invalid authority id", { status: 400 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, ["authority"]);
    if (this.findAuthority()) {
      server.send(JSON.stringify({ type: "duplicate_identity" }));
      server.close(4409, "Duplicate authority");
      return websocketResponse(client);
    }
    const pending = this.state.getWebSockets("authority").filter((ws) => this.getState(ws)?.authed === false);
    if (pending.length >= limit(this.env, "MAX_PENDING_AUTHORITIES", 4)) {
      server.close(4429, "Too many pending authorities");
      return websocketResponse(client);
    }
    const challenge = randomId(32);
    this.setState(server, this.newState("authority", { authorityId, challenge, authed: false, connectedAt: Date.now() }));
    server.send(JSON.stringify({ type: "challenge", nonce: challenge }));
    if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(Date.now() + AUTH_DEADLINE_MS);
    return websocketResponse(client);
  }

  private acceptConsumer(): Response {
    const authority = this.findAuthority();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, ["consumer"]);
    if (!authority) {
      server.send(JSON.stringify({ type: "offline" }));
      server.close(4404, "Authority offline");
      return websocketResponse(client);
    }
    if (this.state.getWebSockets("consumer").length > limit(this.env, "MAX_CLIENTS_PER_AUTHORITY", 64)) {
      server.close(4429, "Too many clients");
      return websocketResponse(client);
    }
    const sessionId = randomId(16);
    this.setState(server, this.newState("consumer", { sessionId }));
    authority.send(JSON.stringify({ type: "client_connected", sessionId }));
    return websocketResponse(client);
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    const session = this.getState(ws);
    if (!session || !this.allowMessage(ws, session, data)) return;
    let message: any;
    try { message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)); } catch { ws.close(4400, "Invalid JSON"); return; }
    if (session.role === "authority") this.handleAuthorityMessage(ws, session, message);
    else this.handleConsumerMessage(session, message);
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

  private handleAuthorityMessage(ws: WebSocket, session: SocketState, message: any): void {
    if (!session.authed) {
      if (message.type !== "auth" || !session.challenge || !session.authorityId || typeof message.signature !== "string") { ws.close(4401, "Auth required"); return; }
      if (!ed25519.verify(b64urlDecode(message.signature), b64urlDecode(session.challenge), b64urlDecode(session.authorityId))) { ws.close(4403, "Bad signature"); return; }
      session.authed = true;
      ws.send(JSON.stringify({ type: "ready" }));
      return;
    }
    if (message.type === "authority_message" && typeof message.sessionId === "string") {
      const client = this.findConsumer(message.sessionId);
      if (client) client.send(JSON.stringify({ type: "authority_message", payload: message.payload }));
    } else if (message.type === "close_client" && typeof message.sessionId === "string") {
      this.findConsumer(message.sessionId)?.close(4400, message.reason || "Closed by authority");
    }
  }

  private handleConsumerMessage(session: SocketState, message: any): void {
    const authority = this.findAuthority();
    if (authority && session.sessionId) authority.send(JSON.stringify({ type: "client_message", sessionId: session.sessionId, payload: message }));
  }

  private closeSocket(ws: WebSocket): void {
    const session = this.getState(ws);
    if (!session) return;
    if (session.role === "authority") for (const client of this.state.getWebSockets("consumer")) client.close(4404, "Authority offline");
    if (session.role === "consumer" && session.sessionId) this.findAuthority()?.send(JSON.stringify({ type: "client_disconnected", sessionId: session.sessionId }));
  }

  private allowMessage(ws: WebSocket, session: SocketState, data: string | ArrayBuffer): boolean {
    const size = typeof data === "string" ? new TextEncoder().encode(data).length : data.byteLength;
    if (size > limit(this.env, "MAX_MESSAGE_SIZE", 2 * 1024 * 1024)) { ws.close(4400, "Message too large"); return false; }
    const now = Date.now();
    if (now - session.windowStart >= 60_000) { session.windowStart = now; session.messagesInWindow = 0; }
    session.messagesInWindow += 1;
    if (session.messagesInWindow > limit(this.env, "MAX_MESSAGES_PER_MINUTE", 240)) { ws.close(4429, "Rate limit"); return false; }
    return true;
  }

  private getState(ws: WebSocket): SocketState | null { return (ws.deserializeAttachment() as SocketState | null) ?? null; }
  private setState(ws: WebSocket, value: SocketState): void { ws.serializeAttachment(value); }
  private newState(role: Role, values: Partial<SocketState>): SocketState { return { role, windowStart: Date.now(), messagesInWindow: 0, ...values }; }
  private findAuthority(): WebSocket | null { return this.state.getWebSockets("authority").find((ws) => this.getState(ws)?.authed) ?? null; }
  private findConsumer(sessionId: string): WebSocket | null { return this.state.getWebSockets("consumer").find((ws) => this.getState(ws)?.sessionId === sessionId) ?? null; }
  private validAuthorityId(value: string): boolean { try { return b64urlDecode(value).length === 32; } catch { return false; } }
}
