import test from 'node:test';
import assert from 'node:assert/strict';
import { buttonControl, cameraEntity, createManifest, createVarcoClient, createVarcoConsumerClient, fanControl, lightControl, climateControl, coverControl, lockControl, mediaPlayerControl, MemoryStorage, numberControl, readEntity, sceneControl, selectControl, switchControl } from '../dist/index.js';

class FakeTransport {
  constructor() { this.messages = []; this.handler = null; this.next = new Map(); }
  onEvent(handler) { this.handler = handler; }
  async request(message) {
    this.messages.push(message);
    if (message.type === 'access_request') return { type: 'access_request_pending', request_id: message.request_id, access_request_id: 'req1', pairing_code: '123456', status: 'pending' };
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

test('domain helpers work in local Home Assistant mode', async () => {
  const calls = [];
  const client = createVarcoConsumerClient({
    hass: {
      states: { 'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: {} } },
      callService: async (...args) => calls.push(args),
    },
  });

  assert.equal((await client.entity.get('sensor.temp')).state, '21');
  await client.climate.setHvacMode('climate.living_room', 'cool');

  assert.deepEqual(calls, [[
    'climate',
    'set_hvac_mode',
    { hvac_mode: 'cool' },
    { entity_id: 'climate.living_room' },
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
  await client.queryHistory(Array.from({ length: 11 }, (_, i) => `sensor.t${i}`));
  assert.ok(warnings.at(-1).includes('limit of 10'));
  await client.queryHistory(['sensor.temp'], { start_time: '2020-01-01T00:00:00.000Z', end_time: '2020-03-01T00:00:00.000Z' });
  assert.ok(warnings.at(-1).includes('30 days'));
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

test('domain helpers call Home Assistant services with expected payloads', async () => {
  const transport = new FakeTransport();
  const client = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, transport, storage: new MemoryStorage(), webrtc: false });
  await client.connect();

  await client.light.setBrightness('light.kitchen', 42);
  await client.switch.toggle('switch.pc');
  await client.climate.setTemperature('climate.living_room', 21, { hvac_mode: 'heat' });
  await client.climate.setTemperatureRange('climate.bedroom', 18, 22, { hvac_mode: 'heat_cool' });
  await client.cover.setPosition('cover.awning', 60);
  await client.fan.oscillate('fan.bedroom', true);
  await client.lock.lock('lock.front_door');
  await client.mediaPlayer.setVolume('media_player.tv', 0.3);
  await client.button.press('button.restart');
  await client.scene.turnOn('scene.movie');
  await client.number.setValue('number.limit', 7);
  await client.select.selectOption('select.mode', 'eco');

  const calls = transport.messages.filter((message) => message.type === 'call_service');
  assert.deepEqual(calls.map(({ domain, service, target, service_data }) => ({ domain, service, target, service_data })), [
    { domain: 'light', service: 'turn_on', target: { entity_id: 'light.kitchen' }, service_data: { brightness_pct: 42 } },
    { domain: 'switch', service: 'toggle', target: { entity_id: 'switch.pc' }, service_data: {} },
    { domain: 'climate', service: 'set_temperature', target: { entity_id: 'climate.living_room' }, service_data: { temperature: 21, hvac_mode: 'heat' } },
    { domain: 'climate', service: 'set_temperature', target: { entity_id: 'climate.bedroom' }, service_data: { target_temp_low: 18, target_temp_high: 22, hvac_mode: 'heat_cool' } },
    { domain: 'cover', service: 'set_cover_position', target: { entity_id: 'cover.awning' }, service_data: { position: 60 } },
    { domain: 'fan', service: 'oscillate', target: { entity_id: 'fan.bedroom' }, service_data: { oscillating: true } },
    { domain: 'lock', service: 'lock', target: { entity_id: 'lock.front_door' }, service_data: {} },
    { domain: 'media_player', service: 'volume_set', target: { entity_id: 'media_player.tv' }, service_data: { volume_level: 0.3 } },
    { domain: 'button', service: 'press', target: { entity_id: 'button.restart' }, service_data: {} },
    { domain: 'scene', service: 'turn_on', target: { entity_id: 'scene.movie' }, service_data: {} },
    { domain: 'number', service: 'set_value', target: { entity_id: 'number.limit' }, service_data: { value: 7 } },
    { domain: 'select', service: 'select_option', target: { entity_id: 'select.mode' }, service_data: { option: 'eco' } },
  ]);
});

test('entity helpers route single-entity reads, subscriptions, history, and same-domain services', async () => {
  const transport = new FakeTransport();
  const client = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, transport, storage: new MemoryStorage(), webrtc: false });
  await client.connect();

  assert.equal((await client.entity.get('sensor.temp')).state, '21');
  const events = [];
  assert.equal(await client.entity.subscribe('sensor.temp', (event) => events.push(event)), 'sub1');
  assert.equal(events[0].type, 'state_snapshot');
  assert.deepEqual(await client.entity.history('sensor.temp'), { 'sensor.temp': [] });
  await client.entity.call('light.cucina', 'turn_on', { brightness_pct: 50 });

  const calls = transport.messages.filter((message) => message.type !== 'authenticate').map((message) => message.type === 'call_service' ? { type: message.type, domain: message.domain, service: message.service, target: message.target, service_data: message.service_data } : message);
  assert.deepEqual(calls, [
    { type: 'get_states', entity_ids: ['sensor.temp'] },
    { type: 'subscribe_states', entity_ids: ['sensor.temp'] },
    { type: 'history_query', entity_ids: ['sensor.temp'] },
    { type: 'call_service', domain: 'light', service: 'turn_on', target: { entity_id: 'light.cucina' }, service_data: { brightness_pct: 50 } },
  ]);
});

test('manifest helpers expand entity presets into deduplicated Varco scopes', () => {
  const manifest = createManifest({
    name: 'Room dashboard',
    version: '1',
    entities: [
      readEntity('sensor.temp'),
      readEntity('sensor.live', { subscribe: true, history: true }),
      cameraEntity('camera.porta', { history: true }),
      switchControl('switch.pc', { toggle: true, history: true }),
      fanControl('fan.bedroom', { percentage: true, presetMode: true, direction: true, oscillate: true, toggle: true }),
      buttonControl('button.restart'),
      sceneControl('scene.movie'),
      numberControl('number.limit'),
      lightControl('light.kitchen', { brightness: true }),
      climateControl('climate.living_room', { temperature: true, hvacMode: true, presetMode: true }),
      coverControl('cover.awning', { position: true }),
      lockControl('lock.front_door', { unlock: false, open: true }),
      mediaPlayerControl('media_player.tv', { volume: true, playback: true }),
      selectControl('select.mode'),
      lightControl('light.kitchen', { onOff: true }),
    ],
  });

  assert.deepEqual(manifest, {
    name: 'Room dashboard',
    version: '1',
    read_entities: ['sensor.temp', 'sensor.live', 'camera.porta', 'switch.pc', 'fan.bedroom', 'button.restart', 'scene.movie', 'number.limit', 'light.kitchen', 'climate.living_room', 'cover.awning', 'lock.front_door', 'media_player.tv', 'select.mode'],
    subscriptions: ['sensor.live', 'switch.pc', 'fan.bedroom', 'button.restart', 'scene.movie', 'number.limit', 'light.kitchen', 'climate.living_room', 'cover.awning', 'lock.front_door', 'media_player.tv', 'select.mode'],
    history: ['sensor.live', 'camera.porta', 'switch.pc'],
    camera_snapshots: ['camera.porta'],
    actions: [
      'switch.turn_on@switch.pc',
      'switch.turn_off@switch.pc',
      'switch.toggle@switch.pc',
      'fan.turn_on@fan.bedroom',
      'fan.turn_off@fan.bedroom',
      'fan.toggle@fan.bedroom',
      'fan.set_percentage@fan.bedroom',
      'fan.set_preset_mode@fan.bedroom',
      'fan.set_direction@fan.bedroom',
      'fan.oscillate@fan.bedroom',
      'button.press@button.restart',
      'scene.turn_on@scene.movie',
      'number.set_value@number.limit',
      'light.turn_on@light.kitchen',
      'light.turn_off@light.kitchen',
      'climate.set_temperature@climate.living_room',
      'climate.set_hvac_mode@climate.living_room',
      'climate.set_preset_mode@climate.living_room',
      'cover.open_cover@cover.awning',
      'cover.close_cover@cover.awning',
      'cover.stop_cover@cover.awning',
      'cover.set_cover_position@cover.awning',
      'lock.lock@lock.front_door',
      'lock.open@lock.front_door',
      'media_player.volume_up@media_player.tv',
      'media_player.volume_down@media_player.tv',
      'media_player.volume_set@media_player.tv',
      'media_player.volume_mute@media_player.tv',
      'media_player.media_play@media_player.tv',
      'media_player.media_pause@media_player.tv',
      'media_player.media_stop@media_player.tv',
      'media_player.media_play_pause@media_player.tv',
      'media_player.media_next_track@media_player.tv',
      'media_player.media_previous_track@media_player.tv',
      'media_player.media_seek@media_player.tv',
      'select.select_option@select.mode',
    ],
  });
});

test('relay callService sends restriction PINs at the top level', async () => {
  class PinTransport {
    messages = [];
    onEvent() {}
    async request(message) {
      this.messages.push(message);
      if (message.type === 'authenticate') return { type: 'authenticated', grant_id: 'grant1' };
      if (message.type === 'call_service') return { type: 'service_called', ok: true };
      return { type: 'ok' };
    }
    async close() {}
  }

  const transport = new PinTransport();
  const client = createVarcoClient({
    authorityId: 'authority',
    bridgeUrl: 'ws://bridge',
    manifest: { name: 'Demo', version: '1', actions: ['lock.unlock@lock.front_door'] },
    transport,
    storage: new MemoryStorage(),
    webrtc: false,
  });

  await client.connect();
  await client.callService('lock', 'unlock', {
    entity_id: 'lock.front_door',
    pin: '1234',
    pins: { 'front-door-pin': '1234' },
  });

  const call = transport.messages.at(-1);
  assert.equal(call.pin, '1234');
  assert.deepEqual(call.pins, { 'front-door-pin': '1234' });
  assert.deepEqual(call.service_data, {});
});

test('legacy localStorage identity keeps working and no identity is created without storage when WebCrypto path is used', async () => {
  // Legacy path: existing plaintext identity in provided storage is reused.
  const storage = new MemoryStorage();
  const transport = new FakeTransport();
  const first = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, storage, transport });
  await first.requestAccess();
  const persisted = storage.getItem('varco.consumerIdentity.v1');
  assert.ok(persisted, 'identity persisted to provided storage');
  const second = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, storage, transport: new FakeTransport() });
  assert.equal(second.consumerPublicKey, first.consumerPublicKey);
  assert.equal(JSON.parse(persisted).publicKey, first.consumerPublicKey);
});

test('without provided storage the client uses non-extractable WebCrypto keys in IndexedDB', async () => {
  // Minimal in-memory fake IndexedDB.
  const stores = new Map();
  const makeRequest = (executor) => {
    const request = { onsuccess: null, onerror: null, onupgradeneeded: null, result: undefined, error: null };
    queueMicrotask(() => executor(request));
    return request;
  };
  globalThis.indexedDB = {
    open() {
      return makeRequest((request) => {
        request.result = {
          createObjectStore(name) { stores.set(name, new Map()); },
          transaction(name) {
            const store = stores.get(name);
            return { objectStore: () => ({
              get: (key) => makeRequest((r) => { r.result = store.get(key); r.onsuccess?.(); }),
              put: (value, key) => makeRequest((r) => { store.set(key, value); r.onsuccess?.(); }),
            }) };
          },
          close() {},
        };
        if (!stores.has('keys')) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
    },
  };
  try {
    const transport = new FakeTransport();
    const client = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, transport, webrtc: false });
    await client.requestAccess();
    await client.connect();
    const pair = stores.get('keys').get('consumerIdentity.v1');
    assert.ok(pair, 'key pair stored in IndexedDB');
    assert.equal(pair.privateKey.extractable, false);
    assert.equal(typeof transport.messages[0].signature, 'string');
    assert.equal(client.consumerPublicKey.length > 0, true);

    // Same IndexedDB yields the same identity on a fresh client.
    const again = createVarcoClient({ authorityId: 'authority', bridgeUrl: 'ws://bridge', manifest: { name: 'Demo', version: '1' }, transport: new FakeTransport(), webrtc: false });
    await again.requestAccess();
    assert.equal(again.consumerPublicKey, client.consumerPublicKey);
  } finally {
    delete globalThis.indexedDB;
  }
});

test('createVarcoClient rejects manifest with conflicting alias spellings', () => {
  assert.throws(() => createVarcoClient({
    authorityId: 'auth',
    bridgeUrl: 'wss://bridge',
    storage: new MemoryStorage(),
    transport: new FakeTransport(),
    manifest: { name: 'Demo', version: '1.0.0', read_entities: ['sensor.a'], readEntities: ['sensor.b'] },
  }), /read_entities and readEntities/);
  assert.throws(() => createVarcoClient({
    authorityId: 'auth',
    bridgeUrl: 'wss://bridge',
    storage: new MemoryStorage(),
    transport: new FakeTransport(),
    manifest: { name: '', version: '1.0.0' },
  }), /non-empty name/);
});
