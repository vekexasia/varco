import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HA_URL, DEFAULT_HA_USERNAME, DEFAULT_HA_PASSWORD, HomeAssistantAdminClient, loginToHomeAssistant } from '../lib/ha-admin.mjs';

test('development Home Assistant credentials are fixed for local automation', () => {
  assert.equal(DEFAULT_HA_URL, 'http://127.0.0.1:8123');
  assert.equal(DEFAULT_HA_USERNAME, 'test');
  assert.equal(DEFAULT_HA_PASSWORD, 'test');
});

test('loginToHomeAssistant uses the real Home Assistant auth flow and returns an access token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/login_flow')) {
      return Response.json({ flow_id: 'flow-1' });
    }
    if (String(url).endsWith('/auth/login_flow/flow-1')) {
      return Response.json({ result: 'auth-code' });
    }
    if (String(url).endsWith('/auth/token')) {
      assert.equal(options.method, 'POST');
      assert.equal(new URLSearchParams(options.body).get('code'), 'auth-code');
      return Response.json({ access_token: 'token-1' });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  assert.equal(await loginToHomeAssistant({ fetchImpl }), 'token-1');
  assert.deepEqual(calls.map((call) => call.url), [
    'http://127.0.0.1:8123/auth/login_flow',
    'http://127.0.0.1:8123/auth/login_flow/flow-1',
    'http://127.0.0.1:8123/auth/token',
  ]);
});

test('HomeAssistantAdminClient authenticates and sends numbered WebSocket commands', async () => {
  const socket = new FakeWebSocket('ws://ignored');
  const client = new HomeAssistantAdminClient({ url: 'http://ha.local:8123', token: 'token-1', WebSocketImpl: class { constructor(url) { socket.url = url; return socket; } } });
  const infoPromise = client.command('varco/info');

  socket.open();
  socket.receive({ type: 'auth_required' });
  assert.deepEqual(socket.sent.shift(), { type: 'auth', access_token: 'token-1' });
  socket.receive({ type: 'auth_ok' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(socket.sent.shift(), { id: 1, type: 'varco/info' });
  socket.receive({ id: 1, type: 'result', success: true, result: { authority_id: 'auth-1' } });

  assert.deepEqual(await infoPromise, { authority_id: 'auth-1' });
  assert.equal(socket.url, 'ws://ha.local:8123/api/websocket');
});

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  open() {
    this.onopen?.();
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.onclose?.();
  }
}
