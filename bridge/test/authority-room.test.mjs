import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import {
  authorityConnectDecision,
  challengePayload,
  authorityMessageAction,
  b64urlEncode,
  consumerConnectDecision,
  disconnectAction,
  gateMessage,
  parseMessage,
  validAuthorityId,
} from '../dist/logic.js';

function makeAuthoritySession() {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const session = { role: 'authority', authed: false, authorityId: b64urlEncode(publicKey), challenge, windowStart: 0, messagesInWindow: 0 };
  return { secretKey, session };
}

function signChallenge(secretKey, session) {
  return b64urlEncode(ed25519.sign(challengePayload(session.challenge), secretKey));
}

test('challenge signature is domain-separated from raw nonce bytes', () => {
  const { secretKey, session } = makeAuthoritySession();
  const challengeBytes = Uint8Array.from(atob(session.challenge.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const rawSignature = b64urlEncode(ed25519.sign(challengeBytes, secretKey));
  const action = authorityMessageAction(session, { type: 'auth', signature: rawSignature });
  assert.deepEqual(action, { kind: 'close', code: 4403, reason: 'Bad signature' });
});

test('valid Ed25519 challenge response authenticates the authority', () => {
  const { secretKey, session } = makeAuthoritySession();
  const action = authorityMessageAction(session, { type: 'auth', signature: signChallenge(secretKey, session) });
  assert.deepEqual(action, { kind: 'ready' });
  assert.equal(session.authed, true);
});

test('bad signature is rejected with 4403', () => {
  const { session } = makeAuthoritySession();
  const wrongKey = ed25519.utils.randomSecretKey();
  const action = authorityMessageAction(session, { type: 'auth', signature: signChallenge(wrongKey, session) });
  assert.deepEqual(action, { kind: 'close', code: 4403, reason: 'Bad signature' });
  assert.equal(session.authed, false);
});

test('non-auth or malformed first message closes 4401', () => {
  const { session } = makeAuthoritySession();
  assert.deepEqual(authorityMessageAction(session, { type: 'authority_message', sessionId: 's1', payload: {} }), { kind: 'close', code: 4401, reason: 'Auth required' });
  assert.deepEqual(authorityMessageAction(session, { type: 'auth' }), { kind: 'close', code: 4401, reason: 'Auth required' });
  assert.deepEqual(authorityMessageAction(session, { type: 'auth', signature: 42 }), { kind: 'close', code: 4401, reason: 'Auth required' });
});

test('relay messages are only acted on after auth', () => {
  const { secretKey, session } = makeAuthoritySession();
  authorityMessageAction(session, { type: 'auth', signature: signChallenge(secretKey, session) });
  assert.deepEqual(authorityMessageAction(session, { type: 'authority_message', sessionId: 's1', payload: { x: 1 } }), { kind: 'send_to_consumer', sessionId: 's1', payload: { x: 1 } });
  assert.deepEqual(authorityMessageAction(session, { type: 'close_client', sessionId: 's1' }), { kind: 'close_consumer', sessionId: 's1', reason: 'Closed by authority' });
  assert.deepEqual(authorityMessageAction(session, { type: 'close_client', sessionId: 's1', reason: 'revoked' }), { kind: 'close_consumer', sessionId: 's1', reason: 'revoked' });
  assert.deepEqual(authorityMessageAction(session, { type: 'authority_message', sessionId: 7 }), { kind: 'none' });
  assert.deepEqual(authorityMessageAction(session, { type: 'unknown' }), { kind: 'none' });
});

test('duplicate authority connection is rejected with 4409', () => {
  assert.deepEqual(authorityConnectDecision(true), { kind: 'reject', notice: { type: 'duplicate_identity' }, code: 4409, reason: 'Duplicate authority' });
  assert.deepEqual(authorityConnectDecision(false), { kind: 'accept' });
});

test('consumer is rejected 4404 when authority offline and 4429 over the cap', () => {
  assert.deepEqual(consumerConnectDecision(false, 0, 64), { kind: 'reject', notice: { type: 'offline' }, code: 4404, reason: 'Authority offline' });
  assert.deepEqual(consumerConnectDecision(true, 65, 64), { kind: 'reject', code: 4429, reason: 'Too many clients' });
  assert.deepEqual(consumerConnectDecision(true, 64, 64), { kind: 'accept' });
});

test('oversize messages close 4400 for string and binary frames', () => {
  const session = { role: 'consumer', sessionId: 's1', windowStart: 0, messagesInWindow: 0 };
  assert.deepEqual(gateMessage(session, 'x'.repeat(11), 10, 240, 1000), { ok: false, code: 4400, reason: 'Message too large' });
  assert.deepEqual(gateMessage(session, new ArrayBuffer(11), 10, 240, 1000), { ok: false, code: 4400, reason: 'Message too large' });
  assert.deepEqual(gateMessage(session, 'x'.repeat(10), 10, 240, 1000), { ok: true });
});

test('rate limit closes 4429 and the window resets after a minute', () => {
  const session = { role: 'consumer', sessionId: 's1', windowStart: 0, messagesInWindow: 0 };
  assert.deepEqual(gateMessage(session, 'a', 100, 2, 1000), { ok: true });
  assert.deepEqual(gateMessage(session, 'a', 100, 2, 1000), { ok: true });
  assert.deepEqual(gateMessage(session, 'a', 100, 2, 1000), { ok: false, code: 4429, reason: 'Rate limit' });
  assert.deepEqual(gateMessage(session, 'a', 100, 2, 1000 + 60_000), { ok: true });
  assert.equal(session.messagesInWindow, 1);
});

test('malformed JSON is detected so the room can close 4400', () => {
  assert.deepEqual(parseMessage('{not json'), { ok: false });
  assert.deepEqual(parseMessage(new TextEncoder().encode('also not json').buffer), { ok: false });
  assert.deepEqual(parseMessage('{"type":"ok"}'), { ok: true, message: { type: 'ok' } });
});

test('authority disconnect evicts consumers; consumer disconnect notifies authority', () => {
  assert.deepEqual(disconnectAction({ role: 'authority', windowStart: 0, messagesInWindow: 0 }), { kind: 'evict_consumers' });
  assert.deepEqual(disconnectAction({ role: 'consumer', sessionId: 's1', windowStart: 0, messagesInWindow: 0 }), { kind: 'notify_authority', sessionId: 's1' });
  assert.deepEqual(disconnectAction({ role: 'consumer', windowStart: 0, messagesInWindow: 0 }), { kind: 'none' });
});

test('authority id must be a 32-byte base64url public key', () => {
  assert.equal(validAuthorityId(b64urlEncode(ed25519.getPublicKey(ed25519.utils.randomSecretKey()))), true);
  assert.equal(validAuthorityId('short'), false);
  assert.equal(validAuthorityId('!!not-base64!!'), false);
});
