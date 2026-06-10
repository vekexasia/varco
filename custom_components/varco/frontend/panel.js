class VarcoPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) this.load();
  }

  connectedCallback() {
    this.render({ loading: true });
    // Delegated click handler for dynamically-injected buttons.
    // Attached once here so it survives re-renders without accumulating listeners.
    this.addEventListener('click', async (ev) => {
      const saveBtn = ev.target.closest('[data-rf-save]');
      if (saveBtn) {
        const grantId = saveBtn.dataset.rfSave;
        const newR = this.buildNewRestriction(grantId);
        if (!newR) return;
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const existing = Array.isArray(grant?.restrictions) ? grant.restrictions : [];
        await this._hass.connection.sendMessagePromise({ type: 'varco/update_grant_restrictions', grant_id: grantId, restrictions: [...existing, newR] });
        this._loaded = false; await this.load();
      }
    });
  }

  async load() {
    if (!this._hass) return;
    this._loaded = true;
    const [info, requests, grants] = await Promise.all([
      this._hass.connection.sendMessagePromise({ type: 'varco/info' }),
      this._hass.connection.sendMessagePromise({ type: 'varco/access_requests' }),
      this._hass.connection.sendMessagePromise({ type: 'varco/grants' }),
    ]);
    await this.loadDashboards();
    this.render({ info, requests, grants });
  }

  async loadDashboards() {
    try {
      const dashboards = await this._hass.connection.sendMessagePromise({ type: 'lovelace/dashboards/list' });
      this._dashboards = [
        { title: 'Overview', url_path: null, mode: 'default' },
        ...dashboards.map((dashboard) => ({
          title: dashboard.title || dashboard.url_path || 'Dashboard',
          url_path: dashboard.url_path,
          mode: dashboard.mode || 'storage',
        })),
      ];
      this._dashboardError = '';
    } catch (err) {
      this._dashboards = [{ title: 'Overview', url_path: null, mode: 'default' }];
      this._dashboardError = `Could not list dashboards: ${err.message || err}`;
    }
  }

  async call(type, payload) {
    await this._hass.connection.sendMessagePromise({ type, ...payload });
    this._loaded = false;
    await this.load();
  }

  async pickDashboard(index) {
    if (index === '') {
      this._selectedDashboardIndex = undefined;
      this._exportConfig = null;
      this._exportResult = null;
      this.render(this._lastState);
      return;
    }
    const dashboard = this._dashboards?.[Number(index)];
    if (!dashboard) return;
    this._exportLoading = true;
    this._exportError = '';
    this.render(this._lastState);
    try {
      const message = { type: 'lovelace/config', force: false };
      if (dashboard.url_path !== null && dashboard.url_path !== undefined) message.url_path = dashboard.url_path;
      this._exportConfig = await this._hass.connection.sendMessagePromise(message);
      this._selectedDashboardIndex = Number(index);
      this._selectedViewIndex = '';
      await this.refreshExportPreview();
    } catch (err) {
      this._exportError = `Could not load dashboard: ${err.message || err}`;
      this._exportResult = null;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState);
    }
  }

  async pickView(value) {
    this._selectedViewIndex = value;
    this._exportLoading = true;
    this.render(this._lastState);
    try {
      await this.refreshExportPreview();
    } catch (err) {
      this._exportError = `Could not harvest view: ${err.message || err}`;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState);
    }
  }

  async refreshExportPreview() {
    const result = await this.requestDashboardExport();
    this._exportResult = result;
    this._selectedEntities = new Set(result.entities.filter((entity) => entity.selected).map((entity) => entity.entity_id));
  }

  async requestDashboardExport(selectedEntities) {
    const dashboard = this._dashboards?.[this._selectedDashboardIndex];
    const message = {
      type: 'varco/dashboard_export',
      config: this._exportConfig,
      dashboard_title: dashboard?.title || 'Home Assistant dashboard',
      dashboard_url_path: dashboard?.url_path ?? null,
    };
    if (this._selectedViewIndex !== '' && this._selectedViewIndex !== undefined && this._selectedViewIndex !== null) {
      message.view_index = Number(this._selectedViewIndex);
    }
    if (selectedEntities) message.selected_entities = selectedEntities;
    return this._hass.connection.sendMessagePromise(message);
  }

  toggleEntity(entityId, checked) {
    if (!this._selectedEntities) this._selectedEntities = new Set();
    if (checked) this._selectedEntities.add(entityId);
    else this._selectedEntities.delete(entityId);
    if (this._exportResult) {
      this._exportResult.entities = this._exportResult.entities.map((entity) => entity.entity_id === entityId ? { ...entity, selected: checked } : entity);
    }
    this.render(this._lastState);
  }

  async downloadDashboardBrief() {
    if (!this._exportResult) return;
    this._exportLoading = true;
    this.render(this._lastState);
    try {
      const selected = Array.from(this._selectedEntities || []);
      const exportResult = await this.requestDashboardExport(selected);
      const zip = this.createZip({
        'brief.md': exportResult.brief,
        'manifest.json': `${JSON.stringify(exportResult.manifest, null, 2)}\n`,
      });
      const dashboard = this._dashboards?.[this._selectedDashboardIndex];
      const name = this.slugify(`${dashboard?.title || 'varco-dashboard'}-${exportResult.dashboard?.view_title || 'brief'}`);
      this.downloadBlob(zip, `${name}.zip`);
      this._exportResult = exportResult;
      this._selectedEntities = new Set(exportResult.entities.filter((entity) => entity.selected).map((entity) => entity.entity_id));
    } catch (err) {
      this._exportError = `Could not generate brief: ${err.message || err}`;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState);
    }
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

  readScopes(manifest, name) {
    // The Authority normalizes manifests to canonical snake_case before storage.
    const value = manifest?.[name] || [];
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }

  scopes(manifest) {
    return {
      read: this.readScopes(manifest, 'read_entities'),
      subscriptions: this.readScopes(manifest, 'subscriptions'),
      history: this.readScopes(manifest, 'history'),
      cameras: this.readScopes(manifest, 'camera_snapshots'),
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

  // Editable variant for pending requests: each scope entry gets a checkbox so
  // the owner can untick entries before approving (partial approval).
  scopeSectionEditable(title, key, values, requestId) {
    return `
      <div class="scope-section">
        <div class="scope-title">${this.escape(title)}</div>
        ${values.length
          ? `<ul>${values.map((value) => `<li><label><input type="checkbox" checked data-scope-request="${this.escape(requestId)}" data-scope-key="${this.escape(key)}" value="${this.escape(value)}"> <code>${this.escape(value)}</code></label></li>`).join('')}</ul>`
          : '<div class="empty-scope">None requested</div>'}
      </div>`;
  }

  scopeDetailsEditable(manifest, requestId) {
    const scopes = this.scopes(manifest);
    return `
      <details class="scope-details" open>
        <summary>Requested permissions: ${this.escape(this.scopeSummary(manifest))}</summary>
        <div class="scope-grid">
          ${this.scopeSectionEditable('Read entity states', 'read_entities', scopes.read, requestId)}
          ${this.scopeSectionEditable('Subscribe to live updates', 'subscriptions', scopes.subscriptions, requestId)}
          ${this.scopeSectionEditable('Query history', 'history', scopes.history, requestId)}
          ${this.scopeSectionEditable('Camera snapshots', 'camera_snapshots', scopes.cameras, requestId)}
          ${this.scopeSectionEditable('Home Assistant actions', 'actions', scopes.actions, requestId)}
        </div>
      </details>`;
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
        <p class="approval-note">Untick any permission you do not want to grant before approving.</p>
        ${this.scopeDetailsEditable(request.manifest, request.request_id)}
        <div class="button-row">
          <button class="primary" data-approve="${this.escape(request.request_id)}">Approve selected permissions</button>
          <button class="secondary" data-reject="${this.escape(request.request_id)}">Reject</button>
        </div>
      </div>`;
  }

  grantCard(grant) {
    const name = this.manifestName(grant);
    const revoked = Boolean(grant.revoked);
    const restrictions = Array.isArray(grant.restrictions) ? grant.restrictions : [];
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
        ${revoked ? '' : this.restrictionsSection(grant.grant_id, restrictions)}
        <div class="button-row">
          ${revoked ? '' : `<button class="secondary" data-revoke="${this.escape(grant.grant_id)}">Revoke access</button>`}
          <button class="danger" data-delete-grant="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">Delete grant record</button>
        </div>
      </div>`;
  }

  restrictionsSection(grantId, restrictions) {
    const formId = `rf-${grantId}`;
    const activeHtml = restrictions.length
      ? `<div class="restriction-list">${restrictions.map((r, i) => this.restrictionRow(r, i, grantId)).join('')}</div>`
      : '<p class="empty-scope">No restrictions set.</p>';
    return `
      <details class="scope-details restriction-section">
        <summary>Restrictions (${restrictions.length})</summary>
        ${activeHtml}
        <div class="restriction-form" id="${this.escape(formId)}">
          <div class="field-label" style="margin-top:14px">Add restriction</div>
          <div class="restriction-form-row">
            <select data-rf-type="${this.escape(grantId)}">
              <option value="">Choose type…</option>
              <option value="expiry">Expiry — deny after a date/time</option>
              <option value="schedule">Schedule — allow only in time window</option>
              <option value="pin">PIN — require a code to act</option>
              <option value="rate_limit">Rate limit — max N calls per window</option>
            </select>
          </div>
          <div data-rf-fields="${this.escape(grantId)}"></div>
        </div>
      </details>`;
  }

  restrictionTypeFields(type) {
    const appliesToField = `
      <label class="field-label" style="margin-top:10px">Applies to
        <small style="font-weight:400;color:var(--secondary-text-color)"> — grant / actions / read / history / camera / domain.service@entity_id</small>
      </label>
      <input type="text" data-rf-applies placeholder="grant" value="grant" style="display:block;width:100%;max-width:420px;padding:7px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);margin-bottom:10px">`; 
    if (type === 'expiry') return appliesToField + `
      <label class="field-label">Deny after</label>
      <input type="datetime-local" data-rf-expires style="display:block;width:100%;max-width:420px;padding:7px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);margin-bottom:10px">`; 
    if (type === 'schedule') return appliesToField + `
      <label class="field-label">Allowed days</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${['mon','tue','wed','thu','fri','sat','sun'].map(d => `<label><input type="checkbox" data-rf-day="${d}" checked> ${d}</label>`).join(' ')}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="field-label">From <input type="time" data-rf-start value="08:00" style="margin-left:6px;padding:5px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color)"></label>
        <label class="field-label">Until <input type="time" data-rf-end value="22:00" style="margin-left:6px;padding:5px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color)"></label>
      </div>`;
    if (type === 'pin') return appliesToField + `
      <label class="field-label">PIN <small style="font-weight:400;color:var(--secondary-text-color)">(set by you, never stored as plaintext)</small></label>
      <input type="password" data-rf-pin placeholder="Enter PIN" autocomplete="new-password" style="display:block;width:100%;max-width:280px;padding:7px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);margin-bottom:10px">`; 
    if (type === 'rate_limit') return appliesToField + `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
        <label class="field-label">Max calls <input type="number" data-rf-limit min="1" value="10" style="margin-left:6px;width:70px;padding:5px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color)"></label>
        <label class="field-label">per <input type="number" data-rf-window min="1" value="3600" style="margin-left:6px;width:80px;padding:5px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color)"> seconds</label>
      </div>`;
    return '';
  }

  restrictionRow(r, index, grantId) {
    const type = String(r.type || '');
    const appliesTo = String(r.applies_to || 'grant');
    const params = r.params || {};
    let detail = '';
    if (type === 'expiry')    detail = `deny after ${this.escape(params.expires_at || '?')}`;
    if (type === 'schedule')  detail = `${this.escape((params.days || []).join(', '))} ${this.escape(params.start_time || '')}–${this.escape(params.end_time || '')}`;
    if (type === 'pin')       detail = 'PIN set';
    if (type === 'rate_limit') detail = `max ${this.escape(String(params.limit || '?'))} per ${this.escape(String(params.window_seconds || '?'))} s`;
    return `
      <div class="restriction-row">
        <div>
          <span class="restriction-type-badge">${this.escape(type)}</span>
          <code>${this.escape(appliesTo)}</code>
          <small>${detail}</small>
        </div>
        <button class="secondary" style="padding:4px 10px;font-size:12px" data-remove-restriction="${this.escape(grantId)}" data-restriction-index="${index}">Remove</button>
      </div>`;
  }

  buildNewRestriction(grantId) {
    const container = this.querySelector(`[data-rf-fields="${grantId}"]`);
    if (!container) return null;
    const typeEl = this.querySelector(`[data-rf-type="${grantId}"]`);
    const type = typeEl?.value;
    if (!type) return null;
    const appliesTo = (container.querySelector('[data-rf-applies]')?.value || 'grant').trim();
    const id = `${type}-${Date.now()}`;
    if (type === 'expiry') {
      const raw = container.querySelector('[data-rf-expires]')?.value;
      if (!raw) { alert('Please set a date/time for the expiry.'); return null; }
      return { id, type, enabled: true, applies_to: appliesTo, params: { expires_at: new Date(raw).toISOString() } };
    }
    if (type === 'schedule') {
      const days = ['mon','tue','wed','thu','fri','sat','sun'].filter(d => container.querySelector(`[data-rf-day="${d}"]`)?.checked);
      const start = container.querySelector('[data-rf-start]')?.value || '00:00';
      const end   = container.querySelector('[data-rf-end]')?.value   || '23:59';
      return { id, type, enabled: true, applies_to: appliesTo, params: { days, start_time: start, end_time: end } };
    }
    if (type === 'pin') {
      const pin = container.querySelector('[data-rf-pin]')?.value;
      if (!pin) { alert('Please enter a PIN.'); return null; }
      return { id, type, enabled: true, applies_to: appliesTo, pin };
    }
    if (type === 'rate_limit') {
      const limit   = Number(container.querySelector('[data-rf-limit]')?.value  || 10);
      const window_ = Number(container.querySelector('[data-rf-window]')?.value || 3600);
      return { id, type, enabled: true, applies_to: appliesTo, params: { limit, window_seconds: window_ } };
    }
    return null;
  }

  dashboardExportSection() {
    const dashboards = this._dashboards || [];
    const dashboard = dashboards[this._selectedDashboardIndex];
    const views = Array.isArray(this._exportConfig?.views) ? this._exportConfig.views : [];
    const result = this._exportResult;
    const selectedCount = this._selectedEntities?.size || 0;
    return `
      <h3>Dashboard brief export</h3>
      <div class="varco-card export-card">
        <div class="eyebrow">Manifest blueprint</div>
        <p>Harvest an existing Lovelace dashboard or view into a local zip for a coding agent. The zip contains <code>brief.md</code> and <code>manifest.json</code>; it does not create a grant.</p>
        ${this._dashboardError ? `<p class="warning">${this.escape(this._dashboardError)}</p>` : ''}
        ${this._exportError ? `<p class="warning">${this.escape(this._exportError)}</p>` : ''}
        <label class="field-label">Dashboard</label>
        <select data-dashboard-select>
          <option value="">Choose a dashboard...</option>
          ${dashboards.map((item, index) => `<option value="${index}" ${index === this._selectedDashboardIndex ? 'selected' : ''}>${this.escape(item.title)} (${this.escape(item.url_path || 'default')})</option>`).join('')}
        </select>
        ${dashboard && views.length ? `
          <label class="field-label">Scope</label>
          <select data-view-select>
            <option value="" ${this._selectedViewIndex === '' ? 'selected' : ''}>Whole dashboard</option>
            ${views.map((view, index) => `<option value="${index}" ${String(index) === String(this._selectedViewIndex) ? 'selected' : ''}>View: ${this.escape(view.title || view.path || `View ${index + 1}`)}</option>`).join('')}
          </select>` : ''}
        ${this._exportLoading ? '<p>Harvesting dashboard...</p>' : ''}
        ${result ? this.exportPreview(result, selectedCount) : ''}
      </div>`;
  }

  exportPreview(result, selectedCount) {
    const groups = this.groupExportEntities(result.entities);
    const previewManifest = this.previewManifest(result);
    return `
      <div class="export-summary">
        <strong>${selectedCount}</strong> of <strong>${result.entities.length}</strong> harvested entities selected.
        <span>${this.escape(this.scopeSummary(previewManifest))}</span>
      </div>
      ${result.warnings.length ? `
        <details class="scope-details">
          <summary>${result.warnings.length} unresolved or dynamic dashboard references</summary>
          <ul>${result.warnings.map((warning) => `<li><code>${this.escape(warning.path)}</code>: ${this.escape(warning.message)}</li>`).join('')}</ul>
        </details>` : ''}
      <div class="entity-checklist">
        ${groups.length ? groups.map((group) => `
          <div class="entity-group">
            <div class="entity-group-title">${this.escape(group.title)}</div>
            ${group.entities.map((entity) => this.entityCheckbox(entity)).join('')}
          </div>`).join('') : '<p>No entities were harvested from this selection.</p>'}
      </div>
      <div class="button-row">
        <button class="primary" data-download-brief ${selectedCount ? '' : 'disabled'}>Download agent brief zip</button>
      </div>`;
  }

  groupExportEntities(entities) {
    const groups = new Map();
    entities.forEach((entity) => {
      const ref = entity.references?.[0];
      const title = ref ? `${ref.view} / ${ref.card_type}` : 'Other harvested entities';
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(entity);
    });
    return Array.from(groups.entries()).map(([title, groupEntities]) => ({ title, entities: groupEntities }));
  }

  previewManifest(result) {
    const selected = result.entities.filter((entity) => entity.selected);
    return {
      read_entities: selected.filter((entity) => entity.scopes.read).map((entity) => entity.entity_id),
      subscriptions: selected.filter((entity) => entity.scopes.subscriptions).map((entity) => entity.entity_id),
      history: selected.filter((entity) => entity.scopes.history).map((entity) => entity.entity_id),
      camera_snapshots: selected.filter((entity) => entity.scopes.camera_snapshots).map((entity) => entity.entity_id),
      actions: [],
    };
  }

  entityCheckbox(entity) {
    const scopes = [];
    if (entity.scopes.read) scopes.push('read');
    if (entity.scopes.subscriptions) scopes.push('live');
    if (entity.scopes.history) scopes.push('history');
    if (entity.scopes.camera_snapshots) scopes.push('camera');
    const ref = entity.references?.[0];
    return `
      <label class="entity-row">
        <input type="checkbox" data-export-entity="${this.escape(entity.entity_id)}" ${entity.selected ? 'checked' : ''}>
        <span>
          <code>${this.escape(entity.entity_id)}</code>
          <small>${this.escape(scopes.join(', ') || 'referenced')} ${ref ? `from ${this.escape(ref.view)} / ${this.escape(ref.card_type)}` : ''}</small>
        </span>
      </label>`;
  }

  styles() {
    return `
      <style>
        :host { display: block; }
        .card-content { padding-bottom: 24px; }
        h3 { margin: 24px 0 12px; }
        h4 { margin: 2px 0 0; font-size: 18px; }
        button { margin: 4px 8px 4px 0; padding: 8px 12px; border: 0; border-radius: 6px; background: var(--primary-color); color: var(--text-primary-color); cursor: pointer; font-weight: 600; }
        button[disabled] { opacity: 0.5; cursor: not-allowed; }
        button.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); }
        button.danger { background: var(--error-color, #db4437); color: white; }
        select { display: block; max-width: 420px; width: 100%; margin: 4px 0 12px; padding: 8px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); }
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
        .approval-note, .warning { background: var(--secondary-background-color); border-radius: 8px; margin: 12px 0; padding: 10px; }
        .warning { border-left: 4px solid var(--warning-color, #f4b400); }
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
        .field-label { display: block; font-weight: 700; margin-top: 12px; }
        .export-summary { align-items: center; background: var(--secondary-background-color); border-radius: 8px; display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; padding: 10px; }
        .entity-checklist { border: 1px solid var(--divider-color); border-radius: 8px; max-height: 360px; overflow: auto; padding: 6px; }
        .entity-group { border-bottom: 1px solid var(--divider-color); padding: 6px 0; }
        .entity-group:last-child { border-bottom: 0; }
        .entity-group-title { color: var(--secondary-text-color); font-size: 12px; font-weight: 700; margin: 4px; text-transform: uppercase; }
        .entity-row { align-items: flex-start; border-bottom: 1px solid var(--divider-color); display: flex; gap: 8px; padding: 8px 4px; }
        .entity-row:last-child { border-bottom: 0; }
        .entity-row small { color: var(--secondary-text-color); display: block; margin-top: 3px; }
        .restriction-section summary { cursor: pointer; font-weight: 700; }
        .restriction-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .restriction-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--secondary-background-color); border-radius: 8px; padding: 8px 10px; }
        .restriction-row > div { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .restriction-row small { color: var(--secondary-text-color); }
        .restriction-type-badge { background: var(--primary-color); color: var(--text-primary-color); border-radius: 4px; font-size: 11px; font-weight: 700; padding: 2px 7px; text-transform: uppercase; }
        .restriction-form { border: 1px dashed var(--divider-color); border-radius: 8px; margin-top: 12px; padding: 12px; }
        .restriction-form-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
        .restriction-form-row select { margin: 0; }
      </style>`;
  }

  render(state) {
    if (state) this._lastState = state;
    if (!this._lastState || this._lastState.loading) {
      this.innerHTML = `<ha-card><div class="card-content">${this.styles()}Loading Varco...</div></ha-card>`;
      return;
    }
    const current = this._lastState;
    const pending = current.requests.filter((request) => request.status === 'pending');
    this.innerHTML = `
      <ha-card header="Varco Authority">
        <div class="card-content">${this.styles()}
          <p><b>Authority ID</b><br><code>${this.escape(current.info.authority_id)}</code></p>
          <p><b>Relay</b>: ${current.info.relay.connected ? 'connected' : 'disconnected'}</p>
          ${this.dashboardExportSection()}
          <h3>Pending access requests</h3>
          ${pending.length ? pending.map((request) => this.requestCard(request)).join('') : '<p>No pending requests.</p>'}
          <h3>Grants</h3>
          ${current.grants.length ? current.grants.map((grant) => this.grantCard(grant)).join('') : '<p>No grants.</p>'}
        </div>
      </ha-card>`;
    this.querySelectorAll('[data-approve]').forEach((el) => el.onclick = () => {
      const requestId = el.dataset.approve;
      const boxes = [...this.querySelectorAll(`[data-scope-request="${CSS.escape(requestId)}"]`)];
      const payload = { request_id: requestId };
      if (boxes.some((box) => !box.checked)) {
        const approved = {};
        boxes.forEach((box) => {
          (approved[box.dataset.scopeKey] = approved[box.dataset.scopeKey] || []);
          if (box.checked) approved[box.dataset.scopeKey].push(box.value);
        });
        payload.approved_manifest = approved;
      }
      this.call('varco/approve_request', payload);
    });
    this.querySelectorAll('[data-reject]').forEach((el) => el.onclick = () => this.call('varco/reject_request', { request_id: el.dataset.reject }));
    this.querySelectorAll('[data-revoke]').forEach((el) => el.onclick = () => this.call('varco/revoke_grant', { grant_id: el.dataset.revoke }));
    this.querySelectorAll('[data-delete-grant]').forEach((el) => el.onclick = () => {
      if (!window.confirm(`Delete grant record for ${el.dataset.name}? This also removes active access for that consumer.`)) return;
      this.call('varco/delete_grant', { grant_id: el.dataset.deleteGrant });
    });
    // restriction type selector — swap in the appropriate fields
    this.querySelectorAll('[data-rf-type]').forEach((sel) => {
      sel.onchange = () => {
        const grantId = sel.dataset.rfType;
        const fieldsEl = this.querySelector(`[data-rf-fields="${grantId}"]`);
        if (fieldsEl) fieldsEl.innerHTML = this.restrictionTypeFields(sel.value);
        // insert save button
        if (sel.value && fieldsEl) {
          const existing = fieldsEl.querySelector('[data-rf-save]');
          if (!existing) {
            const btn = document.createElement('button');
            btn.textContent = 'Save restriction';
            btn.dataset.rfSave = grantId;
            btn.style.marginTop = '12px';
            fieldsEl.appendChild(btn);
          }
        }
      };
    });
    // remove restriction
    this.querySelectorAll('[data-remove-restriction]').forEach((btn) => {
      btn.onclick = async () => {
        const grantId = btn.dataset.removeRestriction;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const existing = Array.isArray(grant?.restrictions) ? grant.restrictions : [];
        const updated = existing.filter((_, i) => i !== idx);
        await this._hass.connection.sendMessagePromise({
          type: 'varco/update_grant_restrictions',
          grant_id: grantId,
          restrictions: updated,
        });
        this._loaded = false;
        await this.load();
      };
    });
    const dashboardSelect = this.querySelector('[data-dashboard-select]');
    if (dashboardSelect) dashboardSelect.onchange = () => this.pickDashboard(dashboardSelect.value);
    const viewSelect = this.querySelector('[data-view-select]');
    if (viewSelect) viewSelect.onchange = () => this.pickView(viewSelect.value);
    this.querySelectorAll('[data-export-entity]').forEach((el) => el.onchange = () => this.toggleEntity(el.dataset.exportEntity, el.checked));
    const download = this.querySelector('[data-download-brief]');
    if (download) download.onclick = () => this.downloadDashboardBrief();
  }

  slugify(value) {
    return String(value || 'varco-brief').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'varco-brief';
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const crc = this.crc32(data);
      const local = this.zipHeader(30, 0x04034b50, nameBytes, data, crc, offset);
      localParts.push(local, nameBytes, data);
      const central = this.zipHeader(46, 0x02014b50, nameBytes, data, crc, offset);
      centralParts.push(central, nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, Object.keys(files).length, true);
    view.setUint16(10, Object.keys(files).length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  zipHeader(size, signature, nameBytes, data, crc, offset) {
    const header = new Uint8Array(size);
    const view = new DataView(header.buffer);
    view.setUint32(0, signature, true);
    const dosDate = (44 << 9) | (1 << 5) | 1;
    if (signature === 0x04034b50) {
      view.setUint16(4, 20, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, dosDate, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
    } else {
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, dosDate, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, data.length, true);
      view.setUint32(24, data.length, true);
      view.setUint16(28, nameBytes.length, true);
      view.setUint32(42, offset, true);
    }
    return header;
  }

  crc32(data) {
    if (!this._crcTable) {
      this._crcTable = Array.from({ length: 256 }, (_, index) => {
        let crc = index;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        return crc >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (let index = 0; index < data.length; index += 1) crc = this._crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
}
customElements.define('varco-panel', VarcoPanel);
