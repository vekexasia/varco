import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { haConfig } from './lib/ha-admin.mjs';

const config = haConfig();
const base = config.url.replace(/\/$/, '');
const panelUrl = `${base}/varco`;
const artifactDir = resolve('.pi');
const screenshotPath = resolve(process.env.SCREENSHOT_PATH || '.pi/varco-dashboard-export-e2e.png');
const zipPath = resolve(process.env.ZIP_PATH || '.pi/varco-dashboard-export-e2e.zip');

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
const tokens = await fetchBrowserTokens(config);
await page.addInitScript((authData) => localStorage.setItem('hassTokens', JSON.stringify(authData)), tokens);

try {
  await page.goto(panelUrl, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page, config.username, config.password);

  await page.getByText('Dashboard brief export').waitFor({ timeout: 60_000 });

  const dashboardSelect = page.locator('varco-panel [data-dashboard-select]');
  await dashboardSelect.waitFor({ timeout: 20_000 });
  const dashboardValue = await dashboardSelect.evaluate((select) => {
    const option = [...select.options].find((item) => item.textContent.includes('Varco Showcase'));
    if (!option) throw new Error('Varco Showcase dashboard option not found');
    return option.value;
  });
  await dashboardSelect.selectOption(dashboardValue);

  const viewSelect = page.locator('varco-panel [data-view-select]');
  await viewSelect.waitFor({ timeout: 20_000 });
  const energyValue = await viewSelect.evaluate((select) => {
    const option = [...select.options].find((item) => item.textContent.includes('Energy'));
    if (!option) throw new Error('Energy view option not found');
    return option.value;
  });
  await viewSelect.selectOption(energyValue);

  await page.locator('varco-panel [data-export-entity="sensor.powerwall_load_w"]').waitFor({ timeout: 20_000 });
  const evCharger = page.locator('varco-panel [data-export-entity="switch.ev_charger"]');
  await evCharger.waitFor({ timeout: 20_000 });
  await evCharger.uncheck();
  await page.getByText(/\d+ of \d+ harvested entities selected/).waitFor({ timeout: 10_000 });

  mkdirSync(artifactDir, { recursive: true });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('varco-panel [data-download-brief]').click();
  const download = await downloadPromise;
  await download.saveAs(zipPath);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  execFileSync('unzip', ['-t', zipPath], { stdio: 'inherit' });
  const manifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }));
  const brief = execFileSync('unzip', ['-p', zipPath, 'brief.md'], { encoding: 'utf8' });

  assert(manifest.name === 'Varco Showcase / Energy', `Unexpected manifest name: ${manifest.name}`);
  assert(manifest.read_entities.includes('sensor.powerwall_load_w'), 'Expected sensor.powerwall_load_w read scope');
  assert(manifest.subscriptions.includes('sensor.powerwall_load_w'), 'Expected sensor.powerwall_load_w subscription scope');
  assert(manifest.history.includes('sensor.powerwall_load_w'), 'Expected sensor.powerwall_load_w history scope');
  assert(!manifest.read_entities.includes('switch.ev_charger'), 'Unchecked switch.ev_charger should be pruned from read scopes');
  assert(!manifest.subscriptions.includes('switch.ev_charger'), 'Unchecked switch.ev_charger should be pruned from subscriptions');
  assert(Array.isArray(manifest.actions) && manifest.actions.length === 0, 'Export should not emit actions');
  assert(brief.includes('You are a coding agent building an external Varco consumer'), 'Brief should contain coding-agent preamble');
  assert(brief.includes(tokens.hassUrl) === false, 'Brief should not embed Home Assistant URL');
  assert(brief.includes('createVarcoConsumerClient'), 'Brief should include @varco/client bootstrap');

  console.log(`Varco dashboard export browser e2e passed. Zip: ${zipPath}. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchBrowserTokens(config) {
  const baseUrl = config.url.replace(/\/$/, '');
  const clientId = config.clientId || `${baseUrl}/`;
  const redirectUri = `${clientId.replace(/\/$/, '')}/?auth_callback=1`;
  const flowResponse = await postJson(`${baseUrl}/auth/login_flow`, {
    client_id: clientId,
    handler: ['homeassistant', null],
    redirect_uri: redirectUri,
  });
  const loginResponse = await postJson(`${baseUrl}/auth/login_flow/${flowResponse.flow_id}`, {
    username: config.username,
    password: config.password,
    client_id: clientId,
  });
  const tokenResponse = await postForm(`${baseUrl}/auth/token`, {
    grant_type: 'authorization_code',
    code: loginResponse.result,
    client_id: clientId,
  });
  return {
    hassUrl: baseUrl,
    clientId,
    expires: Date.now() + tokenResponse.expires_in * 1000,
    refresh_token: tokenResponse.refresh_token,
    access_token: tokenResponse.access_token,
    expires_in: tokenResponse.expires_in,
  };
}

async function postJson(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function postForm(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  if (!response.ok) throw new Error(`${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function loginIfNeeded(page, username, password) {
  const usernameInput = page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first();
  try {
    await usernameInput.waitFor({ timeout: 8_000 });
  } catch {
    return;
  }

  await page.waitForTimeout(1000);
  await usernameInput.fill(username);
  const passwordInput = page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first();
  await passwordInput.fill(password);

  const loginButton = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .filter((rect) => rect.width > 200 && rect.height > 20)
      .sort((left, right) => right.width - left.width);
    const rect = buttons[0];
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  });
  if (loginButton) await page.mouse.click(loginButton.x, loginButton.y);
  else await passwordInput.press('Enter');

  await page.waitForURL((url) => !url.pathname.includes('/auth/authorize'), { timeout: 30_000 }).catch(() => {});
}
