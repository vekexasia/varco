import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };

const { parseShareClaims, SHARE_MAX_CLAIMS } = await import('../panel.js');

test('share claims accepts only bounded plain positive integers', () => {
  assert.equal(parseShareClaims('1'), 1);
  assert.equal(parseShareClaims(String(SHARE_MAX_CLAIMS)), SHARE_MAX_CLAIMS);
  for (const value of ['', '0', '-1', '1.5', '1e3', String(SHARE_MAX_CLAIMS + 1)]) {
    assert.equal(parseShareClaims(value), null, value);
  }
});
