import test from 'node:test';
import assert from 'node:assert/strict';
import { createVarcoClient, MemoryStorage } from '../dist/index.js';

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
