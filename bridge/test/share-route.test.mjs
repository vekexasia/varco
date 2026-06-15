import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderShareShell, shareShellResponse } from '../dist/share.js';

test('share shell embeds escaped share code and preserves fragment-only private key boundary', () => {
  const html = renderShareShell('abc<bad>');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /data-share-code="abc&lt;bad&gt;"/);
  assert.doesNotMatch(html, /abc<bad>/);
  assert.match(html, /location\.hash/);
  assert.match(html, /consumerIdentityFromPrivateKey/);
  assert.doesNotMatch(html, /bridge approves/i);
});

test('legacy bearer links persist identity before clearing fragment', () => {
  const html = renderShareShell('abc');
  assert.match(html, /consumerIdentityFromPrivateKey\(legacyPrivateKey\)/);
  assert.match(html, /storage\.setItem\('varco\.consumerIdentity\.v1'/);
});

test('share shell can reconnect with stored device identity after fragment is cleared', () => {
  const html = renderShareShell('abc');
  assert.match(html, /if \(!authorityId\) fail/);
  assert.doesNotMatch(html, /missing required private link data/);
});

test('share shell scopes browser identity per share', () => {
  const html = renderShareShell('abc');
  assert.match(html, /varco\.shareIdentity\.v1\./);
  assert.match(html, /const storage = scopedStorage\(authorityId, shareCode\)/);
});

test('share shell response is not cached', () => {
  const response = shareShellResponse('abc');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('worker source serves the client bundle for the share shell import', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /parts\[0\] === "varco-client\.js"/);
  assert.match(source, /VARCO_CLIENT_BUNDLE/);
  assert.match(source, /Cache-Control.*no-store/);
});
