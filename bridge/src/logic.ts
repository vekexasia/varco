// Pure auth/routing/limit logic for AuthorityRoom, extracted from index.ts so it
// can be unit-tested with node --test without a Workers runtime.
import { ed25519 } from "@noble/curves/ed25519";

export type Role = "authority" | "consumer";
export type SocketState = { role: Role; authed?: boolean; sessionId?: string; challenge?: string; authorityId?: string; connectedAt?: number; windowStart: number; messagesInWindow: number; signalingCount?: number };

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

export type OriginPolicy = "public" | "restricted";
export type PresenceVisibility = "public" | "restricted" | "disabled";
export type BridgeMode = "relay" | "signaling-only";
export type BridgePolicy = {
  originPolicy: OriginPolicy;
  allowedOrigins: string[];
  presence: PresenceVisibility;
  authorityAllowlist: Set<string> | null;
  mode: BridgeMode;
  maxSignalingMessages: number;
};

export type PolicyEnv = {
  ORIGIN_POLICY?: string;
  ALLOWED_ORIGINS?: string;
  PRESENCE_VISIBILITY?: string;
  AUTHORITY_ALLOWLIST?: string;
  BRIDGE_MODE?: string;
  MAX_SIGNALING_MESSAGES?: string;
};

function pickValue<T extends string>(raw: string | undefined, values: readonly T[], fallback: T): T {
  const value = raw?.trim();
  return value !== undefined && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

// Every option defaults to the historical public shared-bridge behaviour:
// any origin, public presence, open authority registration, full relay mode.
// Invalid values fall back to the defaults rather than failing closed.
export function parsePolicy(env: PolicyEnv): BridgePolicy {
  const allowlist = splitList(env.AUTHORITY_ALLOWLIST);
  return {
    originPolicy: pickValue(env.ORIGIN_POLICY, ["public", "restricted"], "public"),
    allowedOrigins: splitList(env.ALLOWED_ORIGINS).filter((entry) => entry !== "*"),
    presence: pickValue(env.PRESENCE_VISIBILITY, ["public", "restricted", "disabled"], "public"),
    authorityAllowlist: allowlist.length > 0 ? new Set(allowlist) : null,
    mode: pickValue(env.BRIDGE_MODE, ["relay", "signaling-only"], "relay"),
    maxSignalingMessages: parseLimit(env.MAX_SIGNALING_MESSAGES, 64),
  };
}

// Origin checks are browser containment, not authentication: a missing Origin
// header is always allowed because non-browser clients (e.g. the Home
// Assistant authority) do not send one. ORIGIN_POLICY=public allows every
// origin; ORIGIN_POLICY=restricted requires an exact ALLOWED_ORIGINS match
// (an empty list denies all browser origins).
export function originAllowed(policy: BridgePolicy, origin: string | null): boolean {
  if (policy.originPolicy === "public") return true;
  if (origin === null) return true;
  return policy.allowedOrigins.includes(origin);
}

export type PresenceDecision = { kind: "ok" } | { kind: "forbidden" } | { kind: "not_found" };

export function presenceDecision(policy: BridgePolicy, origin: string | null): PresenceDecision {
  if (policy.presence === "disabled") return { kind: "not_found" };
  if (policy.presence === "restricted") {
    if (origin !== null && !policy.allowedOrigins.includes(origin)) return { kind: "forbidden" };
    return { kind: "ok" };
  }
  return originAllowed(policy, origin) ? { kind: "ok" } : { kind: "forbidden" };
}

export type AuthorityConnectDecision = { kind: "accept" } | { kind: "close"; code: 4403; reason: string };

// Registration control only: an unset allowlist keeps open registration, and
// allowlisted IDs must still pass the existing signature challenge. This is
// not a substitute for the challenge (anyone can claim an ID at connect time).
export function authorityConnectDecision(allowlist: Set<string> | null, authorityId: string): AuthorityConnectDecision {
  if (allowlist !== null && !allowlist.has(authorityId)) return { kind: "close", code: 4403, reason: "Authority not allowlisted" };
  return { kind: "accept" };
}

export type RelayGateResult = { ok: true } | { ok: false; code: 4405; reason: string; notice: { type: "relay_disabled" } };

// In signaling-only mode the bridge relays only the plaintext session
// handshake and ciphertext tagged lane:"signaling". The lane field is
// unverifiable by design (the bridge never decrypts and never decides
// permissions); the per-socket budget caps abuse of the signaling lane as a
// covert relay. Everything else closes with 4405 so clients fail loudly
// instead of silently falling back to relay.
export function relayPayloadGate(mode: BridgeMode, payload: any, session: SocketState, maxSignaling: number): RelayGateResult {
  if (mode === "relay") return { ok: true };
  const type = payload?.type;
  if (type === "client_hello" || type === "server_hello") return { ok: true };
  if (type === "ciphertext" && payload.lane === "signaling") {
    session.signalingCount = (session.signalingCount ?? 0) + 1;
    if (session.signalingCount <= maxSignaling) return { ok: true };
    return { ok: false, code: 4405, reason: "Signaling budget exhausted", notice: { type: "relay_disabled" } };
  }
  return { ok: false, code: 4405, reason: "Relay data disabled", notice: { type: "relay_disabled" } };
}

export function parseLimit(raw: string | undefined, fallback: number): number {
  if (typeof raw !== "string") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function validAuthorityId(value: string): boolean { try { return b64urlDecode(value).length === 32; } catch { return false; } }

export function isAuthedAuthority(state: SocketState | null): boolean { return state?.role === "authority" && state.authed === true; }

export type ConnectDecision = { kind: "reject"; notice?: unknown; code: number; reason: string } | { kind: "accept" };

// Note: there is deliberately no authorityConnectDecision/duplicate rejection.
// A new connection for an already-connected authority is challenged normally;
// once it authenticates, AuthorityRoom replaces the previous socket. Rejecting
// duplicates caused an endless reconnect loop when a hibernated socket's peer
// died without a close frame (the zombie was never detected).

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

// Bridge handshake protocol version, advertised in the challenge message and
// echoed by the authority in its auth reply. A mismatch closes with 4406 so
// outdated clients stop retrying instead of looping on 4403 forever.
export const PROTO_VERSION = 1;

export function challengePayload(challenge: string): Uint8Array {
  const prefix = new TextEncoder().encode("varco-bridge-challenge-v1\0");
  const nonce = b64urlDecode(challenge);
  const out = new Uint8Array(prefix.length + nonce.length);
  out.set(prefix);
  out.set(nonce, prefix.length);
  return out;
}

export function authorityMessageAction(session: SocketState, message: any): AuthorityAction {
  if (!session.authed) {
    if (message.type !== "auth" || !session.challenge || !session.authorityId || typeof message.signature !== "string") return { kind: "close", code: 4401, reason: "Auth required" };
    if (message.proto !== undefined && message.proto !== PROTO_VERSION) return { kind: "close", code: 4406, reason: `Unsupported protocol version (bridge supports ${PROTO_VERSION})` };
    if (!ed25519.verify(b64urlDecode(message.signature), challengePayload(session.challenge), b64urlDecode(session.authorityId))) return { kind: "close", code: 4403, reason: "Bad signature" };
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
