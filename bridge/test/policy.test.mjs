import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy, presenceDecision } from '../dist/logic.js';

test('parsePolicy defaults preserve the public shared-bridge behaviour', () => {
  assert.deepEqual(parsePolicy({}), {
    originPolicy: 'public',
    allowedOrigins: [],
    presence: 'public',
    authorityAllowlist: null,
    mode: 'relay',
    maxSignalingMessages: 64,
  });
});

test('parsePolicy falls back to defaults for invalid values', () => {
  const policy = parsePolicy({
    ORIGIN_POLICY: 'bogus',
    PRESENCE_VISIBILITY: 'nope',
    BRIDGE_MODE: 'p2p-only',
    MAX_SIGNALING_MESSAGES: '-3',
  });
  assert.equal(policy.originPolicy, 'public');
  assert.equal(policy.presence, 'public');
  assert.equal(policy.mode, 'relay');
  assert.equal(policy.maxSignalingMessages, 64);
});

test('parsePolicy parses lists and explicit values', () => {
  const policy = parsePolicy({
    ORIGIN_POLICY: 'restricted',
    ALLOWED_ORIGINS: ' https://a.example , http://localhost:5173 ,, * ',
    PRESENCE_VISIBILITY: 'disabled',
    AUTHORITY_ALLOWLIST: ' id-one , id-two ',
    BRIDGE_MODE: 'signaling-only',
    MAX_SIGNALING_MESSAGES: '8',
  });
  assert.equal(policy.originPolicy, 'restricted');
  // "*" is not a valid exact origin under restricted policy and is dropped.
  assert.deepEqual(policy.allowedOrigins, ['https://a.example', 'http://localhost:5173']);
  assert.equal(policy.presence, 'disabled');
  assert.deepEqual([...policy.authorityAllowlist], ['id-one', 'id-two']);
  assert.equal(policy.mode, 'signaling-only');
  assert.equal(policy.maxSignalingMessages, 8);
});

test('presence public follows the origin policy', () => {
  assert.deepEqual(presenceDecision(parsePolicy({}), 'https://any.example'), { kind: 'ok' });
  assert.deepEqual(presenceDecision(parsePolicy({}), null), { kind: 'ok' });
  const restricted = parsePolicy({ ORIGIN_POLICY: 'restricted', ALLOWED_ORIGINS: 'https://a.example' });
  assert.deepEqual(presenceDecision(restricted, 'https://a.example'), { kind: 'ok' });
  assert.deepEqual(presenceDecision(restricted, 'https://evil.example'), { kind: 'forbidden' });
  assert.deepEqual(presenceDecision(restricted, null), { kind: 'ok' });
});

test('presence restricted requires an allowed origin even when ORIGIN_POLICY is public', () => {
  const policy = parsePolicy({ PRESENCE_VISIBILITY: 'restricted', ALLOWED_ORIGINS: 'https://a.example' });
  assert.deepEqual(presenceDecision(policy, 'https://a.example'), { kind: 'ok' });
  assert.deepEqual(presenceDecision(policy, 'https://evil.example'), { kind: 'forbidden' });
  // Missing Origin (non-browser client) stays allowed.
  assert.deepEqual(presenceDecision(policy, null), { kind: 'ok' });
});

test('presence disabled returns not_found regardless of origin', () => {
  const policy = parsePolicy({ PRESENCE_VISIBILITY: 'disabled', ALLOWED_ORIGINS: 'https://a.example' });
  assert.deepEqual(presenceDecision(policy, 'https://a.example'), { kind: 'not_found' });
  assert.deepEqual(presenceDecision(policy, null), { kind: 'not_found' });
});
