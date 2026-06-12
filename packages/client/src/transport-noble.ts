// WebCrypto-free twin of RelayTransport for runtimes without crypto.subtle
// (e.g. Pebble PKJS). Same wire behaviour, primitives from @noble/*.
import { gcm } from "@noble/ciphers/aes.js";
import { ed25519 } from "@noble/curves/ed25519";
import { p256 } from "@noble/curves/p256.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2";
import { b64urlDecode, b64urlEncode, canonicalJson } from "./encoding.js";
import { closeError, envelopeLane } from "./transport.js";
import type { VarcoTransport } from "./types.js";

// Pure-JS UTF-8: PKJS has no TextEncoder/TextDecoder.
function utf8Encode(value: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const code = value.codePointAt(i)!;
    if (code > 0xffff) i += 1;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) { code = b; i += 1; }
    else if (b < 0xe0) { code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2; }
    else if (b < 0xf0) { code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3; }
    else { code = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); i += 4; }
    out += String.fromCodePoint(code);
  }
  return out;
}

// DER SubjectPublicKeyInfo header for a P-256 uncompressed point.
const SPKI_P256_PREFIX = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

function spkiWrap(rawPoint: Uint8Array): Uint8Array {
  const out = new Uint8Array(SPKI_P256_PREFIX.length + rawPoint.length);
  out.set(SPKI_P256_PREFIX);
  out.set(rawPoint, SPKI_P256_PREFIX.length);
  return out;
}

function spkiUnwrap(spki: Uint8Array): Uint8Array {
  if (spki.length < 91 || spki[spki.length - 65] !== 0x04) throw new Error("Bad server public key");
  return spki.slice(spki.length - 65);
}

export type RandomBytes = (n: number) => Uint8Array;

function defaultRandomBytes(n: number): Uint8Array {
  const cryptoLike = (globalThis as { crypto?: { getRandomValues?(array: Uint8Array): Uint8Array } }).crypto;
  if (!cryptoLike?.getRandomValues) throw new Error("No secure randomness available: pass a randomBytes option");
  const out = new Uint8Array(n);
  cryptoLike.getRandomValues(out);
  return out;
}

function wsUrl(base: string, authorityId: string): string {
  const clean = base.replace(/\/$/, "");
  return `${clean}/consumer/${encodeURIComponent(authorityId)}`;
}

function nonce(value: number): Uint8Array {
  const out = new Uint8Array(12);
  new DataView(out.buffer).setUint32(8, value, false);
  return out;
}

type SessionKeys = { send: Uint8Array; recv: Uint8Array; channelBinding: string };

function deriveSessionKeys(privateKey: Uint8Array, serverPoint: Uint8Array, authorityId: string): SessionKeys {
  // X coordinate only: matches WebCrypto ECDH deriveBits(256).
  const shared = p256.getSharedSecret(privateKey, serverPoint).slice(1);
  const salt = b64urlDecode(authorityId);
  return {
    send: hkdf(sha256, shared, salt, utf8Encode("varco-session-c2s-v1"), 32),
    recv: hkdf(sha256, shared, salt, utf8Encode("varco-session-s2c-v1"), 32),
    channelBinding: b64urlEncode(hkdf(sha256, shared, salt, utf8Encode("varco-channel-binding-v1"), 32)),
  };
}

export type NobleRelayTransportOptions = { requestTimeoutMs?: number; randomBytes?: RandomBytes };

export class NobleRelayTransport implements VarcoTransport {
  private ws: WebSocket | null = null;
  private keys: SessionKeys | null = null;
  private sendNonce = 0;
  private recvNonce = 0;
  private pending = new Map<string, { resolve: (value: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private eventHandler: ((event: any) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private ready: Promise<void> | null = null;
  private closed = false;
  private requestTimeoutMs: number;
  private randomBytes: RandomBytes;

  constructor(private bridgeUrl: string, private authorityId: string, options: NobleRelayTransportOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
  }

  onEvent(handler: (event: any) => void): void { this.eventHandler = handler; }

  onClose(handler: () => void): void { this.closeHandler = handler; }

  async channelBinding(): Promise<string> {
    await this.ensureConnected();
    return this.keys!.channelBinding;
  }

  async request(message: Record<string, unknown>): Promise<any> {
    await this.ensureConnected();
    const requestId = (message.request_id as string | undefined) ?? b64urlEncode(this.randomBytes(8));
    const withId = { ...message, request_id: requestId };
    const encrypted = this.encrypt(withId);
    this.ws?.send(JSON.stringify(encrypted));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Varco request timed out: ${String(message.type)}`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.ws?.close();
    this.failPending(new Error("Varco transport closed"));
  }

  private failPending(err: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  private async ensureConnected(): Promise<void> {
    if (this.closed) throw new Error("Varco transport closed");
    if (!this.ready) this.ready = this.connect();
    await this.ready;
  }

  private generatePrivateKey(): Uint8Array {
    // p256.utils.randomSecretKey needs global crypto; sample from the injected
    // source instead, rejecting out-of-range scalars.
    for (;;) {
      const candidate = this.randomBytes(32);
      if (p256.utils.isValidSecretKey(candidate)) return candidate;
    }
  }

  private async connect(): Promise<void> {
    const privateKey = this.generatePrivateKey();
    const clientPub = b64urlEncode(spkiWrap(p256.getPublicKey(privateKey, false)));
    const ws = new WebSocket(wsUrl(this.bridgeUrl, this.authorityId));
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => ws.send(JSON.stringify({ type: "client_hello", client_pub: clientPub }));
      ws.onerror = () => reject(new Error("Varco WebSocket failed"));
      ws.onclose = () => reject(new Error("Varco WebSocket closed during handshake"));
      ws.onmessage = (event) => {
        try {
          const outer = JSON.parse(String(event.data));
          const payload = outer.payload ?? outer;
          if (payload.type === "server_hello") {
            const serverPubBytes = b64urlDecode(payload.server_pub);
            const transcript = new Uint8Array(utf8Encode("varco-server-hello-v1\0").length + b64urlDecode(clientPub).length + 1 + serverPubBytes.length);
            let offset = 0;
            const prefix = utf8Encode("varco-server-hello-v1\0"); transcript.set(prefix, offset); offset += prefix.length;
            const clientBytes = b64urlDecode(clientPub); transcript.set(clientBytes, offset); offset += clientBytes.length;
            transcript[offset] = 0; offset += 1;
            transcript.set(serverPubBytes, offset);
            if (!ed25519.verify(b64urlDecode(payload.signature), transcript, b64urlDecode(this.authorityId))) throw new Error("Bad authority signature");
            this.keys = deriveSessionKeys(privateKey, spkiUnwrap(serverPubBytes), this.authorityId);
            ws.onmessage = (messageEvent) => {
              this.handleMessage(String(messageEvent.data)).catch((err) => {
                this.failPending(err instanceof Error ? err : new Error(String(err)));
                ws.close();
              });
            };
            ws.onclose = (closeEvent) => {
              const code = (closeEvent as CloseEvent | undefined)?.code;
              const wasClosed = this.closed;
              this.closed = true;
              this.failPending(closeError(code));
              if (!wasClosed && code !== 4405) this.closeHandler?.();
            };
            resolve();
          }
        } catch (err) { reject(err as Error); }
      };
    });
  }

  private encrypt(payload: Record<string, unknown>): Record<string, string> {
    if (!this.keys) throw new Error("Varco session is not ready");
    const n = nonce(this.sendNonce++);
    const body = gcm(this.keys.send, n).encrypt(utf8Encode(canonicalJson(payload)));
    const envelope: Record<string, string> = { type: "ciphertext", nonce: b64urlEncode(n), body: b64urlEncode(body) };
    const lane = envelopeLane(payload.type);
    if (lane) envelope.lane = lane;
    return envelope;
  }

  private decrypt(envelope: any): any {
    if (!this.keys) throw new Error("Varco session is not ready");
    const n = b64urlDecode(envelope.nonce);
    const expected = nonce(this.recvNonce++);
    if (n.some((value, index) => value !== expected[index])) throw new Error("Unexpected nonce");
    const plaintext = gcm(this.keys.recv, n).decrypt(b64urlDecode(envelope.body));
    return JSON.parse(utf8Decode(plaintext));
  }

  private async handleMessage(data: string): Promise<void> {
    const outer = JSON.parse(data);
    if (outer.type === "relay_disabled") throw new Error("Bridge is signaling-only: P2P required but unavailable");
    const payload = this.decrypt(outer.payload ?? outer);
    const requestId = payload.request_id;
    if (requestId && this.pending.has(requestId)) {
      const pending = this.pending.get(requestId)!;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      if (payload.type === "error") pending.reject(Object.assign(new Error(payload.message), { code: payload.code }));
      else pending.resolve(payload);
      return;
    }
    this.eventHandler?.(payload);
  }
}
