/**
 * Live integration test: pair a real grant against a running Home Assistant,
 * then verify add/remove/PIN/rate-limit restrictions end-to-end over the relay.
 *
 * Requires a live Home Assistant at HA_URL (default http://127.0.0.1:8123)
 * with Varco loaded and relay connected.
 *
 * Run:
 *   npm run dev:ha:restrictions-smoke
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runVarcoRestrictionsSmoke } from '../lib/varco-dev.mjs';

test('restrictions smoke: pair grant, add/remove expiry, PIN, and rate-limit restrictions against live HA', async () => {
  const result = await runVarcoRestrictionsSmoke({ log: console.log });
  assert.ok(result.deniedByExpiry, 'expired restriction should deny data-plane calls');
  assert.ok(result.deniedByPin, 'PIN restriction should deny call without PIN');
  assert.ok(result.deniedByWrongPin, 'PIN restriction should deny call with wrong PIN');
  assert.ok(result.deniedByRateLimit, 'rate-limit restriction should deny calls over the limit');
  assert.ok(result.subscriptionInvalidated, 'restriction update should stop existing subscriptions');
});
