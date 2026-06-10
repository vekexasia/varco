// Pure auth/routing/limit logic for AuthorityRoom, extracted from index.ts so it
// can be unit-tested with node --test without a Workers runtime.
import { ed25519 } from "@noble/curves/ed25519";

export type Role = "authority" | "consumer";
export type SocketState = { role: Role; authed?: boolean; sessionId?: string; challenge?: string; authorityId?: string; connectedAt?: number; windowStart: number; messagesInWindow: number };

export function b64urlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function validAuthorityId(value: string): boolean { try { return b64urlDecode(value).length === 32; } catch { return false; } }

export function isAuthedAuthority(state: SocketState | null): boolean { return state?.role === "authority" && state.authed === true; }

export type ConnectDecision = { kind: "reject"; notice?: unknown; code: number; reason: string } | { kind: "accept" };

export function authorityConnectDecision(authorityAlreadyConnected: boolean): ConnectDecision {
  if (authorityAlreadyConnected) return { kind: "reject", notice: { type: "duplicate_identity" }, code: 4409, reason: "Duplicate authority" };
  return { kind: "accept" };
}

export function consumerConnectDecision(authorityOnline: boolean, consumerCount: number, maxClients: number): ConnectDecision {
  if (!authorityOnline) return { kind: "reject", notice: { type: "offline" }, code: 4404, reason: "Authority offline" };
  if (consumerCount > maxClients) return { kind: "reject", code: 4429, reason: "Too many clients" };
  return { kind: "accept" };
}

export type GateResult = { ok: true } | { ok: false; code: number; reason: string };

export function gateMessage(session: SocketState, data: string | ArrayBuffer, maxMessageSize: number, maxMessagesPerMinute: number, now: number): GateResult {
  const size = typeof data === "string" ? new TextEncoder().encode(data).length : data.byteLength;
  if (size > maxMessageSize) return { ok: false, code: 4400, reason: "Message too large" };
  if (now - session.windowStart >= 60_000) { session.windowStart = now; session.messagesInWindow = 0; }
  session.messagesInWindow += 1;
  if (session.messagesInWindow > maxMessagesPerMinute) return { ok: false, code: 4429, reason: "Rate limit" };
  return { ok: true };
}

export function parseMessage(data: string | ArrayBuffer): { ok: true; message: any } | { ok: false } {
  try { return { ok: true, message: JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)) }; } catch { return { ok: false }; }
}

export type AuthorityAction =
  | { kind: "close"; code: number; reason: string }
  | { kind: "ready" }
  | { kind: "send_to_consumer"; sessionId: string; payload: unknown }
  | { kind: "close_consumer"; sessionId: string; reason: string }
  | { kind: "none" };

export function authorityMessageAction(session: SocketState, message: any): AuthorityAction {
  if (!session.authed) {
    if (message.type !== "auth" || !session.challenge || !session.authorityId || typeof message.signature !== "string") return { kind: "close", code: 4401, reason: "Auth required" };
    if (!ed25519.verify(b64urlDecode(message.signature), b64urlDecode(session.challenge), b64urlDecode(session.authorityId))) return { kind: "close", code: 4403, reason: "Bad signature" };
    session.authed = true;
    return { kind: "ready" };
  }
  if (message.type === "authority_message" && typeof message.sessionId === "string") return { kind: "send_to_consumer", sessionId: message.sessionId, payload: message.payload };
  if (message.type === "close_client" && typeof message.sessionId === "string") return { kind: "close_consumer", sessionId: message.sessionId, reason: message.reason || "Closed by authority" };
  return { kind: "none" };
}

export type DisconnectAction = { kind: "evict_consumers" } | { kind: "notify_authority"; sessionId: string } | { kind: "none" };

export function disconnectAction(session: SocketState): DisconnectAction {
  if (session.role === "authority") return { kind: "evict_consumers" };
  if (session.role === "consumer" && session.sessionId) return { kind: "notify_authority", sessionId: session.sessionId };
  return { kind: "none" };
}
