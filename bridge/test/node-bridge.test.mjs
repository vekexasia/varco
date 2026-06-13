import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { WebSocket } from 'ws';
import { startNodeBridge } from '../dist/node.js';
import { b64urlEncode, challengePayload, PROTO_VERSION } from '../dist/logic.js';

function makeAuthority() {
  const secretKey = ed25519.utils.randomSecretKey();
  const authorityId = b64urlEncode(ed25519.getPublicKey(secretKey));
  return { secretKey, authorityId };
}

const loopbackHost = ['127', '0', '0', '1'].join('.');

function wsUrl(server, path) {
  const { port } = server.address();
  return `ws:${'//'}${loopbackHost}:${port}${path}`;
}

function httpUrl(server, path) {
  const { port } = server.address();
  return `http:${'//'}${loopbackHost}:${port}${path}`;
}
function withTimeout(promise, label, ms = 2000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

async function openWs(url, origin) {
  const ws = new WebSocket(url, origin ? { headers: { Origin: origin } } : undefined);
  await withTimeout(new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  }), `open ${url}`);
  return ws;
}

function nextMessage(ws) {
  return withTimeout(new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data.toString())))), 'websocket message');
}

function closeEvent(ws) {
  return withTimeout(new Promise((resolve) => ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))), 'websocket close');
}

function disposeWs(ws) {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) ws.terminate();
}

async function authedAuthority(server, authority) {
  const url = wsUrl(server, `/authority/${authority.authorityId}`);
  const ws = new WebSocket(url);
  const challengePromise = nextMessage(ws);
  await withTimeout(new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  }), `open ${url}`);
  const challenge = await challengePromise;
  assert.equal(challenge.type, 'challenge');
  assert.equal(challenge.proto, PROTO_VERSION);
  ws.send(JSON.stringify({
    type: 'auth',
    proto: PROTO_VERSION,
    signature: b64urlEncode(ed25519.sign(challengePayload(challenge.nonce), authority.secretKey)),
  }));
  assert.deepEqual(await nextMessage(ws), { type: 'ready' });
  return ws;
}

test('node bridge reports health and offline/online presence', async () => {
  const bridge = await startNodeBridge({ port: 0 });
  try {
    const authority = makeAuthority();
    assert.deepEqual(await (await fetch(httpUrl(bridge.server, '/health'))).json(), { ok: true });
    assert.deepEqual(await (await fetch(httpUrl(bridge.server, `/presence/${authority.authorityId}`))).json(), { online: false });
    const ws = await authedAuthority(bridge.server, authority);
    assert.deepEqual(await (await fetch(httpUrl(bridge.server, `/presence/${authority.authorityId}`))).json(), { online: true });
    disposeWs(ws);
  } finally {
    await bridge.close();
  }
});

test('node bridge relays opaque payloads between consumer and authority', async () => {
  const bridge = await startNodeBridge({ port: 0 });
  try {
    const authority = makeAuthority();
    const authorityWs = await authedAuthority(bridge.server, authority);
    const connectedPromise = nextMessage(authorityWs);
    const consumerWs = await openWs(wsUrl(bridge.server, `/consumer/${authority.authorityId}`));
    const connected = await connectedPromise;
    assert.equal(connected.type, 'client_connected');
    assert.equal(typeof connected.sessionId, 'string');

    consumerWs.send(JSON.stringify({ type: 'ciphertext', nonce: 'n1', body: 'from-consumer' }));
    assert.deepEqual(await nextMessage(authorityWs), {
      type: 'client_message',
      sessionId: connected.sessionId,
      payload: { type: 'ciphertext', nonce: 'n1', body: 'from-consumer' },
    });

    authorityWs.send(JSON.stringify({ type: 'authority_message', sessionId: connected.sessionId, payload: { type: 'ciphertext', nonce: 'n2', body: 'from-authority' } }));
    assert.deepEqual(await nextMessage(consumerWs), {
      type: 'authority_message',
      payload: { type: 'ciphertext', nonce: 'n2', body: 'from-authority' },
    });

    disposeWs(consumerWs);
    disposeWs(authorityWs);
  } finally {
    await bridge.close();
  }
});

test('node bridge matches authority replacement and signaling-only close behavior', async () => {
  const bridge = await startNodeBridge({ port: 0, env: { BRIDGE_MODE: 'signaling-only', MAX_SIGNALING_MESSAGES: '1' } });
  try {
    const authority = makeAuthority();
    const firstAuthority = await authedAuthority(bridge.server, authority);
    const firstConnectedPromise = nextMessage(firstAuthority);
    const consumerWs = await openWs(wsUrl(bridge.server, `/consumer/${authority.authorityId}`));
    await firstConnectedPromise;

    const firstClosePromise = closeEvent(firstAuthority);
    const consumerClosePromise = closeEvent(consumerWs);
    const secondAuthority = await authedAuthority(bridge.server, authority);
    const firstClose = await firstClosePromise;
    const consumerClose = await consumerClosePromise;
    assert.equal(firstClose.code, 4409);
    assert.equal(consumerClose.code, 4404);

    const secondConnectedPromise = nextMessage(secondAuthority);
    const nextConsumer = await openWs(wsUrl(bridge.server, `/consumer/${authority.authorityId}`));
    await secondConnectedPromise;
    const blockedMessagePromise = nextMessage(nextConsumer);
    const blockedClosePromise = closeEvent(nextConsumer);
    nextConsumer.send(JSON.stringify({ type: 'ciphertext', nonce: 'n1', body: 'blocked' }));
    const blocked = await blockedMessagePromise;
    assert.deepEqual(blocked, { type: 'relay_disabled' });
    const blockedClose = await blockedClosePromise;
    assert.equal(blockedClose.code, 4405);

    disposeWs(secondAuthority);
  } finally {
    await bridge.close();
  }
});
