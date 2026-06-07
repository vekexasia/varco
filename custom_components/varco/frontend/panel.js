class VarcoPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) this.load();
  }

  connectedCallback() { this.render({ loading: true }); }

  async load() {
    if (!this._hass) return;
    this._loaded = true;
    const [info, requests, grants] = await Promise.all([
      this._hass.connection.sendMessagePromise({ type: 'varco/info' }),
      this._hass.connection.sendMessagePromise({ type: 'varco/access_requests' }),
      this._hass.connection.sendMessagePromise({ type: 'varco/grants' }),
    ]);
    this.render({ info, requests, grants });
  }

  async call(type, payload) {
    await this._hass.connection.sendMessagePromise({ type, ...payload });
    this._loaded = false;
    await this.load();
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[char]));
  }

  manifestName(item) {
    return item?.manifest?.name || 'Unknown consumer';
  }

  manifestVersion(item) {
    return item?.manifest?.version || 'not declared';
  }

  readScopes(manifest, snakeName, camelName) {
    const value = manifest?.[snakeName] || (camelName ? manifest?.[camelName] : undefined) || [];
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }

  scopes(manifest) {
    return {
      read: this.readScopes(manifest, 'read_entities', 'readEntities'),
      subscriptions: this.readScopes(manifest, 'subscriptions'),
      history: this.readScopes(manifest, 'history'),
      cameras: this.readScopes(manifest, 'camera_snapshots', 'cameraSnapshots'),
      actions: this.readScopes(manifest, 'actions'),
    };
  }


  scopeSummary(manifest) {
    const scopes = this.scopes(manifest);
    return [
      `${scopes.read.length} read`,
      `${scopes.subscriptions.length} live`,
      `${scopes.history.length} history`,
      `${scopes.cameras.length} cameras`,
      `${scopes.actions.length} actions`,
    ].join(', ');
  }

  scopeSection(title, values) {
    return `
      <div class="scope-section">
        <div class="scope-title">${this.escape(title)}</div>
        ${values.length
          ? `<ul>${values.map((value) => `<li><code>${this.escape(value)}</code></li>`).join('')}</ul>`
          : '<div class="empty-scope">None requested</div>'}
      </div>`;
  }

  scopeDetails(manifest, open = false) {
    const scopes = this.scopes(manifest);
    return `
      <details class="scope-details" ${open ? 'open' : ''}>
        <summary>Requested permissions: ${this.escape(this.scopeSummary(manifest))}</summary>
        <div class="scope-grid">
          ${this.scopeSection('Read entity states', scopes.read)}
          ${this.scopeSection('Subscribe to live updates', scopes.subscriptions)}
          ${this.scopeSection('Query history', scopes.history)}
          ${this.scopeSection('Camera snapshots', scopes.cameras)}
          ${this.scopeSection('Home Assistant actions', scopes.actions)}
        </div>
      </details>`;
  }

  shortKey(value) {
    const text = String(value || '');
    if (text.length <= 24) return text || 'unknown';
    return `${text.slice(0, 12)}...${text.slice(-8)}`;
  }

  formatDate(value) {
    if (!value) return 'unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  requestCard(request) {
    const name = this.manifestName(request);
    return `
      <div class="varco-card pending-card">
        <div class="card-header-row">
          <div>
            <div class="eyebrow">Pending approval</div>
            <h4>Approve access for ${this.escape(name)}?</h4>
          </div>
          <div class="pairing-code" title="Pairing code shown by the consumer">${this.escape(request.pairing_code)}</div>
        </div>
        <div class="meta-grid">
          <div><span>Requested by</span><strong>${this.escape(name)}</strong></div>
          <div><span>Version</span><strong>${this.escape(this.manifestVersion(request))}</strong></div>
          <div><span>Requested at</span><strong>${this.escape(this.formatDate(request.created_at))}</strong></div>
          <div><span>Consumer key</span><code title="${this.escape(request.consumer_pk)}">${this.escape(this.shortKey(request.consumer_pk))}</code></div>
          <div><span>Request ID</span><code>${this.escape(request.request_id)}</code></div>
        </div>
        <p class="approval-note">Approving grants every permission listed below. Individual actions cannot be trimmed in this MVP.</p>
        ${this.scopeDetails(request.manifest, true)}
        <div class="button-row">
          <button class="primary" data-approve="${this.escape(request.request_id)}">Approve all listed permissions</button>
          <button class="secondary" data-reject="${this.escape(request.request_id)}">Reject</button>
        </div>
      </div>`;
  }

  grantCard(grant) {
    const name = this.manifestName(grant);
    const revoked = Boolean(grant.revoked);
    return `
      <div class="varco-card grant-card ${revoked ? 'revoked' : ''}">
        <div class="card-header-row">
          <div>
            <div class="eyebrow">Grant</div>
            <h4>${this.escape(name)}</h4>
          </div>
          <span class="status-pill ${revoked ? 'status-revoked' : 'status-active'}">${revoked ? 'revoked' : 'active'}</span>
        </div>
        <div class="meta-grid">
          <div><span>Name</span><strong>${this.escape(name)}</strong></div>
          <div><span>Version</span><strong>${this.escape(this.manifestVersion(grant))}</strong></div>
          <div><span>Created</span><strong>${this.escape(this.formatDate(grant.created_at))}</strong></div>
          ${revoked ? `<div><span>Revoked</span><strong>${this.escape(this.formatDate(grant.revoked_at))}</strong></div>` : ''}
          <div><span>Consumer key</span><code title="${this.escape(grant.consumer_pk)}">${this.escape(this.shortKey(grant.consumer_pk))}</code></div>
          <div><span>Grant ID</span><code>${this.escape(grant.grant_id)}</code></div>
          ${grant.request_id ? `<div><span>Original request</span><code>${this.escape(grant.request_id)}</code></div>` : ''}
        </div>
        ${this.scopeDetails(grant.manifest, false)}
        <div class="button-row">
          ${revoked ? '' : `<button class="secondary" data-revoke="${this.escape(grant.grant_id)}">Revoke access</button>`}
          <button class="danger" data-delete-grant="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">Delete grant record</button>
        </div>
      </div>`;
  }

  styles() {
    return `
      <style>
        :host { display: block; }
        .card-content { padding-bottom: 24px; }
        h3 { margin: 24px 0 12px; }
        h4 { margin: 2px 0 0; font-size: 18px; }
        button { margin: 4px 8px 4px 0; padding: 8px 12px; border: 0; border-radius: 6px; background: var(--primary-color); color: var(--text-primary-color); cursor: pointer; font-weight: 600; }
        button.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); }
        button.danger { background: var(--error-color, #db4437); color: white; }
        code { background: var(--secondary-background-color); padding: 2px 5px; border-radius: 4px; word-break: break-all; }
        .varco-card { border: 1px solid var(--divider-color); padding: 14px; margin: 10px 0; border-radius: 10px; background: var(--card-background-color); }
        .pending-card { border-left: 4px solid var(--primary-color); }
        .grant-card.revoked { opacity: 0.78; }
        .card-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .eyebrow { color: var(--secondary-text-color); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .pairing-code { background: var(--secondary-background-color); border-radius: 8px; font-size: 20px; font-weight: 800; letter-spacing: .08em; padding: 8px 10px; white-space: nowrap; }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 16px; margin: 14px 0; }
        .meta-grid span { color: var(--secondary-text-color); display: block; font-size: 12px; margin-bottom: 2px; }
        .meta-grid strong { display: block; }
        .approval-note { background: var(--secondary-background-color); border-radius: 8px; margin: 12px 0; padding: 10px; }
        .scope-details { margin-top: 10px; }
        .scope-details summary { cursor: pointer; font-weight: 700; }
        .scope-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
        .scope-section { border: 1px solid var(--divider-color); border-radius: 8px; padding: 10px; }
        .scope-title { font-weight: 700; margin-bottom: 6px; }
        .scope-section ul { margin: 0; padding-left: 18px; }
        .scope-section li { margin: 4px 0; }
        .empty-scope { color: var(--secondary-text-color); }
        .status-pill { border-radius: 999px; font-size: 12px; font-weight: 700; padding: 5px 8px; text-transform: uppercase; }
        .status-active { background: var(--success-color, #0b8043); color: white; }
        .status-revoked { background: var(--secondary-background-color); color: var(--secondary-text-color); }
        .button-row { margin-top: 12px; }
      </style>`;
  }

  render(state) {
    if (state.loading) {
      this.innerHTML = `<ha-card><div class="card-content">${this.styles()}Loading Varco...</div></ha-card>`;
      return;
    }
    const pending = state.requests.filter((request) => request.status === 'pending');
    this.innerHTML = `
      <ha-card header="Varco Authority">
        <div class="card-content">${this.styles()}
          <p><b>Authority ID</b><br><code>${this.escape(state.info.authority_id)}</code></p>
          <p><b>Relay</b>: ${state.info.relay.connected ? 'connected' : 'disconnected'}</p>
          <h3>Pending access requests</h3>
          ${pending.length ? pending.map((request) => this.requestCard(request)).join('') : '<p>No pending requests.</p>'}
          <h3>Grants</h3>
          ${state.grants.length ? state.grants.map((grant) => this.grantCard(grant)).join('') : '<p>No grants.</p>'}
        </div>
      </ha-card>`;
    this.querySelectorAll('[data-approve]').forEach((el) => el.onclick = () => this.call('varco/approve_request', { request_id: el.dataset.approve }));
    this.querySelectorAll('[data-reject]').forEach((el) => el.onclick = () => this.call('varco/reject_request', { request_id: el.dataset.reject }));
    this.querySelectorAll('[data-revoke]').forEach((el) => el.onclick = () => this.call('varco/revoke_grant', { grant_id: el.dataset.revoke }));
    this.querySelectorAll('[data-delete-grant]').forEach((el) => el.onclick = () => {
      if (!window.confirm(`Delete grant record for ${el.dataset.name}? This also removes active access for that consumer.`)) return;
      this.call('varco/delete_grant', { grant_id: el.dataset.deleteGrant });
    });
  }
}
customElements.define('varco-panel', VarcoPanel);
