import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BRIDGE_URL, pairVarcoConsumer, runVarcoSmoke } from '../lib/varco-dev.mjs';

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
