import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { NobleRelayTransport } from '../dist/index.js';
import { p256 } from '@noble/curves/p256.js';
import { ed25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2';
import { gcm } from '@noble/ciphers/aes.js';

const subtle = webcrypto.subtle;
const te = new TextEncoder();

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const b64urlDec = (value) => new Uint8Array(Buffer.from(value, 'base64url'));

const SPKI_PREFIX = Uint8Array.from(Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'));
const spkiWrap = (raw) => { const out = new Uint8Array(91); out.set(SPKI_PREFIX); out.set(raw, 26); return out; };

function counterNonce(value) {
  const out = new Uint8Array(12);
  new DataView(out.buffer).setUint32(8, value, false);
  return out;
}

// WebCrypto oracle: server-side ECDH + HKDF key schedule, mirroring transport.ts.
async function webcryptoDerive(serverPriv, clientSpki, authorityId) {
  const clientKey = await subtle.importKey('spki', clientSpki, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverPriv, 256);
  const material = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits']);
  const derive = async (info) => new Uint8Array(await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: b64urlDec(authorityId), info: te.encode(info) }, material, 256));
  return {
    c2s: await derive('varco-session-c2s-v1'),
    s2c: await derive('varco-session-s2c-v1'),
    binding: await derive('varco-channel-binding-v1'),
  };
}

test('noble key schedule is byte-identical to the WebCrypto oracle', async () => {
  const authorityId = b64url(webcrypto.getRandomValues(new Uint8Array(32)));
  const clientPriv = p256.utils.randomSecretKey();
  const clientSpki = spkiWrap(p256.getPublicKey(clientPriv, false));
  const server = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverSpki = new Uint8Array(await subtle.exportKey('spki', server.publicKey));

  const oracle = await webcryptoDerive(server.privateKey, clientSpki, authorityId);

  // Same derivation NobleRelayTransport performs internally.
  const shared = p256.getSharedSecret(clientPriv, serverSpki.slice(serverSpki.length - 65)).slice(1);
  const salt = b64urlDec(authorityId);
  assert.deepEqual(hkdf(sha256, shared, salt, te.encode('varco-session-c2s-v1'), 32), oracle.c2s);
  assert.deepEqual(hkdf(sha256, shared, salt, te.encode('varco-session-s2c-v1'), 32), oracle.s2c);
  assert.deepEqual(hkdf(sha256, shared, salt, te.encode('varco-channel-binding-v1'), 32), oracle.binding);
});

test('noble AES-GCM interops bidirectionally with WebCrypto using counter nonces', async () => {
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const webKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  for (let counter = 0; counter < 3; counter += 1) {
    const n = counterNonce(counter);
    const plaintext = te.encode(JSON.stringify({ type: 'ping', counter }));
    const fromNoble = gcm(key, n).encrypt(plaintext);
    assert.deepEqual(new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: n }, webKey, fromNoble)), plaintext);
    const fromWeb = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: n }, webKey, plaintext));
    assert.deepEqual(gcm(key, n).decrypt(fromWeb), plaintext);
    assert.deepEqual(fromNoble, fromWeb);
  }
});

// Fake bridge: WebSocket harness whose server side runs entirely on WebCrypto.
function makeFakeBridge() {
  const edPriv = ed25519.utils.randomSecretKey();
  const authorityId = b64url(ed25519.getPublicKey(edPriv));
  const state = { authorityId, requests: [], socket: null, keys: null, sendCounter: 0, recvCounter: 0 };

  state.push = async (payload) => {
    const n = counterNonce(state.sendCounter++);
    const key = await subtle.importKey('raw', state.keys.s2c, { name: 'AES-GCM' }, false, ['encrypt']);
    const body = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: n }, key, te.encode(JSON.stringify(payload))));
    state.socket.onmessage({ data: JSON.stringify({ type: 'ciphertext', nonce: b64url(n), body: b64url(body) }) });
  };

  class BridgeSocket {
    constructor(url) {
      state.socket = this;
      state.url = url;
      queueMicrotask(() => this.onopen?.());
    }
    send(data) { this.handle(JSON.parse(data)).catch((err) => { throw err; }); }
    close(code) { this.onclose?.({ code: code ?? 1000 }); }
    async handle(msg) {
      if (msg.type === 'client_hello') {
        const server = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        const serverSpki = new Uint8Array(await subtle.exportKey('spki', server.publicKey));
        const clientSpki = b64urlDec(msg.client_pub);
        state.keys = await webcryptoDerive(server.privateKey, clientSpki, authorityId);
        const prefix = te.encode('varco-server-hello-v1\0');
        const transcript = new Uint8Array(prefix.length + clientSpki.length + 1 + serverSpki.length);
        transcript.set(prefix); transcript.set(clientSpki, prefix.length);
        transcript.set(serverSpki, prefix.length + clientSpki.length + 1);
        this.onmessage({ data: JSON.stringify({
          type: 'server_hello',
          server_pub: b64url(serverSpki),
          signature: b64url(ed25519.sign(transcript, edPriv)),
        }) });
        return;
      }
      if (msg.type === 'ciphertext') {
        const n = b64urlDec(msg.nonce);
        assert.deepEqual(n, counterNonce(state.recvCounter++), 'client nonce counter');
        const key = await subtle.importKey('raw', state.keys.c2s, { name: 'AES-GCM' }, false, ['decrypt']);
        const plaintext = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: n }, key, b64urlDec(msg.body)));
        const payload = JSON.parse(Buffer.from(plaintext).toString('utf8'));
        state.requests.push({ payload, lane: msg.lane ?? null });
        await state.push({ type: 'pong', request_id: payload.request_id, echo: payload.type });
      }
    }
  }
  state.Socket = BridgeSocket;
  return state;
}

test('NobleRelayTransport runs the full protocol against a WebCrypto fake bridge', async () => {
  const bridge = makeFakeBridge();
  const previousWs = globalThis.WebSocket;
  globalThis.WebSocket = bridge.Socket;
  try {
    const transport = new NobleRelayTransport('ws://bridge/', bridge.authorityId, {
      randomBytes: (n) => webcrypto.getRandomValues(new Uint8Array(n)),
    });
    const events = [];
    transport.onEvent((event) => events.push(event));

    const binding = await transport.channelBinding();
    assert.equal(binding, b64url(bridge.keys.binding), 'channel binding matches WebCrypto derivation');
    assert.equal(bridge.url, `ws://bridge/consumer/${encodeURIComponent(bridge.authorityId)}`);

    const reply1 = await transport.request({ type: 'access_request' });
    assert.equal(reply1.type, 'pong');
    assert.equal(reply1.echo, 'access_request');
    assert.equal(bridge.requests[0].lane, 'signaling');

    const reply2 = await transport.request({ type: 'get_states', unicode: 'caffè ☕' });
    assert.equal(reply2.echo, 'get_states');
    assert.equal(bridge.requests[1].lane, null);
    assert.equal(bridge.requests[1].payload.unicode, 'caffè ☕', 'pure-JS utf8 encode round-trips via WebCrypto decrypt');

    // Unsolicited server payload reaches the event handler.
    await bridge.push({ type: 'state_changed', entity: 'light.kitchen' });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'state_changed');

    await transport.close();
    await assert.rejects(() => transport.request({ type: 'late' }), /closed/);
  } finally {
    globalThis.WebSocket = previousWs;
  }
});

test('NobleRelayTransport without randomness source fails clearly', async () => {
  const previousCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const transport = new NobleRelayTransport('ws://bridge/', b64url(new Uint8Array(32)));
    await assert.rejects(() => transport.channelBinding(), /randomBytes/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: previousCrypto, configurable: true });
  }
});
