/**
 * Live browser e2e for the Varco Authority panel (/varco).
 *
 * Covers the redesigned panel: #60 (audit log), #65 (filter + expired pill),
 * #64 (confirm destructive actions), #62 (live refresh), #66 (relay health),
 * #61 (approve-with-expiry, now a multi-step wizard), #63 (restriction
 * toggle/edit hooks). It seeds one reusable grant through the relay at start
 * (so the panel has grant + audit data to render) and deletes that grant on
 * exit. It never approves, revokes, or deletes any other real grant.
 *
 * Requires a live Home Assistant at HA_URL (default http://127.0.0.1:8123)
 * with Varco loaded, and a reachable bridge at VARCO_BRIDGE_URL for pairing.
 *
 * Run: node dev/home-assistant/tools/browser-panel-e2e.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { haConfig } from './lib/ha-admin.mjs';
import { createHomeAssistantAdmin, deleteGrant, pairVarcoConsumer } from './lib/varco-dev.mjs';
import { openVarcoPanel } from './lib/browser-auth.mjs';

const config = haConfig();
const screenshotPath = resolve(process.env.SCREENSHOT_PATH || '.pi/varco-panel-e2e.png');

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

// Seed a reusable grant before opening the panel so the grant cards, per-grant
// activity affordance, and audit log all have data to render. Pairing connects
// the consumer through the bridge and approves a persistent grant.
let seededGrantId = null;

try {
  const seeded = await pairVarcoConsumer({ ...config });
  seededGrantId = seeded.grantId;
  console.log(`Seeded panel e2e grant: ${seededGrantId}`);

  await openVarcoPanel(page, config);
  await page.getByText('Authority', { exact: true }).first().waitFor({ timeout: 60_000 });
  await page.locator('varco-panel .sec-title', { hasText: /^Grants/ }).waitFor({ timeout: 20_000 });

  // --- #60: audit/activity section ---
  await page.locator('varco-panel .sec-title', { hasText: /^Activity/ }).waitFor({ timeout: 20_000 });
  const auditList = page.locator('varco-panel .audit-card [data-audit-list]');
  await auditList.waitFor({ timeout: 20_000 });
  const auditRows = auditList.locator('[data-audit-event]');
  assert((await auditRows.count()) > 0, 'Expected at least one audit event row');
  const firstEventType = await auditRows.first().locator('[data-audit-type]').innerText();
  assert(firstEventType.trim().length > 0, 'Audit row should show an event type');
  const auditText = await auditList.innerText();
  for (const banned of ['"states"', 'snapshot', 'camera_snapshot_payload', 'history_rows']) {
    assert(!auditText.includes(banned), `Activity must not render sensitive payload: ${banned}`);
  }

  // Per-grant filtered activity affordance.
  await page.locator('varco-panel [data-grant-activity]').first().waitFor({ timeout: 20_000 });

  // --- #65: filter + expired pill correctness ---
  const search = page.locator('varco-panel [data-grant-search]');
  await search.waitFor({ timeout: 20_000 });
  await page.locator('varco-panel [data-grant-status-seg]').waitFor({ timeout: 20_000 });
  const totalCards = await page.locator('varco-panel .grant').count();
  assert(totalCards > 0, 'Expected grant cards to be present');
  await search.fill('Guest Stay');
  await page.waitForTimeout(300);
  const filtered = await page.locator('varco-panel .grant:visible').count();
  assert(filtered < totalCards, `Search should reduce visible grants (${filtered} of ${totalCards})`);
  await search.fill('');
  await page.waitForTimeout(300);

  // --- #64: revoke + delete need confirmation, no native confirm/alert ---
  const usesNativeConfirm = await page.locator('varco-panel').evaluate((panel) => {
    const src = panel.constructor?.toString() || '';
    return /window\.confirm|[^.]\balert\(/.test(src);
  });
  assert(!usesNativeConfirm, 'Panel must not use window.confirm/alert for destructive actions');
  const revokeBtn = page.locator('varco-panel [data-revoke]').first();
  if ((await revokeBtn.count()) > 0) {
    await revokeBtn.scrollIntoViewIfNeeded();
    await revokeBtn.click();
    const confirmModal = page.locator('varco-panel [data-revoke-confirm]').first();
    await confirmModal.waitFor({ timeout: 5_000 });
    await page.locator('varco-panel .modal-scrim [data-revoke-cancel]').first().click();
    await confirmModal.waitFor({ state: 'detached', timeout: 5_000 });
  }

  // --- #62: live refresh of pending requests (no manual reload) ---
  const liveRefresh = await page.locator('varco-panel').evaluate(async (panel) => {
    if (!panel._refreshTimer) return { ok: false, reason: 'no refresh timer' };
    const fakeId = `e2e-fake-${Date.now()}`;
    const original = panel._hass.connection.sendMessagePromise.bind(panel._hass.connection);
    let reloaded = false;
    panel._hass.connection.sendMessagePromise = (msg) => {
      if (msg.type === 'varco/access_requests') {
        reloaded = true;
        return Promise.resolve([{ request_id: fakeId, status: 'pending', manifest: { name: 'E2E Live Refresh' }, pairing_code: '000000', consumer_pk: 'x', created_at: new Date().toISOString() }]);
      }
      return original(msg);
    };
    await panel.refreshPending();
    const surfaced = !!panel.querySelector('[data-request-card]');
    panel._hass.connection.sendMessagePromise = original;
    panel._loaded = false;
    await panel.load();
    return { ok: reloaded && surfaced, reason: `reloaded=${reloaded} surfaced=${surfaced}` };
  });
  assert(liveRefresh.ok, `Live refresh should surface new pending request without manual reload (${liveRefresh.reason})`);

  // --- #66: relay health block ---
  await page.locator('varco-panel [data-relay-status]').waitFor({ timeout: 20_000 });
  const bridgeUrl = await page.locator('varco-panel [data-relay-bridge-url]').innerText();
  assert(bridgeUrl.trim().length > 0 && bridgeUrl.trim() !== 'unknown', `Relay block should show a bridge URL (got: ${bridgeUrl})`);
  await page.locator('varco-panel [data-relay-last-connected]').waitFor({ timeout: 5_000 });

  // --- #61 + wizard: multi-step approval flow ---
  const firstCard = page.locator('varco-panel [data-request-card]').first();
  if ((await firstCard.count()) > 0) {
    const id = await firstCard.getAttribute('data-request-card');
    // Step 1 visible by default.
    assert(await page.locator(`varco-panel [data-pane-for="${cssEsc(id)}"][data-pane="1"]`).isVisible(), 'Wizard step 1 should be visible initially');
    // Advance to step 2 (permissions).
    await clickActiveNext(page, id);
    await page.waitForTimeout(250);
    assert(await page.locator(`varco-panel [data-pane-for="${cssEsc(id)}"][data-pane="2"]`).isVisible(), 'Wizard step 2 (permissions) should show after Next');
    // Editable scope checkboxes present.
    assert((await page.locator(`varco-panel [data-scope-request="${cssEsc(id)}"]`).count()) > 0, 'Permission checkboxes should render in step 2');
    // Advance to step 3 (duration).
    await clickActiveNext(page, id);
    await page.waitForTimeout(250);
    assert(await page.locator(`varco-panel [data-pane-for="${cssEsc(id)}"][data-pane="3"]`).isVisible(), 'Wizard step 3 (duration) should show');
    // Pick the 24h expiry chip; the hidden expiry input must reflect it.
    await page.locator(`varco-panel [data-expiry-chip="${cssEsc(id)}"][data-expiry-value="86400000"]`).click();
    const expiryVal = await page.locator(`varco-panel [data-approve-expiry="${cssEsc(id)}"]`).inputValue();
    assert(expiryVal === '86400000', `Expiry chip should set the approve expiry value (got ${expiryVal})`);
    // Approve handler must wire expires_at + the duration control.
    const expiryWired = await page.locator('varco-panel').evaluate((panel) => {
      const src = panel.constructor?.toString() || '';
      return /expires_at/.test(src) && /data-approve-expiry/.test(src);
    });
    assert(expiryWired, 'Approve handler must support expires_at via the duration control');
    // --- fix-round-1 #2: "Custom" expiry with an empty datetime must NOT approve ---
    const customAbort = await page.locator('varco-panel').evaluate(async (panel, id) => {
      const conn = panel._hass.connection;
      const original = conn.sendMessagePromise.bind(conn);
      let approveSent = false;
      conn.sendMessagePromise = (msg) => {
        if (msg && msg.type === 'varco/approve_request') approveSent = true;
        return original(msg);
      };
      try {
        const chip = panel.querySelector(`[data-expiry-chip="${CSS.escape(id)}"][data-expiry-value="custom"]`);
        chip.click();
        const custom = panel.querySelector(`[data-approve-expiry-custom="${CSS.escape(id)}"]`);
        custom.value = '';
        panel.querySelector(`[data-approve="${CSS.escape(id)}"]`).click();
        await new Promise((r) => setTimeout(r, 300));
        const cardStillPresent = !!panel.querySelector(`[data-request-card="${CSS.escape(id)}"]`);
        const errorShown = !!panel.querySelector(`[data-approve-summary="${CSS.escape(id)}"] [data-rf-error]`);
        return { approveSent, cardStillPresent, errorShown };
      } finally {
        conn.sendMessagePromise = original;
      }
    }, id);
    assert(!customAbort.approveSent, 'Custom expiry with empty datetime must not send varco/approve_request');
    assert(customAbort.cardStillPresent, 'Request card must remain after aborted custom-expiry approval');
    assert(customAbort.errorShown, 'An inline error must show when custom expiry is empty');
    // Reject is reachable without approving (do not click it).
    assert((await page.locator(`varco-panel [data-reject="${cssEsc(id)}"]`).count()) > 0, 'Reject should remain available in the wizard');
  }

  // --- #63: restrictions toggle + edit hooks (rendered by restrictionRow) ---
  const restrictionHooks = await page.locator('varco-panel').evaluate((panel) => {
    const html = panel.restrictionRow({ id: 'r1', type: 'rate_limit', enabled: true, applies_to: 'grant', params: { limit: 5, window_seconds: 60 } }, 0, 'GRANT_X');
    return {
      toggle: /data-toggle-restriction/.test(html),
      edit: /data-edit-restriction/.test(html),
      remove: /data-remove-restriction/.test(html),
    };
  });
  assert(restrictionHooks.toggle, 'Restriction row must expose an enable/disable toggle hook');
  assert(restrictionHooks.edit, 'Restriction row must expose an edit-in-place hook');
  assert(restrictionHooks.remove, 'Restriction row must keep the remove hook');

  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Varco panel browser e2e passed. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
  if (seededGrantId) {
    try {
      const admin = await createHomeAssistantAdmin({ ...config });
      await deleteGrant(admin, seededGrantId);
      admin.close?.();
      console.log(`Cleaned up panel e2e grant: ${seededGrantId}`);
    } catch (err) {
      console.warn(`Failed to clean up seeded grant ${seededGrantId}: ${err?.message || err}`);
    }
  }
}

function cssEsc(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

// Click the "Next" button inside whichever wizard pane is currently shown for
// this request. Done via evaluate because off-screen panes hold matching hooks.
async function clickActiveNext(page, id) {
  await page.locator('varco-panel').evaluate((panel, id) => {
    const btn = panel.querySelector(`[data-pane-for="${CSS.escape(id)}"].show [data-step-next]`);
    if (!btn) throw new Error('No active step-next button found');
    btn.click();
  }, id);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
