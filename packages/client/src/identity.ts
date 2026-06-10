import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { b64urlDecode, b64urlEncode, canonicalJson, utf8 } from "./encoding.js";
import { MemoryStorage } from "./memory-storage.js";
import type { StorageLike, VarcoManifest } from "./types.js";

export type ConsumerIdentity = {
  publicKey: string;
  sign(message: Uint8Array): Promise<string>;
};

const STORAGE_KEY = "varco.consumerIdentity.v1";
const DB_NAME = "varco-client";
const DB_STORE = "keys";
const DB_KEY = "consumerIdentity.v1";

function nobleIdentity(keys: { privateKey: string; publicKey: string }): ConsumerIdentity {
  return {
    publicKey: keys.publicKey,
    sign: async (message) => b64urlEncode(ed25519.sign(message, b64urlDecode(keys.privateKey))),
  };
}

function createNobleIdentity(storage: StorageLike): ConsumerIdentity {
  const privateBytes = ed25519.utils.randomSecretKey();
  const keys = { privateKey: b64urlEncode(privateBytes), publicKey: b64urlEncode(ed25519.getPublicKey(privateBytes)) };
  storage.setItem(STORAGE_KEY, JSON.stringify(keys));
  return nobleIdentity(keys);
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openKeyDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
  return idbRequest(request);
}

async function loadOrCreateWebCryptoIdentity(): Promise<ConsumerIdentity | null> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) return null;
  try {
    const db = await openKeyDb();
    let pair = await idbRequest<CryptoKeyPair | undefined>(db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY));
    if (!pair) {
      pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
      await idbRequest(db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(pair, DB_KEY));
    }
    const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    db.close();
    const privateKey = pair.privateKey;
    return {
      publicKey: b64urlEncode(publicBytes),
      sign: async (message) => b64urlEncode(new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, message as Uint8Array<ArrayBuffer>))),
    };
  } catch {
    return null;
  }
}

export function loadIdentitySync(storage?: StorageLike): ConsumerIdentity | null {
  const legacyStorage = storage ?? globalThis.localStorage;
  const existing = legacyStorage?.getItem(STORAGE_KEY);
  if (existing) return nobleIdentity(JSON.parse(existing));
  if (storage) return createNobleIdentity(storage);
  return null;
}

export async function loadOrCreateIdentity(storage?: StorageLike): Promise<ConsumerIdentity> {
  const sync = loadIdentitySync(storage);
  if (sync) return sync;
  const hardened = await loadOrCreateWebCryptoIdentity();
  if (hardened) return hardened;
  return createNobleIdentity(globalThis.localStorage ?? new MemoryStorage());
}

export function accessRequestBytes(nonce: string, manifest: VarcoManifest): Uint8Array {
  const digest = sha256(utf8(canonicalJson(manifest)));
  const prefix = utf8("varco-access-request-v1\0" + nonce + "\0");
  const out = new Uint8Array(prefix.length + digest.length);
  out.set(prefix);
  out.set(digest, prefix.length);
  return out;
}

export function signAccessRequest(identity: ConsumerIdentity, nonce: string, manifest: VarcoManifest): Promise<string> {
  return identity.sign(accessRequestBytes(nonce, manifest));
}

export function signAuthenticate(identity: ConsumerIdentity, nonce: string): Promise<string> {
  return identity.sign(utf8("varco-authenticate-v1\0" + nonce));
}

export function randomId(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return b64urlEncode(data);
}
