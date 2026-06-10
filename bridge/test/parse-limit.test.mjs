import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLimit } from '../dist/logic.js';

test('parseLimit returns parsed value for valid numeric strings', () => {
  assert.equal(parseLimit('240', 100), 240);
  assert.equal(parseLimit('2097152', 1), 2097152);
});

test('parseLimit falls back when unset', () => {
  assert.equal(parseLimit(undefined, 240), 240);
});

test('parseLimit falls back on NaN/invalid input instead of disabling limits', () => {
  assert.equal(parseLimit('2mb', 240), 240);
  assert.equal(parseLimit('2 * 1024 * 1024', 2097152), 2097152);
  assert.equal(parseLimit('', 240), 240);
  assert.equal(parseLimit('NaN', 240), 240);
  assert.equal(parseLimit('Infinity', 240), 240);
  assert.equal(parseLimit('-5', 240), 240);
  assert.equal(parseLimit('0', 240), 240);
});
