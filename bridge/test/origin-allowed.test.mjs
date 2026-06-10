import test from 'node:test';
import assert from 'node:assert/strict';
import { originAllowed } from '../dist/logic.js';

test('originAllowed allows everything when allowlist is unset, empty, or *', () => {
  assert.equal(originAllowed(undefined, 'https://evil.example'), true);
  assert.equal(originAllowed('', 'https://evil.example'), true);
  assert.equal(originAllowed('  ', 'https://evil.example'), true);
  assert.equal(originAllowed('*', 'https://evil.example'), true);
});

test('originAllowed matches exact origins from a comma-separated list', () => {
  const list = 'https://varco-demo.andreabaccega.com, http://localhost:5173';
  assert.equal(originAllowed(list, 'https://varco-demo.andreabaccega.com'), true);
  assert.equal(originAllowed(list, 'http://localhost:5173'), true);
  assert.equal(originAllowed(list, 'https://evil.example'), false);
  assert.equal(originAllowed(list, 'https://varco-demo.andreabaccega.com.evil.example'), false);
});

test('originAllowed always allows requests without an Origin header', () => {
  assert.equal(originAllowed('https://varco-demo.andreabaccega.com', null), true);
  assert.equal(originAllowed(undefined, null), true);
});
