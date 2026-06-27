import test from 'node:test';
import assert from 'node:assert/strict';
import { createVarcoServer } from '../dist/index.js';

// base64url 32-byte key (all zeros is a valid Ed25519 seed for our purposes).
const PRIVATE_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const AUTHORITY_ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Minimal fake transport: completes authenticate, records call_service, lets us
// drive readiness and failures without a real bridge.
class FakeTransport {
  constructor() { this.calls = []; this.failNext = null; }
  onEvent() {}
  onClose() {}
  async channelBinding() { return 'binding'; }
  async request(message) {
    if (message.type === 'authenticate') return { type: 'authenticated', grant_id: 'g1', manifest: { name: 'm', version: '1', read_entities: [] } };
    if (message.type === 'grant_info') return { type: 'grant_info', grant_id: 'g1', manifest: { name: 'm', version: '1', read_entities: [] } };
    if (message.type === 'access_request') return { type: 'access_request_pending', access_request_id: 'req1', pairing_code: '123456', status: 'pending' };
    if (message.type === 'call_service') {
      this.calls.push(message);
      if (this.failNext) { const err = this.failNext; this.failNext = null; throw err; }
      return { type: 'service_called', ok: true };
    }
    throw new Error(`unexpected ${message.type}`);
  }
  async close() {}
}

function newServer(extra = {}) {
  const transport = new FakeTransport();
  const server = createVarcoServer({
    privateKey: PRIVATE_KEY,
    authorityId: AUTHORITY_ID,
    bridgeUrl: 'wss://unused',
    transport,
    ...extra,
  });
  return { server, transport };
}

test('static Route fires the mapped service and returns JSON ok', async () => {
  const { server, transport } = newServer({
    routes: [{ path: '/lights/on', domain: 'light', service: 'turn_on', target: { entity_id: 'light.kitchen' }, service_data: { brightness: 200 } }],
  });
  await server.start();
  const res = await server.handle({ method: 'POST', path: '/lights/on', query: {}, headers: {}, body: undefined, rawBody: '' });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0].domain, 'light');
  assert.equal(transport.calls[0].service, 'turn_on');
  assert.deepEqual(transport.calls[0].target, { entity_id: 'light.kitchen' });
  assert.deepEqual(transport.calls[0].service_data, { brightness: 200 });
  await server.close();
});

test('unknown path returns 404 without waiting for the connection', async () => {
  const { server } = newServer();
  const res = await server.handle({ method: 'POST', path: '/nope', query: {}, headers: {}, body: undefined, rawBody: '' });
  assert.equal(res.status, 404);
  await server.close();
});

test('method must match the route', async () => {
  const { server } = newServer({ routes: [{ path: '/x', method: 'GET', domain: 'switch', service: 'turn_on', target: { entity_id: 'switch.a' } }] });
  await server.start();
  const res = await server.handle({ method: 'POST', path: '/x', query: {}, headers: {}, body: undefined, rawBody: '' });
  assert.equal(res.status, 404);
  await server.close();
});

test('request before the connection is ready returns 503 on timeout', async () => {
  // No start(): the connection never becomes ready.
  const { server } = newServer({ routes: [{ path: '/p', domain: 'light', service: 'turn_on', target: { entity_id: 'light.a' } }], readyTimeoutMs: 50 });
  const res = await server.handle({ method: 'POST', path: '/p', query: {}, headers: {}, body: undefined, rawBody: '' });
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).error, 'unavailable');
  await server.close();
});

test('Handler receives the request and client, and its JSON value is returned', async () => {
  const { server } = newServer({
    handlers: [{ path: '/echo', handle: async (req) => ({ got: req.body, q: req.query.x }) }],
  });
  await server.start();
  const res = await server.handle({ method: 'POST', path: '/echo', query: { x: '1' }, headers: { 'content-type': 'application/json' }, body: { a: 2 }, rawBody: '{"a":2}' });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { got: { a: 2 }, q: '1' });
  await server.close();
});

test('Handler can set an explicit status and string body', async () => {
  const { server } = newServer({
    handlers: [{ path: '/deny', handle: () => ({ status: 401, body: 'nope' }) }],
  });
  await server.start();
  const res = await server.handle({ method: 'POST', path: '/deny', query: {}, headers: {}, body: undefined, rawBody: '' });
  assert.equal(res.status, 401);
  assert.equal(res.body, 'nope');
  assert.match(res.headers['content-type'], /text\/plain/);
  await server.close();
});

test('a denied service call maps to 403', async () => {
  const { server, transport } = newServer({ routes: [{ path: '/lock', domain: 'lock', service: 'unlock', target: { entity_id: 'lock.door' } }] });
  await server.start();
  transport.failNext = Object.assign(new Error('PIN required'), { code: 'pin_required' });
  const res = await server.handle({ method: 'POST', path: '/lock', query: {}, headers: {}, body: undefined, rawBody: '' });
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, 'service_failed');
  await server.close();
});

test('requestPairing requires a manifest', async () => {
  const { server } = newServer();
  await assert.rejects(() => server.requestPairing(), /requires a manifest/);
  await server.close();
});

test('requestPairing returns the access request pairing code when a manifest is configured', async () => {
  const { server } = newServer({ manifest: { name: 'Server', version: '1', read_entities: [], subscriptions: [], history: [], camera_snapshots: [], actions: [] } });
  assert.deepEqual(await server.requestPairing(), { request_id: 'req1', pairing_code: '123456', status: 'pending' });
  await server.close();
});

test('listen() serves real HTTP requests with parsed query and JSON body', async () => {
  const { server } = newServer({
    handlers: [{ path: '/echo', handle: (req) => ({ method: req.method, path: req.path, query: req.query, gotBody: req.body }) }],
  });
  await server.start();
  const httpServer = await server.listen(0, '127.0.0.1');
  const { port } = httpServer.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/echo?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { method: 'POST', path: '/echo', query: { x: '1' }, gotBody: { ok: true } });
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    await server.close();
  }
});

test('factory validates required options', () => {
  assert.throws(() => createVarcoServer({ privateKey: '', authorityId: 'a', bridgeUrl: 'b' }), /private key/);
  assert.throws(() => createVarcoServer({ privateKey: 'k', authorityId: '', bridgeUrl: 'b' }), /authorityId/);
  assert.throws(() => createVarcoServer({ privateKey: 'k', authorityId: 'a', bridgeUrl: '' }), /bridgeUrl/);
});
