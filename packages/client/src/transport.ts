import { ed25519 } from "@noble/curves/ed25519";
import { b64urlDecode, b64urlEncode, canonicalJson, utf8 } from "./encoding.js";
import { randomId } from "./identity.js";
import type { VarcoTransport } from "./types.js";

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function wsUrl(base: string, authorityId: string): string {
  const clean = base.replace(/\/$/, "");
  return `${clean}/consumer/${encodeURIComponent(authorityId)}`;
}

async function importServerPublic(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", bufferSource(b64urlDecode(spki)), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function exportPublic(key: CryptoKey): Promise<string> {
  return b64urlEncode(new Uint8Array(await crypto.subtle.exportKey("spki", key)));
}

async function deriveHkdf(material: CryptoKey, authorityId: string, info: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: bufferSource(b64urlDecode(authorityId)), info: bufferSource(utf8(info)) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

type SessionKeys = { send: CryptoKey; recv: CryptoKey; channelBinding: string };

async function deriveSessionKeys(privateKey: CryptoKey, publicKey: CryptoKey, authorityId: string): Promise<SessionKeys> {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey", "deriveBits"]);
  const send = await deriveHkdf(material, authorityId, "varco-session-c2s-v1", ["encrypt"]);
  const recv = await deriveHkdf(material, authorityId, "varco-session-s2c-v1", ["decrypt"]);
  const bindingBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: bufferSource(b64urlDecode(authorityId)), info: bufferSource(utf8("varco-channel-binding-v1")) },
    material,
    256,
  );
  return { send, recv, channelBinding: b64urlEncode(new Uint8Array(bindingBits)) };
}

function nonce(value: number): Uint8Array {
  const out = new Uint8Array(12);
  new DataView(out.buffer).setUint32(8, value, false);
  return out;
}

export class RelayTransport implements VarcoTransport {
  private ws: WebSocket | null = null;
  private keys: SessionKeys | null = null;
  private sendNonce = 0;
  private recvNonce = 0;
  private pending = new Map<string, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private eventHandler: ((event: any) => void) | null = null;
  private ready: Promise<void> | null = null;

  constructor(private bridgeUrl: string, private authorityId: string) {}

  onEvent(handler: (event: any) => void): void { this.eventHandler = handler; }

  async channelBinding(): Promise<string> {
    await this.ensureConnected();
    return this.keys!.channelBinding;
  }

  async request(message: Record<string, unknown>): Promise<any> {
    await this.ensureConnected();
    const requestId = (message.request_id as string | undefined) ?? randomId(8);
    const withId = { ...message, request_id: requestId };
    const encrypted = await this.encrypt(withId);
    this.ws?.send(JSON.stringify(encrypted));
    return new Promise((resolve, reject) => this.pending.set(requestId, { resolve, reject }));
  }

  async close(): Promise<void> { this.ws?.close(); }

  private async ensureConnected(): Promise<void> {
    if (!this.ready) this.ready = this.connect();
    await this.ready;
  }

  private async connect(): Promise<void> {
    const ecdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const clientPub = await exportPublic(ecdh.publicKey);
    const ws = new WebSocket(wsUrl(this.bridgeUrl, this.authorityId));
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => ws.send(JSON.stringify({ type: "client_hello", client_pub: clientPub }));
      ws.onerror = () => reject(new Error("Varco WebSocket failed"));
      ws.onmessage = async (event) => {
        try {
          const outer = JSON.parse(String(event.data));
          const payload = outer.payload ?? outer;
          if (payload.type === "server_hello") {
            const serverPubBytes = b64urlDecode(payload.server_pub);
            const transcript = new Uint8Array(utf8("varco-server-hello-v1\0").length + b64urlDecode(clientPub).length + 1 + serverPubBytes.length);
            let offset = 0;
            const prefix = utf8("varco-server-hello-v1\0"); transcript.set(prefix, offset); offset += prefix.length;
            const clientBytes = b64urlDecode(clientPub); transcript.set(clientBytes, offset); offset += clientBytes.length;
            transcript[offset] = 0; offset += 1;
            transcript.set(serverPubBytes, offset);
            if (!ed25519.verify(b64urlDecode(payload.signature), transcript, b64urlDecode(this.authorityId))) throw new Error("Bad authority signature");
            this.keys = await deriveSessionKeys(ecdh.privateKey, await importServerPublic(payload.server_pub), this.authorityId);
            ws.onmessage = (messageEvent) => { void this.handleMessage(String(messageEvent.data)); };
            resolve();
          }
        } catch (err) { reject(err as Error); }
      };
    });
  }

  private async encrypt(payload: Record<string, unknown>): Promise<Record<string, string>> {
    if (!this.keys) throw new Error("Varco session is not ready");
    const n = nonce(this.sendNonce++);
    const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferSource(n) }, this.keys.send, bufferSource(utf8(canonicalJson(payload)))));
    return { type: "ciphertext", nonce: b64urlEncode(n), body: b64urlEncode(body) };
  }

  private async decrypt(envelope: any): Promise<any> {
    if (!this.keys) throw new Error("Varco session is not ready");
    const n = b64urlDecode(envelope.nonce);
    const expected = nonce(this.recvNonce++);
    if (n.some((value, index) => value !== expected[index])) throw new Error("Unexpected nonce");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bufferSource(n) }, this.keys.recv, bufferSource(b64urlDecode(envelope.body)));
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  private async handleMessage(data: string): Promise<void> {
    const outer = JSON.parse(data);
    const payload = await this.decrypt(outer.payload ?? outer);
    const requestId = payload.request_id;
    let pendingKey = requestId && this.pending.has(requestId) ? requestId : undefined;
    if (!pendingKey && this.pending.size === 1 && payload.type !== "state_delta") pendingKey = this.pending.keys().next().value;
    if (pendingKey) {
      const pending = this.pending.get(pendingKey)!;
      this.pending.delete(pendingKey);
      if (payload.type === "error") pending.reject(Object.assign(new Error(payload.message), { code: payload.code }));
      else pending.resolve(payload);
      return;
    }
    this.eventHandler?.(payload);
  }
}
