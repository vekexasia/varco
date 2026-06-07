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
  render(state) {
    if (state.loading) { this.innerHTML = '<ha-card><div class="card-content"><style>button{margin:4px 8px 4px 0;padding:8px 12px;border:0;border-radius:6px;background:var(--primary-color);color:var(--text-primary-color);cursor:pointer} code{background:var(--secondary-background-color);padding:2px 5px;border-radius:4px}</style>Loading Varco...</div></ha-card>'; return; }
    const pending = state.requests.filter((request) => request.status === 'pending');
    this.innerHTML = `
      <ha-card header="Varco Authority">
        <div class="card-content"><style>button{margin:4px 8px 4px 0;padding:8px 12px;border:0;border-radius:6px;background:var(--primary-color);color:var(--text-primary-color);cursor:pointer} code{background:var(--secondary-background-color);padding:2px 5px;border-radius:4px}</style>
          <p><b>Authority ID</b><br><code>${state.info.authority_id}</code></p>
          <p><b>Relay</b>: ${state.info.relay.connected ? 'connected' : 'disconnected'}</p>
          <h3>Pending access requests</h3>
          ${pending.length ? pending.map((request) => `
            <div style="border:1px solid var(--divider-color);padding:12px;margin:8px 0;border-radius:8px">
              <b>${request.manifest.name || 'Unknown consumer'}</b> <code>${request.pairing_code}</code>
              <div>${(request.manifest.read_entities || request.manifest.readEntities || []).length} read entities, ${(request.manifest.actions || []).length} actions</div>
              <button data-approve="${request.request_id}">Approve</button>
              <button data-reject="${request.request_id}">Reject</button>
            </div>`).join('') : '<p>No pending requests.</p>'}
          <h3>Grants</h3>
          ${state.grants.map((grant) => `<div><code>${grant.grant_id}</code> ${grant.revoked ? 'revoked' : 'active'} <button data-revoke="${grant.grant_id}">Revoke</button></div>`).join('') || '<p>No grants.</p>'}
        </div>
      </ha-card>`;
    this.querySelectorAll('[data-approve]').forEach((el) => el.onclick = () => this.call('varco/approve_request', { request_id: el.dataset.approve }));
    this.querySelectorAll('[data-reject]').forEach((el) => el.onclick = () => this.call('varco/reject_request', { request_id: el.dataset.reject }));
    this.querySelectorAll('[data-revoke]').forEach((el) => el.onclick = () => this.call('varco/revoke_grant', { grant_id: el.dataset.revoke }));
  }
}
customElements.define('varco-panel', VarcoPanel);
