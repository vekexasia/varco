import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy, relayPayloadGate } from '../dist/logic.js';

function makeSession() {
  return { role: 'consumer', sessionId: 's1', windowStart: 0, messagesInWindow: 0 };
}

const REJECTED = { ok: false, code: 4405, reason: 'Relay data disabled', notice: { type: 'relay_disabled' } };

test('relay mode (default) passes every payload untouched', () => {
  const session = makeSession();
  assert.equal(parsePolicy({}).mode, 'relay');
  assert.deepEqual(relayPayloadGate('relay', { type: 'ciphertext', nonce: 'n', body: 'b' }, session, 64), { ok: true });
  assert.deepEqual(relayPayloadGate('relay', { type: 'client_hello' }, session, 64), { ok: true });
  assert.deepEqual(relayPayloadGate('relay', { type: 'anything' }, session, 64), { ok: true });
  assert.equal(session.signalingCount, undefined);
});

test('signaling-only allows the plaintext session handshake', () => {
  const session = makeSession();
  assert.deepEqual(relayPayloadGate('signaling-only', { type: 'client_hello', client_pub: 'x' }, session, 64), { ok: true });
  assert.deepEqual(relayPayloadGate('signaling-only', { type: 'server_hello', server_pub: 'x' }, session, 64), { ok: true });
});

test('signaling-only allows lane:"signaling" ciphertext up to the budget', () => {
  const session = makeSession();
  const payload = { type: 'ciphertext', lane: 'signaling', nonce: 'n', body: 'b' };
  assert.deepEqual(relayPayloadGate('signaling-only', payload, session, 2), { ok: true });
  assert.deepEqual(relayPayloadGate('signaling-only', payload, session, 2), { ok: true });
  assert.deepEqual(relayPayloadGate('signaling-only', payload, session, 2), { ok: false, code: 4405, reason: 'Signaling budget exhausted', notice: { type: 'relay_disabled' } });
  assert.equal(session.signalingCount, 3);
});

test('signaling-only rejects untagged ciphertext with 4405 and a relay_disabled notice', () => {
  const session = makeSession();
  assert.deepEqual(relayPayloadGate('signaling-only', { type: 'ciphertext', nonce: 'n', body: 'b' }, session, 64), REJECTED);
  assert.deepEqual(relayPayloadGate('signaling-only', { type: 'ciphertext', lane: 'data', nonce: 'n', body: 'b' }, session, 64), REJECTED);
  assert.deepEqual(relayPayloadGate('signaling-only', { type: 'unknown' }, session, 64), REJECTED);
  assert.deepEqual(relayPayloadGate('signaling-only', null, session, 64), REJECTED);
});

test('the signaling budget is tracked per session', () => {
  const a = makeSession();
  const b = makeSession();
  const payload = { type: 'ciphertext', lane: 'signaling', nonce: 'n', body: 'b' };
  assert.deepEqual(relayPayloadGate('signaling-only', payload, a, 1), { ok: true });
  assert.equal(relayPayloadGate('signaling-only', payload, a, 1).ok, false);
  // A fresh session has its own counter.
  assert.deepEqual(relayPayloadGate('signaling-only', payload, b, 1), { ok: true });
});
