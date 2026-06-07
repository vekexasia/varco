import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { b64urlDecode, b64urlEncode, canonicalJson, utf8 } from "./encoding.js";
import type { StorageLike, VarcoManifest } from "./types.js";

export type ConsumerIdentity = { privateKey: string; publicKey: string };

const STORAGE_KEY = "varco.consumerIdentity.v1";

export function loadOrCreateIdentity(storage: StorageLike): ConsumerIdentity {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return JSON.parse(existing) as ConsumerIdentity;
  const privateBytes = ed25519.utils.randomSecretKey();
  const publicBytes = ed25519.getPublicKey(privateBytes);
  const identity = { privateKey: b64urlEncode(privateBytes), publicKey: b64urlEncode(publicBytes) };
  storage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function accessRequestBytes(nonce: string, manifest: VarcoManifest): Uint8Array {
  const digest = sha256(utf8(canonicalJson(manifest)));
  const prefix = utf8("varco-access-request-v1\0" + nonce + "\0");
  const out = new Uint8Array(prefix.length + digest.length);
  out.set(prefix);
  out.set(digest, prefix.length);
  return out;
}

export function signAccessRequest(identity: ConsumerIdentity, nonce: string, manifest: VarcoManifest): string {
  return b64urlEncode(ed25519.sign(accessRequestBytes(nonce, manifest), b64urlDecode(identity.privateKey)));
}


export function signAuthenticate(identity: ConsumerIdentity, nonce: string): string {
  return b64urlEncode(ed25519.sign(utf8("varco-authenticate-v1\0" + nonce), b64urlDecode(identity.privateKey)));
}

export function randomId(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return b64urlEncode(data);
}
