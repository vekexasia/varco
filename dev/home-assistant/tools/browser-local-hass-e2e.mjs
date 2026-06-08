import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { haConfig } from './lib/ha-admin.mjs';

const config = haConfig();
const base = config.url.replace(/\/$/, '');
const dashboardUrl = `${base}/varco-local-hass/hass-first`;
const screenshotPath = resolve(process.env.SCREENSHOT_PATH || '.pi/varco-local-hass-e2e.png');

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const tokens = await fetchBrowserTokens(config);
await page.addInitScript((authData) => localStorage.setItem('hassTokens', JSON.stringify(authData)), tokens);

try {
  await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page, config.username, config.password);

  await page.getByText('Varco local Home Assistant mode').waitFor({ timeout: 60_000 });
  await page.getByText('Connected through createVarcoConsumerClient({ hass })').waitFor({ timeout: 60_000 });
  await page.getByText('home-assistant').waitFor({ timeout: 10_000 });
  await page.getByText('sensor.powerwall_load_w', { exact: true }).first().waitFor({ timeout: 10_000 });
  await page.getByText('switch.ev_charger', { exact: true }).first().waitFor({ timeout: 10_000 });

  await page.getByRole('button', { name: /Query local HA history/i }).click();
  await page.getByText(/sensor\.powerwall_load_w: \d+ history rows from HA websocket/).waitFor({ timeout: 20_000 });

  await page.getByRole('button', { name: /Toggle switch\.ev_charger/i }).click();
  await page.getByText(/Called switch\.(turn_on|turn_off) locally for switch\.ev_charger/).waitFor({ timeout: 20_000 });
  await page.getByText('state_delta').waitFor({ timeout: 20_000 });

  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Varco local hass browser e2e passed. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
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
