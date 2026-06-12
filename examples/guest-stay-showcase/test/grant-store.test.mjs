import assert from "node:assert/strict";
import { test } from "node:test";
import { clearShowcaseGrant, loadShowcaseGrant, markShowcaseGrantApproved, savePendingShowcaseGrant, SHOWCASE_GRANT_KEY } from "../dist/grant-store.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test("saves, filters, approves, and clears a guest showcase grant", () => {
  const storage = memoryStorage();
  const pending = savePendingShowcaseGrant(storage, {
    authorityId: "authority-a",
    consumerPublicKey: "consumer",
    requestId: "request",
    pairingCode: "123456",
  });

  assert.equal(pending.status, "pending");
  assert.equal(loadShowcaseGrant(storage, "other"), null);
  assert.equal(loadShowcaseGrant(storage, "authority-a")?.pairingCode, "123456");
  assert.equal(markShowcaseGrantApproved(storage, "authority-a")?.status, "approved");
  clearShowcaseGrant(storage);
  assert.equal(storage.getItem(SHOWCASE_GRANT_KEY), null);
});

test("drops malformed guest grant JSON", () => {
  const storage = memoryStorage();
  storage.setItem(SHOWCASE_GRANT_KEY, "{");
  assert.equal(loadShowcaseGrant(storage, "authority-a"), null);
  assert.equal(storage.getItem(SHOWCASE_GRANT_KEY), null);
});
