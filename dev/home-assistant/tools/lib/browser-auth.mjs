// Shared Playwright auth helpers for Varco browser e2e tests against a live
// Home Assistant. Extracted from the dashboard-export e2e so multiple panel
// tests can reuse the same login + token bootstrap.

export async function fetchBrowserTokens(config) {
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

export async function loginIfNeeded(page, username, password) {
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

export async function openVarcoPanel(page, config, { tokens } = {}) {
  const base = config.url.replace(/\/$/, '');
  const authData = tokens || (await fetchBrowserTokens(config));
  await page.addInitScript((data) => localStorage.setItem('hassTokens', JSON.stringify(data)), authData);
  await page.goto(`${base}/varco`, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page, config.username, config.password);
  await page.locator('varco-panel').waitFor({ timeout: 60_000 });
  return authData;
}
