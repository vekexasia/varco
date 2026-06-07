export const DEFAULT_HA_URL = 'http://127.0.0.1:8123';
export const DEFAULT_HA_USERNAME = 'test';
export const DEFAULT_HA_PASSWORD = 'test';

export function haConfig(env = process.env) {
  return {
    url: env.HA_URL || DEFAULT_HA_URL,
    username: env.HA_USERNAME || DEFAULT_HA_USERNAME,
    password: env.HA_PASSWORD || DEFAULT_HA_PASSWORD,
    clientId: env.HA_CLIENT_ID,
  };
}

export async function loginToHomeAssistant(options = {}) {
  const { url, username, password, clientId: configuredClientId } = { ...haConfig(), ...options };
  const fetchImpl = options.fetchImpl || fetch;
  const base = url.replace(/\/$/, '');
  const clientId = configuredClientId || `${base}/`;
  const redirectUri = `${clientId.replace(/\/$/, '')}/?auth_callback=1`;

  const flowResponse = await postJson(fetchImpl, `${base}/auth/login_flow`, {
    client_id: clientId,
    handler: ['homeassistant', null],
    redirect_uri: redirectUri,
  });
  const loginResponse = await postJson(fetchImpl, `${base}/auth/login_flow/${flowResponse.flow_id}`, {
    username,
    password,
    client_id: clientId,
  });
  const tokenResponse = await postForm(fetchImpl, `${base}/auth/token`, {
    grant_type: 'authorization_code',
    code: loginResponse.result,
    client_id: clientId,
  });
  return tokenResponse.access_token;
}

async function postJson(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(response, url);
}

async function postForm(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  return readJson(response, url);
}

async function readJson(response, url) {
  if (!response.ok) throw new Error(`${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

export class HomeAssistantAdminClient {
  constructor(options) {
    this.url = options.url.replace(/\/$/, '');
    this.token = options.token;
    this.WebSocketImpl = options.WebSocketImpl || WebSocket;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = null;
    this.socket = null;
  }

  async command(type, payload = {}) {
    await this.connect();
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, type, ...payload }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.socket?.close();
  }

  connect() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(this.websocketUrl());
      this.socket = socket;
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: this.token }));
          return;
        }
        if (message.type === 'auth_ok') {
          resolve();
          return;
        }
        if (message.type === 'auth_invalid') {
          reject(new Error(message.message || 'Home Assistant WebSocket auth failed'));
          return;
        }
        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.success === false) pending.reject(new Error(message.error?.message || 'Home Assistant command failed'));
          else pending.resolve(message.result);
        }
      };
      socket.onerror = () => reject(new Error('Home Assistant WebSocket failed'));
    });
    return this.ready;
  }

  websocketUrl() {
    const parsed = new URL(this.url);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/api/websocket';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  }
}
