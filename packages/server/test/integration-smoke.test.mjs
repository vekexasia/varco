import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { ed25519 } from '@noble/curves/ed25519.js';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { gcm } from '@noble/ciphers/aes.js';
import { startNodeBridge } from '../../../bridge/dist/node.js';
import { challengePayload, PROTO_VERSION } from '../../../bridge/dist/logic.js';
import { createVarcoServer } from '../dist/index.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return Buffer.from(binary, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

// SPKI wrap/unwrap for uncompressed P-256 points, matching the client transport.
const SPKI_PREFIX = Uint8Array.from([48, 89, 48, 19, 6, 7, 42, 134, 72, 206, 61, 2, 1, 6, 8, 42, 134, 72, 206, 61, 3, 1, 7, 3, 66, 0]);
function spkiWrap(raw) { const out = new Uint8Array(SPKI_PREFIX.length + raw.length); out.set(SPKI_PREFIX); out.set(raw, SPKI_PREFIX.length); return out; }
function spkiUnwrap(spki) { return spki.slice(spki.length - 65); }

function deriveKeys(authorityPriv, clientSpki, authorityId) {
  const clientRaw = spkiUnwrap(clientSpki);
  const shared = p256.getSharedSecret(authorityPriv, clientRaw).slice(1); // X coordinate only
  const salt = b64urlDecode(authorityId);
  return {
    // From the Authority's view: it sends s2c (recv on client) and receives c2s (send on client).
    toClient: hkdf(sha256, shared, salt, enc.encode('varco-session-s2c-v1'), 32),
    fromClient: hkdf(sha256, shared, salt, enc.encode('varco-session-c2s-v1'), 32),
  };
}

function nonceBytes(value) { const out = new Uint8Array(12); new DataView(out.buffer).setUint32(8, value, false); return out; }

// Canonical JSON matching the client (ascii, sorted keys).
function canonicalJson(value) {
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${canonicalJson(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Stub Authority: connects to the bridge, completes the per-session encrypted
 * handshake with a connecting consumer, decrypts requests, and answers them.
 */
function startStubAuthority(bridgeUrl, authorityId, authoritySecret, onRequest) {
  const ws = new WebSocket(`${bridgeUrl}/authority/${authorityId}`);
  const sessions = new Map(); // sessionId -> { keys, sendNonce, recvNonce }
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'challenge') {
      ws.send(JSON.stringify({ type: 'auth', proto: PROTO_VERSION, signature: b64urlEncode(ed25519.sign(challengePayload(msg.nonce), authoritySecret)) }));
      return;
    }
    if (msg.type === 'client_message') {
      const payload = msg.payload;
      const sessionId = msg.sessionId;
      if (payload.type === 'client_hello') {
        const authPriv = p256.utils.randomSecretKey();
        const authPubSpki = spkiWrap(p256.getPublicKey(authPriv, false));
        const clientSpki = b64urlDecode(payload.client_pub);
        const keys = deriveKeys(authPriv, clientSpki, authorityId);
        // Sign the server_hello transcript the client verifies.
        const prefix = enc.encode('varco-server-hello-v1\0');
        const clientBytes = clientSpki;
        const transcript = new Uint8Array(prefix.length + clientBytes.length + 1 + authPubSpki.length);
        let off = 0; transcript.set(prefix, off); off += prefix.length; transcript.set(clientBytes, off); off += clientBytes.length; transcript[off] = 0; off += 1; transcript.set(authPubSpki, off);
        const signature = b64urlEncode(ed25519.sign(transcript, authoritySecret));
        sessions.set(sessionId, { keys, sendNonce: 0, recvNonce: 0 });
        ws.send(JSON.stringify({ type: 'authority_message', sessionId, payload: { type: 'server_hello', server_pub: b64urlEncode(authPubSpki), signature } }));
        return;
      }
      if (payload.type === 'ciphertext') {
        const s = sessions.get(sessionId);
        const n = b64urlDecode(payload.nonce);
        const plaintext = gcm(s.keys.fromClient, n).decrypt(b64urlDecode(payload.body));
        const request = JSON.parse(dec.decode(plaintext));
        const responseObj = onRequest(request);
        const reply = { ...responseObj, request_id: request.request_id };
        const outNonce = nonceBytes(s.sendNonce++);
        const body = gcm(s.keys.toClient, outNonce).encrypt(enc.encode(canonicalJson(reply)));
        ws.send(JSON.stringify({ type: 'authority_message', sessionId, payload: { type: 'ciphertext', nonce: b64urlEncode(outNonce), body: b64urlEncode(body) } }));
      }
    }
  });
  return { ws, ready: new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }) };
}

test('memory-bridge integration smoke: server fires a route through a real bridge to a stub authority', async () => {
  const bridge = await startNodeBridge({ port: 0 });
  const { port } = bridge.server.address();
  const bridgeUrl = `ws://127.0.0.1:${port}`;

  const authoritySecret = ed25519.utils.randomSecretKey();
  const authorityId = b64urlEncode(ed25519.getPublicKey(authoritySecret));
  const consumerSecret = ed25519.utils.randomSecretKey();
  const privateKey = b64urlEncode(consumerSecret);

  const calls = [];
  const authority = startStubAuthority(bridgeUrl, authorityId, authoritySecret, (request) => {
    if (request.type === 'authenticate') return { type: 'authenticated', grant_id: 'grant1', manifest: { name: 'srv', version: '1', read_entities: [] } };
    if (request.type === 'call_service') { calls.push(request); return { type: 'service_called', ok: true }; }
    return { type: 'error', code: 'unknown', message: `unexpected ${request.type}` };
  });
  await authority.ready;
  // Let the bridge register the authority before the consumer connects.
  await new Promise((r) => setTimeout(r, 50));

  const server = createVarcoServer({
    privateKey,
    authorityId,
    bridgeUrl,
    routes: [{ path: '/run', domain: 'switch', service: 'turn_on', target: { entity_id: 'switch.demo' } }],
    readyTimeoutMs: 3000,
  });

  try {
    await server.start();
    const res = await server.handle({ method: 'POST', path: '/run', query: {}, headers: {}, body: undefined, rawBody: '' });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].domain, 'switch');
    assert.equal(calls[0].service, 'turn_on');
    assert.deepEqual(calls[0].target, { entity_id: 'switch.demo' });
  } finally {
    await server.close();
    authority.ws.terminate();
    await bridge.close();
  }
});
