import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BRIDGE_URL, pairVarcoConsumer, runVarcoLocalHomeAssistantSmoke, runVarcoSmoke } from '../lib/varco-dev.mjs';

test('runVarcoSmoke requests access, approves through HA, verifies data plane, and deletes the grant', async () => {
  const adminCalls = [];
  const clientCalls = [];
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'varco/info') return { authority_id: 'authority-1' };
      if (type === 'varco/approve_request') return { grant_id: payload.request_id };
      if (type === 'varco/delete_grant') return { grant_id: payload.grant_id };
      throw new Error(type);
    },
  };
  const createClient = (options) => {
    assert.equal(options.authorityId, 'authority-1');
    assert.equal(options.bridgeUrl, DEFAULT_BRIDGE_URL);
    assert.deepEqual(options.manifest.read_entities, ['sensor.powerwall_load_w']);
    return {
      async requestAccess() { clientCalls.push('requestAccess'); return { request_id: 'req-1', pairing_code: '123456', status: 'pending' }; },
      async connect() { clientCalls.push('connect'); },
      async getStates(entityIds) { clientCalls.push(['getStates', entityIds]); return { 'sensor.powerwall_load_w': { state: '1200' } }; },
      async queryHistory(entityIds) { clientCalls.push(['queryHistory', entityIds]); return { 'sensor.powerwall_load_w': [] }; },
      async callService(domain, service, data) { clientCalls.push(['callService', domain, service, data]); },
      async close() { clientCalls.push('close'); },
    };
  };

  const result = await runVarcoSmoke({ admin, createClient, log: () => {} });

  assert.equal(result.authorityId, 'authority-1');
  assert.equal(result.requestId, 'req-1');
  assert.equal(result.grantId, 'req-1');
  assert.deepEqual(adminCalls, [
    { type: 'varco/info', payload: {} },
    { type: 'varco/approve_request', payload: { request_id: 'req-1' } },
    { type: 'varco/delete_grant', payload: { grant_id: 'req-1' } },
  ]);
  assert.deepEqual(clientCalls, [
    'requestAccess',
    'connect',
    ['getStates', ['sensor.powerwall_load_w']],
    ['queryHistory', ['sensor.powerwall_load_w']],
    ['callService', 'switch', 'turn_on', { entity_id: 'switch.ev_charger' }],
    ['callService', 'switch', 'turn_off', { entity_id: 'switch.ev_charger' }],
    'close',
  ]);
});

test('runVarcoLocalHomeAssistantSmoke verifies hass-first mode against Home Assistant APIs without pairing', async () => {
  const adminCalls = [];
  let switchState = 'off';
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'call_service') {
        if (payload.target?.entity_id === 'switch.ev_charger' && payload.service === 'turn_on') switchState = 'on';
        if (payload.target?.entity_id === 'switch.ev_charger' && payload.service === 'turn_off') switchState = 'off';
        return { context: { id: 'context-1' } };
      }
      if (type === 'get_states') return [
        { entity_id: 'sensor.powerwall_load_w', state: '1200', attributes: {} },
        { entity_id: 'switch.ev_charger', state: switchState, attributes: {} },
      ];
      if (type === 'history/history_during_period') return { 'sensor.powerwall_load_w': [{ state: '1200' }] };
      if (type === 'varco/access_requests') return [];
      throw new Error(type);
    },
    close() { adminCalls.push({ type: 'close', payload: {} }); },
  };
  const createClient = (options) => {
    assert.equal(options.hass.states['switch.ev_charger'].state, 'off');
    assert.equal(options.authorityId, 'local-mode-must-ignore-authority');
    let subscriptionCallback;
    return {
      async requestAccess() { return { request_id: 'local', pairing_code: '', status: 'approved', mode: 'home-assistant' }; },
      async connect() {},
      async getStates(entityIds) { return Object.fromEntries(entityIds.map((entityId) => [entityId, options.hass.states[entityId] ?? null])); },
      async subscribeEntities(entityIds, cb) {
        subscriptionCallback = cb;
        cb({ type: 'state_snapshot', subscription_id: 'local-1', states: Object.fromEntries(entityIds.map((entityId) => [entityId, options.hass.states[entityId] ?? null])) });
        return 'local-1';
      },
      updateHass(nextHass) { subscriptionCallback?.({ type: 'state_delta', subscription_id: 'local-1', states: { 'switch.ev_charger': nextHass.states['switch.ev_charger'] } }); },
      async queryHistory(entityIds, range) { return options.hass.callWS({ type: 'history/history_during_period', entity_ids: entityIds, ...range }); },
      async callService(domain, service, data) { const { entity_id, ...serviceData } = data; await options.hass.callService(domain, service, serviceData, { entity_id }); },
      async unsubscribe() {},
      async close() {},
    };
  };

  const result = await runVarcoLocalHomeAssistantSmoke({ admin, createClient, log: () => {} });

  assert.equal(result.mode, 'home-assistant');
  assert.deepEqual(result.historyEntities, ['sensor.powerwall_load_w']);
  assert.equal(adminCalls.some((call) => call.type.startsWith('varco/')), false);
});

test('pairVarcoConsumer creates and approves a reusable development grant without cleanup', async () => {
  const adminCalls = [];
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'varco/info') return { authority_id: 'authority-1' };
      if (type === 'varco/approve_request') return { grant_id: 'grant-1' };
      throw new Error(type);
    },
  };
  const createClient = () => ({
    consumerPublicKey: 'consumer-1',
    async requestAccess() { return { request_id: 'req-1', pairing_code: '123456', status: 'pending' }; },
    async connect() {},
    async close() {},
  });

  const result = await pairVarcoConsumer({ admin, createClient, log: () => {} });

  assert.deepEqual(result, { authorityId: 'authority-1', requestId: 'req-1', grantId: 'grant-1', consumerPublicKey: 'consumer-1' });
  assert.deepEqual(adminCalls, [
    { type: 'varco/info', payload: {} },
    { type: 'varco/approve_request', payload: { request_id: 'req-1' } },
  ]);
});
