import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOWCASE_GRANT_KEY,
  clearShowcaseGrant,
  loadShowcaseGrant,
  markShowcaseGrantApproved,
  savePendingShowcaseGrant,
} from '../dist/grant-store.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test('showcase persists pending grant metadata for the current authority', () => {
  const storage = new MemoryStorage();
  const saved = savePendingShowcaseGrant(storage, {
    authorityId: 'authority-1',
    consumerPublicKey: 'consumer-pk',
    requestId: 'req-1',
    pairingCode: '123456',
  });

  assert.equal(saved.status, 'pending');
  assert.equal(JSON.parse(storage.getItem(SHOWCASE_GRANT_KEY)).pairingCode, '123456');
  assert.equal(loadShowcaseGrant(storage, 'authority-1').requestId, 'req-1');
  assert.equal(loadShowcaseGrant(storage, 'other-authority'), null);
});

test('showcase marks saved grant approved after a successful connect and can clear it', () => {
  const storage = new MemoryStorage();
  savePendingShowcaseGrant(storage, {
    authorityId: 'authority-1',
    consumerPublicKey: 'consumer-pk',
    requestId: 'req-1',
    pairingCode: '123456',
  });

  assert.equal(markShowcaseGrantApproved(storage, 'authority-1').status, 'approved');
  assert.equal(loadShowcaseGrant(storage, 'authority-1').status, 'approved');
  clearShowcaseGrant(storage);
  assert.equal(loadShowcaseGrant(storage, 'authority-1'), null);
});
