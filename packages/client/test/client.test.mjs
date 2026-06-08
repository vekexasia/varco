import test from 'node:test';
import assert from 'node:assert/strict';
import { createVarcoClient, createVarcoConsumerClient, MemoryStorage } from '../dist/index.js';

class FakeTransport {
  constructor() { this.messages = []; this.handler = null; this.next = new Map(); }
  onEvent(handler) { this.handler = handler; }
  async request(message) {
    this.messages.push(message);
    if (message.type === 'access_request') return { type: 'access_request_pending', request_id: 'req1', pairing_code: '123456', status: 'pending' };
    if (message.type === 'authenticate') return { type: 'authenticated', grant_id: 'req1' };
    if (message.type === 'get_states') return { type: 'states', states: { 'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: {} } } };
    if (message.type === 'subscribe_states') return { type: 'state_snapshot', subscription_id: 'sub1', states: {} };
    if (message.type === 'unsubscribe_states') return { type: 'unsubscribed' };
    if (message.type === 'history_query') return { type: 'history_result', history: { 'sensor.temp': [] } };
    if (message.type === 'camera_snapshot') return { type: 'camera_snapshot', content_type: 'image/jpeg', body: 'abc' };
    if (message.type === 'call_service') return { type: 'service_called', ok: true };
    throw new Error(message.type);
  }
}

test('consumer client uses explicit Home Assistant frontend session without relay options', async () => {
  const hass = {
    states: {
      'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: {} },
    },
  };
  const client = createVarcoConsumerClient({ hass });

  assert.deepEqual(await client.requestAccess(), {
    request_id: 'local',
    pairing_code: '',
    status: 'approved',
    mode: 'home-assistant',
  });
  await client.connect();
  assert.deepEqual(await client.getStates(['sensor.temp', 'sensor.missing']), {
    'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: {} },
    'sensor.missing': null,
  });
});

test('local Home Assistant subscriptions emit relay-shaped snapshots and deltas', async () => {
  const client = createVarcoConsumerClient({
    hass: {
      states: {
        'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: { unit_of_measurement: '°C' } },
        'light.kitchen': { entity_id: 'light.kitchen', state: 'off', attributes: {} },
      },
    },
  });
  const events = [];
  const subscriptionId = await client.subscribeEntities(['sensor.temp', 'sensor.missing'], (event) => events.push(event));

  assert.equal(events[0].type, 'state_snapshot');
  assert.equal(events[0].subscription_id, subscriptionId);
  assert.deepEqual(events[0].states, {
    'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: { unit_of_measurement: '°C' } },
    'sensor.missing': null,
  });

  client.updateHass({
    states: {
      'sensor.temp': { entity_id: 'sensor.temp', state: '22', attributes: { unit_of_measurement: '°C' } },
      'light.kitchen': { entity_id: 'light.kitchen', state: 'on', attributes: {} },
    },
  });
  assert.equal(events[1].type, 'state_delta');
  assert.equal(events[1].subscription_id, subscriptionId);
  assert.deepEqual(events[1].states, {
    'sensor.temp': { entity_id: 'sensor.temp', state: '22', attributes: { unit_of_measurement: '°C' } },
  });

  await client.unsubscribe(subscriptionId);
  client.updateHass({
    states: {
      'sensor.temp': { entity_id: 'sensor.temp', state: '23', attributes: { unit_of_measurement: '°C' } },
    },
  });
  assert.equal(events.length, 2);
});

test('local Home Assistant service calls use the frontend service API', async () => {
  const calls = [];
  const client = createVarcoConsumerClient({
    hass: {
      states: {},
      callService: async (...args) => calls.push(args),
    },
  });

  await client.callService('light', 'turn_on', { entity_id: 'light.kitchen', brightness_pct: 50 });

  assert.deepEqual(calls, [[
    'light',
    'turn_on',
    { brightness_pct: 50 },
    { entity_id: 'light.kitchen' },
  ]]);
});

test('local Home Assistant history uses websocket history command and reports unavailable errors clearly', async () => {
  const messages = [];
  const client = createVarcoConsumerClient({
    hass: {
      states: {},
      callWS: async (message) => {
        messages.push(message);
        if (message.start_time === 'bad') throw new Error('recorder disabled');
        return { 'sensor.temp': [{ state: '21' }] };
      },
    },
  });

  assert.deepEqual(await client.queryHistory(['sensor.temp'], { start_time: '2026-06-08T00:00:00.000Z', end_time: '2026-06-08T01:00:00.000Z' }), {
    'sensor.temp': [{ state: '21' }],
  });
  assert.deepEqual(messages[0], {
    type: 'history/history_during_period',
    entity_ids: ['sensor.temp'],
    start_time: '2026-06-08T00:00:00.000Z',
    end_time: '2026-06-08T01:00:00.000Z',
    minimal_response: true,
  });

  await assert.rejects(
    () => client.queryHistory(['sensor.temp'], { start_time: 'bad' }),
    (err) => err.code === 'local-history-unavailable' && err.message.includes('recorder disabled'),
  );
});

test('consumer client chooses local mode when hass is explicit and otherwise uses relay defaults', async () => {
  const localTransport = new FakeTransport();
  const local = createVarcoConsumerClient({
    hass: { states: { 'sensor.local': { entity_id: 'sensor.local', state: 'ok', attributes: {} } } },
    authorityId: 'authority',
    bridgeUrl: 'ws://bridge',
    manifest: { name: 'Remote', version: '1', read_entities: ['sensor.remote'] },
    transport: localTransport,
  });
  assert.equal((await local.getStates(['sensor.local']))['sensor.local'].state, 'ok');
  assert.equal(localTransport.messages.length, 0);

  const relayTransport = new FakeTransport();
  const relay = createVarcoConsumerClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', transport: relayTransport, storage: new MemoryStorage() });
  await relay.requestAccess();
  await relay.connect();
  assert.deepEqual(relayTransport.messages[0].manifest, {
    name: 'Varco consumer',
    version: '0.1.0',
    read_entities: [],
    subscriptions: [],
    history: [],
    camera_snapshots: [],
    actions: [],
  });
  assert.equal(relayTransport.messages[1].type, 'authenticate');
});

test('requestAccess persists identity and sends signed manifest access request', async () => {
  const transport = new FakeTransport();
  const storage = new MemoryStorage();
  const manifest = { name: 'Demo', version: '1', read_entities: ['sensor.temp'] };
  const client = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest, storage, transport });
  const result = await client.requestAccess();
  assert.equal(result.pairing_code, '123456');
  assert.equal(transport.messages[0].type, 'access_request');
  assert.equal(transport.messages[0].manifest, manifest);
  assert.equal(typeof transport.messages[0].signature, 'string');
  assert.equal(client.consumerPublicKey, createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest, storage, transport: new FakeTransport() }).consumerPublicKey);
});

test('client exposes Varco-native data-plane API and duplicate subscription warning', async () => {
  const warnings = [];
  const transport = new FakeTransport();
  const client = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, transport, storage: new MemoryStorage(), warn: (msg) => warnings.push(msg) });
  await client.connect();
  assert.equal((await client.getStates(['sensor.temp']))['sensor.temp'].state, '21');
  const events = [];
  assert.equal(await client.subscribeEntities(['sensor.temp'], (event) => events.push(event)), 'sub1');
  assert.equal(await client.subscribeEntities(['sensor.temp'], () => {}), 'sub1');
  assert.equal(warnings.length, 1);
  await client.unsubscribe('sub1');
  assert.deepEqual(await client.queryHistory(['sensor.temp']), { 'sensor.temp': [] });
  assert.equal((await client.cameraSnapshot('camera.porta')).contentType, 'image/jpeg');
  await client.callService('light', 'turn_on', { entity_id: 'light.cucina', brightness: 100 });
  assert.equal(transport.messages.at(-1).target.entity_id, 'light.cucina');
});

test('client upgrades to WebRTC data channel and reports p2p transport status', async () => {
  const previous = globalThis.RTCPeerConnection;
  const statuses = [];
  class FakeDataChannel {
    constructor() { this.listeners = {}; this.readyState = 'connecting'; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    send(data) {
      const request = JSON.parse(data);
      this.listeners.message({ data: JSON.stringify({ type: 'states', request_id: request.request_id, states: { 'sensor.temp': { entity_id: 'sensor.temp', state: 'p2p', attributes: {} } } }) });
    }
    open() { this.readyState = 'open'; this.listeners.open?.(); }
  }
  class FakePeerConnection {
    constructor() { this.iceGatheringState = 'complete'; this.channel = null; }
    createDataChannel() { this.channel = new FakeDataChannel(); return this.channel; }
    async createOffer() { return { type: 'offer', sdp: 'offer-sdp' }; }
    async setLocalDescription(desc) { this.localDescription = desc; }
    async setRemoteDescription(desc) { this.remoteDescription = desc; setTimeout(() => this.channel.open(), 0); }
    addEventListener() {}
    close() {}
  }
  globalThis.RTCPeerConnection = FakePeerConnection;
  const transport = new FakeTransport();
  const originalRequest = transport.request.bind(transport);
  transport.request = async (message) => {
    if (message.type === 'webrtc_offer') return { type: 'webrtc_answer', sdp: 'answer-sdp', sdp_type: 'answer', transport: 'p2p' };
    return originalRequest(message);
  };
  const client = createVarcoClient({
    authorityId: 'authority',
    bridgeUrl: 'ws://bridge',
    manifest: { name: 'Demo', version: '1' },
    transport,
    storage: new MemoryStorage(),
    onTransportStatus: (status) => statuses.push(status),
  });
  await client.connect();
  assert.equal(statuses.at(-1).mode, 'p2p');
  assert.equal((await client.getStates(['sensor.temp']))['sensor.temp'].state, 'p2p');
  globalThis.RTCPeerConnection = previous;
});
