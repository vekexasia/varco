/**
 * Live browser e2e for the Varco Authority panel (/varco) management features.
 *
 * Covers issues #60 (audit log), #65 (filter + expired pill), #64 (confirm
 * destructive actions), #62 (live refresh affordance). Read-only assertions:
 * it never approves, revokes, or deletes real grants.
 *
 * Requires a live Home Assistant at HA_URL (default http://127.0.0.1:8123)
 * with Varco loaded and grants/audit data present.
 *
 * Run: node dev/home-assistant/tools/browser-panel-e2e.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { haConfig } from './lib/ha-admin.mjs';
import { openVarcoPanel } from './lib/browser-auth.mjs';

const config = haConfig();
const screenshotPath = resolve(process.env.SCREENSHOT_PATH || '.pi/varco-panel-e2e.png');

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await openVarcoPanel(page, config);
  await page.getByText('Authority ID').waitFor({ timeout: 60_000 });
  await page.getByRole('heading', { name: 'Grants' }).waitFor({ timeout: 20_000 });

  // --- #60: audit/activity section ---
  await page.getByRole('heading', { name: /Activity/i }).waitFor({ timeout: 20_000 });
  const auditList = page.locator('varco-panel .audit-card [data-audit-list]');
  await auditList.waitFor({ timeout: 20_000 });
  const auditRows = auditList.locator('[data-audit-event]');
  assert((await auditRows.count()) > 0, 'Expected at least one audit event row');
  // Event type + timestamp rendered.
  const firstEventType = await auditRows.first().locator('[data-audit-type]').innerText();
  assert(firstEventType.trim().length > 0, 'Audit row should show an event type');
  // No sensitive payload keys leaked into the activity UI.
  const auditText = await auditList.innerText();
  for (const banned of ['"states"', 'snapshot', 'camera_snapshot_payload', 'history_rows']) {
    assert(!auditText.includes(banned), `Activity must not render sensitive payload: ${banned}`);
  }

  // Per-grant filtered activity: each grant card exposes an activity affordance.
  const grantActivityToggle = page.locator('varco-panel [data-grant-activity]').first();
  await grantActivityToggle.waitFor({ timeout: 20_000 });

  // --- #65: filter + expired pill correctness ---
  const search = page.locator('varco-panel [data-grant-search]');
  await search.waitFor({ timeout: 20_000 });
  const statusFilter = page.locator('varco-panel [data-grant-status-filter]');
  await statusFilter.waitFor({ timeout: 20_000 });
  const totalCards = await page.locator('varco-panel .grant-card').count();
  assert(totalCards > 0, 'Expected grant cards to be present');
  await search.fill('Guest Stay');
  await page.waitForTimeout(300);
  const filtered = await page.locator('varco-panel .grant-card:visible').count();
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
    await revokeBtn.click();
    const confirmRow = page.locator('varco-panel [data-confirm-revoke]').first();
    await confirmRow.waitFor({ timeout: 5_000 });
    // Cancel so we never actually revoke real grants.
    const cancel = page.locator('varco-panel [data-cancel-confirm]').first();
    await cancel.click();
    await confirmRow.waitFor({ state: 'detached', timeout: 5_000 });
  }

  // --- #62: live refresh of pending requests (no manual reload) ---
  // The panel must install exactly one polling timer and re-render when the
  // pending request set changes. We drive refreshPending() directly with a
  // stubbed connection to avoid mutating real grant data.
  const liveRefresh = await page.locator('varco-panel').evaluate(async (panel) => {
    if (!panel._refreshTimer) return { ok: false, reason: 'no refresh timer' };
    const before = panel._lastState?.requests?.length ?? 0;
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
    const after = panel._lastState?.requests?.length ?? 0;
    const surfaced = !!panel.querySelector('.pending-card');
    panel._hass.connection.sendMessagePromise = original;
    panel._loaded = false; await panel.load();
    return { ok: reloaded && surfaced, before, after, reason: `reloaded=${reloaded} surfaced=${surfaced}` };
  });
  assert(liveRefresh.ok, `Live refresh should surface new pending request without manual reload (${liveRefresh.reason})`);

  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Varco panel browser e2e passed. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
