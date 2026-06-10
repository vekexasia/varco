import test from 'node:test';
import assert from 'node:assert/strict';
import { closeError, createVarcoClient, envelopeLane, MemoryStorage } from '../dist/index.js';

test('envelopeLane tags session setup and WebRTC negotiation, not data-plane types', () => {
  assert.equal(envelopeLane('access_request'), 'signaling');
  assert.equal(envelopeLane('authenticate'), 'signaling');
  assert.equal(envelopeLane('webrtc_offer'), 'signaling');
  assert.equal(envelopeLane('webrtc_ice'), 'signaling');
  assert.equal(envelopeLane('get_states'), null);
  assert.equal(envelopeLane('call_service'), null);
  assert.equal(envelopeLane(undefined), null);
});

test('closeError maps bridge close code 4405 to a clear signaling-only message', () => {
  assert.equal(closeError(4405).message, 'Bridge is signaling-only: P2P required but unavailable');
  assert.equal(closeError(1000).message, 'Varco transport closed');
  assert.equal(closeError(undefined).message, 'Varco transport closed');
});

test('connect rejects instead of silently staying on relay when the bridge is signaling-only', async () => {
  class FakePeerConnection {
    constructor() { this.iceGatheringState = 'complete'; this.localDescription = null; }
    // readyState 'open' keeps waitForDataChannelOpen synchronous so no timer
    // leaks past the end of the test.
    createDataChannel() { return { readyState: 'open', addEventListener() {}, close() {}, send() {} }; }
    async createOffer() { return { sdp: 'x', type: 'offer' }; }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  const previous = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakePeerConnection;
  try {
    const transport = {
      onEvent() {},
      async request(message) {
        if (message.type === 'authenticate') return { type: 'authenticated' };
        if (message.type === 'webrtc_offer') throw closeError(4405);
        throw new Error(message.type);
      },
    };
    const statuses = [];
    const client = createVarcoClient({
      authorityId: 'authority',
      bridgeUrl: 'ws://bridge',
      manifest: { name: 'Demo', version: '1' },
      storage: new MemoryStorage(),
      transport,
      onTransportStatus: (status) => statuses.push(status),
    });
    await assert.rejects(() => client.connect(), /signaling-only/);
    assert.ok(statuses.some((status) => (status.detail ?? '').includes('signaling-only')));
  } finally {
    globalThis.RTCPeerConnection = previous;
  }
});
