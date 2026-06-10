import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import {
  authorityConnectDecision,
  authorityMessageAction,
  b64urlEncode,
  challengePayload,
  parsePolicy,
  validAuthorityId,
} from '../dist/logic.js';

function makeAuthority() {
  const secretKey = ed25519.utils.randomSecretKey();
  const authorityId = b64urlEncode(ed25519.getPublicKey(secretKey));
  return { secretKey, authorityId };
}

test('unset allowlist keeps open registration (default)', () => {
  const { authorityId } = makeAuthority();
  assert.equal(parsePolicy({}).authorityAllowlist, null);
  assert.deepEqual(authorityConnectDecision(null, authorityId), { kind: 'accept' });
});

test('allowlisted authority is accepted and still must pass the signature challenge', () => {
  const { secretKey, authorityId } = makeAuthority();
  const policy = parsePolicy({ AUTHORITY_ALLOWLIST: `${authorityId},other-id` });
  assert.deepEqual(authorityConnectDecision(policy.authorityAllowlist, authorityId), { kind: 'accept' });

  // The challenge flow is unchanged: a wrong signature still closes 4403.
  const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const session = { role: 'authority', authed: false, authorityId, challenge, windowStart: 0, messagesInWindow: 0 };
  const wrongKey = ed25519.utils.randomSecretKey();
  const bad = authorityMessageAction(session, { type: 'auth', signature: b64urlEncode(ed25519.sign(challengePayload(challenge), wrongKey)) });
  assert.deepEqual(bad, { kind: 'close', code: 4403, reason: 'Bad signature' });
  const good = authorityMessageAction(session, { type: 'auth', signature: b64urlEncode(ed25519.sign(challengePayload(challenge), secretKey)) });
  assert.deepEqual(good, { kind: 'ready' });
});

test('non-allowlisted authority is closed 4403 before auth', () => {
  const { authorityId } = makeAuthority();
  const other = makeAuthority();
  const policy = parsePolicy({ AUTHORITY_ALLOWLIST: other.authorityId });
  assert.deepEqual(authorityConnectDecision(policy.authorityAllowlist, authorityId), { kind: 'close', code: 4403, reason: 'Authority not allowlisted' });
});

test('malformed authority IDs still fail validAuthorityId first', () => {
  // AuthorityRoom.acceptAuthority checks validAuthorityId before the
  // allowlist, so a malformed ID gets HTTP 400 even if someone put it in
  // AUTHORITY_ALLOWLIST.
  assert.equal(validAuthorityId('not-a-32-byte-key'), false);
  assert.equal(validAuthorityId('!!not-base64!!'), false);
});
