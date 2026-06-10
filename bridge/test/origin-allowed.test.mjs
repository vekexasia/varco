import test from 'node:test';
import assert from 'node:assert/strict';
import { originAllowed, parsePolicy } from '../dist/logic.js';

test('public origin policy allows every origin (default behaviour)', () => {
  assert.equal(originAllowed(parsePolicy({}), 'https://evil.example'), true);
  assert.equal(originAllowed(parsePolicy({ ORIGIN_POLICY: 'public' }), 'https://evil.example'), true);
  // ALLOWED_ORIGINS alone has no effect without ORIGIN_POLICY=restricted.
  assert.equal(originAllowed(parsePolicy({ ALLOWED_ORIGINS: 'https://a.example' }), 'https://evil.example'), true);
});

test('restricted origin policy matches exact origins from ALLOWED_ORIGINS', () => {
  const policy = parsePolicy({ ORIGIN_POLICY: 'restricted', ALLOWED_ORIGINS: 'https://varco-demo.andreabaccega.com, http://localhost:5173' });
  assert.equal(originAllowed(policy, 'https://varco-demo.andreabaccega.com'), true);
  assert.equal(originAllowed(policy, 'http://localhost:5173'), true);
  assert.equal(originAllowed(policy, 'https://evil.example'), false);
  assert.equal(originAllowed(policy, 'https://varco-demo.andreabaccega.com.evil.example'), false);
});

test('restricted policy with empty ALLOWED_ORIGINS denies all browser origins', () => {
  const policy = parsePolicy({ ORIGIN_POLICY: 'restricted' });
  assert.equal(originAllowed(policy, 'https://any.example'), false);
});

test('requests without an Origin header are always allowed', () => {
  assert.equal(originAllowed(parsePolicy({ ORIGIN_POLICY: 'restricted', ALLOWED_ORIGINS: 'https://a.example' }), null), true);
  assert.equal(originAllowed(parsePolicy({ ORIGIN_POLICY: 'restricted' }), null), true);
  assert.equal(originAllowed(parsePolicy({}), null), true);
});
