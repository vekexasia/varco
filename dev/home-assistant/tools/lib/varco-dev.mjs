import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HomeAssistantAdminClient, haConfig, loginToHomeAssistant } from './ha-admin.mjs';

export const DEFAULT_BRIDGE_URL = 'wss://varco-bridge.andreabaccega.com';
export const SMOKE_ENTITY_ID = 'sensor.powerwall_load_w';
export const SMOKE_SWITCH_ID = 'switch.ev_charger';

export const SMOKE_MANIFEST = {
  name: 'Varco local smoke test',
  version: 'dev',
  read_entities: [SMOKE_ENTITY_ID],
  subscriptions: [SMOKE_ENTITY_ID, SMOKE_SWITCH_ID],
  history: [SMOKE_ENTITY_ID],
  camera_snapshots: [],
  actions: [
    `switch.turn_on@${SMOKE_SWITCH_ID}`,
    `switch.turn_off@${SMOKE_SWITCH_ID}`,
  ],
};

export async function createHomeAssistantAdmin(options = {}) {
  const config = { ...haConfig(), ...options };
  const token = options.token || await loginToHomeAssistant(config);
  return new HomeAssistantAdminClient({ url: config.url, token, WebSocketImpl: options.WebSocketImpl });
}

export async function listVarco(admin) {
  const [info, requests, grants] = await Promise.all([
    admin.command('varco/info'),
    admin.command('varco/access_requests'),
    admin.command('varco/grants'),
  ]);
  return { info, requests, grants };
}

export async function approveRequest(admin, requestId) {
  return admin.command('varco/approve_request', { request_id: requestId });
}

export async function deleteGrant(admin, grantId) {
  return admin.command('varco/delete_grant', { grant_id: grantId });
}

export async function pairVarcoConsumer(options = {}) {
  const admin = options.admin || await createHomeAssistantAdmin(options);
  const log = options.log || console.log;
  const bridgeUrl = options.bridgeUrl || process.env.VARCO_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const info = await admin.command('varco/info');
  const authorityId = info.authority_id;
  const createClient = options.createClient || await defaultCreateClient({ persistent: true });
  const client = createClient({
    authorityId,
    bridgeUrl,
    manifest: SMOKE_MANIFEST,
    webrtc: false,
  });

  try {
    const access = await client.requestAccess();
    log(`Request: ${access.status} ${access.request_id} pairing ${access.pairing_code}`);
    const grant = await approveRequest(admin, access.request_id);
    const grantId = grant.grant_id || access.request_id;
    await client.connect();
    log(`Approved reusable grant: ${grantId}`);
    return { authorityId, requestId: access.request_id, grantId, consumerPublicKey: client.consumerPublicKey };
  } finally {
    await client.close?.();
    admin.close?.();
  }
}

export async function runVarcoSmoke(options = {}) {
  const admin = options.admin || await createHomeAssistantAdmin(options);
  const log = options.log || console.log;
  const bridgeUrl = options.bridgeUrl || process.env.VARCO_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const info = await admin.command('varco/info');
  const authorityId = info.authority_id;
  log(`Authority: ${authorityId}`);

  const createClient = options.createClient || await defaultCreateClient();
  const client = createClient({
    authorityId,
    bridgeUrl,
    manifest: SMOKE_MANIFEST,
    webrtc: false,
  });

  let grantId;
  try {
    const access = await client.requestAccess();
    log(`Request: ${access.status} ${access.request_id} pairing ${access.pairing_code}`);
    const grant = await approveRequest(admin, access.request_id);
    grantId = grant.grant_id || access.request_id;
    log(`Approved grant: ${grantId}`);

    await client.connect();
    log('Connected: relay');

    const states = await client.getStates([SMOKE_ENTITY_ID]);
    const state = states[SMOKE_ENTITY_ID];
    if (!state || state.state === 'unknown' || state.state === 'unavailable') throw new Error(`${SMOKE_ENTITY_ID} returned ${state?.state || 'missing'}`);
    log(`get_states ${SMOKE_ENTITY_ID}: ${state.state}`);

    await client.queryHistory([SMOKE_ENTITY_ID]);
    log(`history ${SMOKE_ENTITY_ID}: ok`);

    await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    await client.callService('switch', 'turn_off', { entity_id: SMOKE_SWITCH_ID });
    log(`call_service ${SMOKE_SWITCH_ID}: ok`);

    await deleteGrant(admin, grantId);
    log(`cleanup deleted grant: ${grantId}`);
    return { authorityId, requestId: access.request_id, grantId, state: state.state };
  } finally {
    await client.close?.();
    admin.close?.();
  }
}

export async function runVarcoLocalHomeAssistantSmoke(options = {}) {
  const admin = options.admin || await createHomeAssistantAdmin(options);
  const log = options.log || console.log;
  const manifestName = `Varco local Home Assistant smoke ${Date.now()}`;
  const createClient = options.createClient || await defaultCreateConsumerClient();
  let client;
  let subscriptionId;
  try {
    await admin.command('call_service', { domain: 'switch', service: 'turn_off', service_data: {}, target: { entity_id: SMOKE_SWITCH_ID } });
    const offHass = await waitForAdminState(admin, SMOKE_SWITCH_ID, 'off');
    const clientOptions = {
      hass: offHass,
      authorityId: 'local-mode-must-ignore-authority',
      bridgeUrl: 'ws://127.0.0.1/unused-local-mode-bridge',
      manifest: { ...SMOKE_MANIFEST, name: manifestName },
      webrtc: false,
    };
    client = createClient(clientOptions);

    const access = await client.requestAccess();
    if (access.status !== 'approved' || access.mode !== 'home-assistant' || access.request_id !== 'local') throw new Error(`Unexpected local access result: ${JSON.stringify(access)}`);
    await client.connect();
    log('Connected: local Home Assistant frontend session');

    const states = await client.getStates([SMOKE_ENTITY_ID]);
    const state = states[SMOKE_ENTITY_ID];
    if (!state || state.state === 'unknown' || state.state === 'unavailable') throw new Error(`${SMOKE_ENTITY_ID} returned ${state?.state || 'missing'}`);
    log(`local getStates ${SMOKE_ENTITY_ID}: ${state.state}`);

    const events = [];
    subscriptionId = await client.subscribeEntities([SMOKE_SWITCH_ID], (event) => events.push(event));
    if (events[0]?.type !== 'state_snapshot' || events[0]?.states?.[SMOKE_SWITCH_ID]?.state !== 'off') throw new Error(`Unexpected local subscription snapshot: ${JSON.stringify(events[0])}`);

    await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    const onHass = await waitForAdminState(admin, SMOKE_SWITCH_ID, 'on');
    client.updateHass(onHass);
    const delta = events.find((event) => event.type === 'state_delta' && event.states?.[SMOKE_SWITCH_ID]?.state === 'on');
    if (!delta) throw new Error(`Local subscription did not emit an on delta: ${JSON.stringify(events)}`);
    log(`local subscribe/updateHass ${SMOKE_SWITCH_ID}: on delta`);

    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    const history = await client.queryHistory([SMOKE_ENTITY_ID], { start_time: start.toISOString(), end_time: end.toISOString() });
    if (!history || typeof history !== 'object' || !(SMOKE_ENTITY_ID in history)) throw new Error(`Local history missing ${SMOKE_ENTITY_ID}`);
    log(`local history ${SMOKE_ENTITY_ID}: ok`);

    await client.unsubscribe(subscriptionId);
    subscriptionId = undefined;
    await client.callService('switch', 'turn_off', { entity_id: SMOKE_SWITCH_ID });
    await waitForAdminState(admin, SMOKE_SWITCH_ID, 'off');

    log('local mode completed without Varco pairing or relay connection');

    return { mode: access.mode, state: state.state, subscriptionVerified: true, historyEntities: Object.keys(history) };
  } finally {
    if (subscriptionId && client) await client.unsubscribe(subscriptionId).catch(() => {});
    if (client) await client.close?.();
    await admin.command('call_service', { domain: 'switch', service: 'turn_off', service_data: {}, target: { entity_id: SMOKE_SWITCH_ID } }).catch(() => {});
    admin.close?.();
  }
}

async function defaultCreateClient(options = {}) {
  const { createVarcoClient, MemoryStorage } = await import('../../../../packages/client/dist/index.js');
  return (clientOptions) => createVarcoClient({
    ...clientOptions,
    storage: options.persistent ? new FileStorage(options.storagePath || '.pi/varco-dev-consumer.json') : new MemoryStorage(),
  });
}

async function defaultCreateConsumerClient() {
  const { createVarcoConsumerClient } = await import('../../../../packages/client/dist/index.js');
  return (clientOptions) => createVarcoConsumerClient(clientOptions);
}

async function hassFrontendFromAdmin(admin) {
  const states = await admin.command('get_states');
  return {
    states: Object.fromEntries(states.map((state) => [state.entity_id, state])),
    callWS: ({ type, ...payload }) => admin.command(type, payload),
    callService: (domain, service, serviceData = {}, target = {}) => admin.command('call_service', { domain, service, service_data: serviceData, target }),
  };
}

async function waitForAdminState(admin, entityId, expectedState, attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const hass = await hassFrontendFromAdmin(admin);
    if (hass.states[entityId]?.state === expectedState) return hass;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const hass = await hassFrontendFromAdmin(admin);
  throw new Error(`${entityId} did not become ${expectedState}; current state is ${hass.states[entityId]?.state || 'missing'}`);
}

async function waitForCondition(check, description, attempts = 20, delayMs = 250) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(description);
}

class FileStorage {
  constructor(path) {
    this.path = path;
    this.data = this.read();
  }

  getItem(key) {
    return this.data[key] ?? null;
  }

  setItem(key, value) {
    this.data[key] = value;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  removeItem(key) {
    delete this.data[key];
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  read() {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      return {};
    }
  }
}

export async function runVarcoRestrictionsSmoke(options = {}) {
  const admin = options.admin || await createHomeAssistantAdmin(options);
  const log = options.log || console.log;
  const bridgeUrl = options.bridgeUrl || process.env.VARCO_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const info = await admin.command('varco/info');
  const authorityId = info.authority_id;
  log(`Authority: ${authorityId}`);

  const createClient = options.createClient || await defaultCreateClient();
  const client = createClient({
    authorityId,
    bridgeUrl,
    manifest: SMOKE_MANIFEST,
    webrtc: false,
  });

  let grantId;
  try {
    const access = await client.requestAccess();
    log(`Request: ${access.request_id} pairing ${access.pairing_code}`);
    const grant = await approveRequest(admin, access.request_id);
    grantId = grant.grant_id || access.request_id;
    log(`Approved grant: ${grantId}`);
    await client.connect();
    log('Connected');

    // 1. Without restrictions: service call and live subscription must succeed.
    await admin.command('call_service', { domain: 'switch', service: 'turn_off', service_data: {}, target: { entity_id: SMOKE_SWITCH_ID } });
    await waitForAdminState(admin, SMOKE_SWITCH_ID, 'off');
    const subscriptionEvents = [];
    await client.subscribeEntities([SMOKE_SWITCH_ID], (event) => subscriptionEvents.push(event));
    await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    await waitForAdminState(admin, SMOKE_SWITCH_ID, 'on');
    await waitForCondition(
      () => subscriptionEvents.some((event) => event.type === 'state_delta'),
      'Expected live subscription to receive a switch state_delta before restrictions changed',
    );
    log('subscription before restriction update: received delta');
    log('call_service without restrictions: ok');
    await client.callService('switch', 'turn_off', { entity_id: SMOKE_SWITCH_ID });
    await waitForAdminState(admin, SMOKE_SWITCH_ID, 'off');

    // 2. Add an expired whole-grant expiry restriction — all data-plane calls must now be denied
    // and existing subscriptions must stop receiving deltas.
    const expiredRestriction = [{
      id: 'expired-grant',
      type: 'expiry',
      enabled: true,
      applies_to: 'grant',
      params: { expires_at: new Date(Date.now() - 60_000).toISOString() },
    }];
    await admin.command('varco/update_grant_restrictions', { grant_id: grantId, restrictions: expiredRestriction });
    log('Set expired grant restriction');
    const deltasBeforeAdminChange = subscriptionEvents.filter((event) => event.type === 'state_delta').length;
    await admin.command('call_service', { domain: 'switch', service: 'turn_on', service_data: {}, target: { entity_id: SMOKE_SWITCH_ID } });
    await waitForAdminState(admin, SMOKE_SWITCH_ID, 'on');
    await new Promise((resolve) => setTimeout(resolve, 750));
    const subscriptionInvalidated = subscriptionEvents.filter((event) => event.type === 'state_delta').length === deltasBeforeAdminChange;
    if (!subscriptionInvalidated) throw new Error('Expected restriction update to stop the existing subscription');
    log('subscription after restriction update: no further deltas');
    let deniedByExpiry = false;
    try {
      await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    } catch (err) {
      if (err?.code === 'permission_denied' || /permission_denied|expired/i.test(String(err))) {
        deniedByExpiry = true;
        log('call_service with expired restriction: correctly denied');
      } else {
        throw err;
      }
    }
    if (!deniedByExpiry) throw new Error('Expected expired restriction to deny the service call');

    // 3. Remove the expiry restriction — service call must succeed again.
    await admin.command('varco/update_grant_restrictions', { grant_id: grantId, restrictions: [] });
    log('Cleared restrictions');
    await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    await client.callService('switch', 'turn_off', { entity_id: SMOKE_SWITCH_ID });
    log('call_service after clearing restrictions: ok');

    // 4. Add a PIN restriction on switch.turn_on.
    const pinRestriction = [{
      id: 'switch-pin',
      type: 'pin',
      enabled: true,
      applies_to: `switch.turn_on@${SMOKE_SWITCH_ID}`,
      pin: '9876',
    }];
    await admin.command('varco/update_grant_restrictions', { grant_id: grantId, restrictions: pinRestriction });
    log('Set PIN restriction on switch.turn_on');

    // 4a. Without PIN: must be denied.
    let deniedByPin = false;
    try {
      await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    } catch (err) {
      if (err?.code === 'permission_denied' || /permission_denied|pin/i.test(String(err))) {
        deniedByPin = true;
        log('call_service without PIN: correctly denied');
      } else {
        throw err;
      }
    }
    if (!deniedByPin) throw new Error('Expected PIN restriction to deny the service call without a PIN');

    // 4b. With wrong PIN: must be denied.
    let deniedByWrongPin = false;
    try {
      await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID, pin: '0000' });
    } catch (err) {
      if (err?.code === 'permission_denied' || /permission_denied|pin/i.test(String(err))) {
        deniedByWrongPin = true;
        log('call_service with wrong PIN: correctly denied');
      } else {
        throw err;
      }
    }
    if (!deniedByWrongPin) throw new Error('Expected wrong PIN to be denied');

    // 4c. With correct PIN: must succeed.
    await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID, pin: '9876' });
    await client.callService('switch', 'turn_off', { entity_id: SMOKE_SWITCH_ID });
    log('call_service with correct PIN: ok');

    // 5. Rate-limit: 2 calls per 60 s. First two succeed; third must be denied.
    const rateLimitRestriction = [{
      id: 'rate-limit',
      type: 'rate_limit',
      enabled: true,
      applies_to: 'actions',
      params: { limit: 2, window_seconds: 60 },
    }];
    await admin.command('varco/update_grant_restrictions', { grant_id: grantId, restrictions: rateLimitRestriction });
    log('Set rate-limit restriction');

    await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    await client.callService('switch', 'turn_off', { entity_id: SMOKE_SWITCH_ID });
    let deniedByRateLimit = false;
    try {
      await client.callService('switch', 'turn_on', { entity_id: SMOKE_SWITCH_ID });
    } catch (err) {
      if (err?.code === 'permission_denied' || /permission_denied|rate/i.test(String(err))) {
        deniedByRateLimit = true;
        log('call_service over rate limit: correctly denied');
      } else {
        throw err;
      }
    }
    if (!deniedByRateLimit) throw new Error('Expected rate-limit restriction to deny the third call');

    // 6. Cleanup: clear restrictions and delete grant.
    await admin.command('varco/update_grant_restrictions', { grant_id: grantId, restrictions: [] });
    await deleteGrant(admin, grantId);
    grantId = undefined;
    log('Restrictions smoke completed, grant cleaned up');

    return { authorityId, deniedByExpiry, deniedByPin, deniedByWrongPin, deniedByRateLimit, subscriptionInvalidated };
  } finally {
    if (grantId) await deleteGrant(admin, grantId).catch(() => {});
    await client.close?.();
    admin.close?.();
  }
}
