import { styles } from './styles.js';
import { icons, type IconName } from './icons.js';
import type {
  AccessRequest,
  AuditEvent,
  DashboardEntry,
  ExportEntity,
  ExportResult,
  Grant,
  Hass,
  Manifest,
  PanelState,
  Restriction,
  ScopeKey,
  VarcoInfo,
} from './types.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface ScopeDef {
  key: ScopeKey;
  title: string;
  desc: string;
  icon: IconName;
}

const SCOPE_DEFS: ScopeDef[] = [
  { key: 'read_entities', title: 'Read entity states', desc: 'See the current value of these entities', icon: 'eye' },
  { key: 'subscriptions', title: 'Live updates', desc: 'Get notified when these entities change', icon: 'live' },
  { key: 'history', title: 'Query history', desc: 'Read past values of these entities', icon: 'history' },
  { key: 'camera_snapshots', title: 'Camera snapshots', desc: 'Capture still images from these cameras', icon: 'camera' },
  { key: 'actions', title: 'Control actions', desc: 'Call these Home Assistant services', icon: 'bolt' },
];

export class VarcoPanel extends HTMLElement {
  private _hass?: Hass;
  private _loaded = false;
  private _lastState?: PanelState;
  private _refreshTimer?: number;
  private _pendingSignature = '';
  private _grantSearch = '';
  private _grantStatusFilter = 'all';
  // wizard step per request id
  private _step: Record<string, number> = {};

  // dashboard export state
  private _dashboards: DashboardEntry[] = [];
  private _dashboardError = '';
  private _exportError = '';
  private _exportLoading = false;
  private _exportConfig: { views?: unknown[] } | null = null;
  private _exportResult: ExportResult | null = null;
  private _selectedDashboardIndex?: number;
  private _selectedViewIndex: string | number = '';
  private _selectedEntities = new Set<string>();
  private _crcTable?: number[];

  set hass(hass: Hass) {
    this._hass = hass;
    if (!this._loaded) void this.load();
  }

  connectedCallback(): void {
    this.render({ loading: true } as PanelState);
    this.addEventListener('click', this._onDelegatedClick);
    if (!this._refreshTimer) {
      const interval = Number(this.dataset.pollInterval) || 8000;
      this._refreshTimer = window.setInterval(() => void this.refreshPending(), interval);
    }
  }

  disconnectedCallback(): void {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  // Delegated handler for the dynamically-injected "Save restriction" button.
  private _onDelegatedClick = async (ev: Event): Promise<void> => {
    const target = ev.target as HTMLElement;
    const saveBtn = target.closest<HTMLElement>('[data-rf-save]');
    if (saveBtn) {
      const grantId = saveBtn.dataset.rfSave as string;
      const newR = this.buildNewRestriction(grantId);
      if (!newR) return;
      (saveBtn as HTMLButtonElement).disabled = true;
      saveBtn.textContent = 'Saving…';
      const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
      const existing = Array.isArray(grant?.restrictions) ? grant!.restrictions! : [];
      await this._hass!.connection.sendMessagePromise({ type: 'varco/update_grant_restrictions', grant_id: grantId, restrictions: [...existing, newR] });
      this._loaded = false;
      await this.load();
    }
  };

  async refreshPending(): Promise<void> {
    if (!this._hass || !this._loaded) return;
    try {
      const requests = await this._hass.connection.sendMessagePromise<AccessRequest[]>({ type: 'varco/access_requests' });
      const signature = requests.filter((r) => r.status === 'pending').map((r) => r.request_id).sort().join(',');
      if (signature !== this._pendingSignature) {
        this._loaded = false;
        await this.load();
      }
    } catch {
      // transient ws error; next tick retries
    }
  }

  async load(): Promise<void> {
    if (!this._hass) return;
    this._loaded = true;
    const [info, requests, grants, audit] = await Promise.all([
      this._hass.connection.sendMessagePromise<VarcoInfo>({ type: 'varco/info' }),
      this._hass.connection.sendMessagePromise<AccessRequest[]>({ type: 'varco/access_requests' }),
      this._hass.connection.sendMessagePromise<Grant[]>({ type: 'varco/grants' }),
      this._hass.connection.sendMessagePromise<AuditEvent[]>({ type: 'varco/audit' }).catch(() => [] as AuditEvent[]),
    ]);
    await this.loadDashboards();
    this._pendingSignature = requests.filter((r) => r.status === 'pending').map((r) => r.request_id).sort().join(',');
    this.render({ info, requests, grants, audit });
  }

  async loadDashboards(): Promise<void> {
    try {
      const dashboards = await this._hass!.connection.sendMessagePromise<DashboardEntry[]>({ type: 'lovelace/dashboards/list' });
      this._dashboards = [
        { title: 'Overview', url_path: null, mode: 'default' },
        ...dashboards.map((d) => ({ title: d.title || d.url_path || 'Dashboard', url_path: d.url_path, mode: d.mode || 'storage' })),
      ];
      this._dashboardError = '';
    } catch (err) {
      this._dashboards = [{ title: 'Overview', url_path: null, mode: 'default' }];
      this._dashboardError = `Could not list dashboards: ${(err as Error).message || err}`;
    }
  }

  async call(type: string, payload: Record<string, unknown>): Promise<void> {
    await this._hass!.connection.sendMessagePromise({ type, ...payload });
    this._loaded = false;
    await this.load();
  }

  // ---------- helpers ----------

  escape(value: unknown): string {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] as string));
  }

  manifestName(item: { manifest?: Manifest }): string {
    return item?.manifest?.name || 'Unknown consumer';
  }

  manifestVersion(item: { manifest?: Manifest }): string {
    return item?.manifest?.version || 'not declared';
  }

  initials(name: string): string {
    const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  readScopes(manifest: Manifest | undefined, key: ScopeKey): string[] {
    const value = manifest?.[key];
    return Array.isArray(value) ? value.map((v) => String(v)) : [];
  }

  scopes(manifest: Manifest | undefined): Record<ScopeKey, string[]> {
    return {
      read_entities: this.readScopes(manifest, 'read_entities'),
      subscriptions: this.readScopes(manifest, 'subscriptions'),
      history: this.readScopes(manifest, 'history'),
      camera_snapshots: this.readScopes(manifest, 'camera_snapshots'),
      actions: this.readScopes(manifest, 'actions'),
    };
  }

  // Plain-language one-liner summarising what a consumer is asking for.
  plainSummary(manifest: Manifest | undefined): string {
    const s = this.scopes(manifest);
    const bits: string[] = [];
    const n = (arr: string[], one: string, many: string) => `${arr.length} ${arr.length === 1 ? one : many}`;
    if (s.read_entities.length) bits.push(`read ${n(s.read_entities, 'entity', 'entities')}`);
    if (s.subscriptions.length) bits.push(`watch ${n(s.subscriptions, 'entity', 'entities')} live`);
    if (s.history.length) bits.push(`see history for ${n(s.history, 'entity', 'entities')}`);
    if (s.camera_snapshots.length) bits.push(`snapshot ${n(s.camera_snapshots, 'camera', 'cameras')}`);
    if (s.actions.length) bits.push(`control ${n(s.actions, 'action', 'actions')}`);
    if (!bits.length) return 'no permissions';
    if (bits.length === 1) return bits[0];
    return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
  }

  scopeSummary(manifest: Manifest | undefined): string {
    const s = this.scopes(manifest);
    return `${s.read_entities.length} read, ${s.subscriptions.length} live, ${s.history.length} history, ${s.camera_snapshots.length} cameras, ${s.actions.length} actions`;
  }

  shortKey(value: unknown): string {
    const text = String(value || '');
    if (text.length <= 24) return text || 'unknown';
    return `${text.slice(0, 12)}...${text.slice(-8)}`;
  }

  formatDate(value: unknown): string {
    if (!value) return 'unknown';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  toLocalInput(iso: unknown): string {
    if (!iso) return '';
    const date = new Date(iso as string);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ---------- pending request wizard ----------

  requestCard(request: AccessRequest): string {
    const id = request.request_id;
    const name = this.manifestName(request);
    const step = this._step[id] || 1;
    const stepLabel = ['Confirm', 'Permissions', 'Duration'];
    const stepper = stepLabel
      .map((label, i) => {
        const n = i + 1;
        const cls = step === n ? 'active' : step > n ? 'done' : '';
        const bar = i < stepLabel.length - 1 ? `<div class="step-bar ${step > n ? 'done' : ''}"></div>` : '';
        return `<div class="step ${cls}"><span class="num">${step > n ? icons.check : n}</span><span class="step-text">${label}</span></div>${bar}`;
      })
      .join('');

    return `
      <div class="req" data-request-card="${this.escape(id)}">
        <div class="req-head">
          <div class="req-id">
            <div class="req-avatar">${this.escape(this.initials(name))}</div>
            <div>
              <div class="req-name">${this.escape(name)}</div>
              <div class="req-sub">wants to connect &middot; v${this.escape(this.manifestVersion(request))}</div>
            </div>
          </div>
          <div class="pair">
            <div class="lab">Pairing code</div>
            <div class="code">${this.escape(request.pairing_code)}</div>
          </div>
        </div>
        <div class="steps">${stepper}</div>
        <div class="req-body">
          <div class="panes" data-panes="${this.escape(id)}">
            ${this.stepConfirm(request)}
            ${this.stepPermissions(request)}
            ${this.stepDuration(request)}
          </div>
        </div>
      </div>`;
  }

  private stepConfirm(request: AccessRequest): string {
    const id = request.request_id;
    const name = this.manifestName(request);
    const show = (this._step[id] || 1) === 1 ? 'show' : '';
    return `
      <div class="pane ${show}" data-pane="1" data-pane-for="${this.escape(id)}">
        <p class="lead"><strong>${this.escape(name)}</strong> is asking for access to your Home Assistant. It wants to <strong>${this.escape(this.plainSummary(request.manifest))}</strong>.</p>
        <div class="callout">
          Make sure the pairing code <b>${this.escape(request.pairing_code)}</b> matches the one shown on the device before continuing.
        </div>
        <details class="tech">
          <summary>Technical details</summary>
          <div class="meta">
            <div><div class="k">Requested at</div><div class="v">${this.escape(this.formatDate(request.created_at))}</div></div>
            <div><div class="k">Consumer key</div><div class="v"><code title="${this.escape(request.consumer_pk)}">${this.escape(this.shortKey(request.consumer_pk))}</code></div></div>
            <div><div class="k">Request ID</div><div class="v"><code>${this.escape(id)}</code></div></div>
          </div>
        </details>
        <div class="nav-row">
          <div class="left"><button class="danger" data-reject="${this.escape(id)}">Reject</button></div>
          <div class="right"><button data-step-next="${this.escape(id)}">Review permissions</button></div>
        </div>
      </div>`;
  }

  private stepPermissions(request: AccessRequest): string {
    const id = request.request_id;
    const show = (this._step[id] || 1) === 2 ? 'show' : '';
    const scopes = this.scopes(request.manifest);
    const groups = SCOPE_DEFS.map((def) => {
      const values = scopes[def.key];
      const items = values.length
        ? `<ul class="perm-items">${values
            .map(
              (value) => `<li><label><input type="checkbox" checked data-scope-request="${this.escape(id)}" data-scope-key="${this.escape(def.key)}" value="${this.escape(value)}"> <code>${this.escape(value)}</code></label></li>`,
            )
            .join('')}</ul>`
        : '<div class="perm-empty">None requested</div>';
      return `
        <div class="perm-group">
          <div class="perm-head">
            <span class="perm-ico">${icons[def.icon]}</span>
            <span class="perm-meta"><span class="perm-title">${this.escape(def.title)}</span><span class="perm-desc">${this.escape(def.desc)}</span></span>
            <span class="perm-count">${values.length}</span>
          </div>
          ${items}
        </div>`;
    }).join('');

    return `
      <div class="pane ${show}" data-pane="2" data-pane-for="${this.escape(id)}">
        <p class="lead">Choose exactly what <strong>${this.escape(this.manifestName(request))}</strong> may access. Untick anything you want to withhold.</p>
        <div class="perm-actions"><a data-scope-all="${this.escape(id)}">Select all</a><a data-scope-none="${this.escape(id)}">Deselect all</a></div>
        ${groups}
        <div class="nav-row">
          <div class="left"><button class="ghost" data-step-prev="${this.escape(id)}">Back</button></div>
          <div class="right"><button data-step-next="${this.escape(id)}">Choose duration</button></div>
        </div>
      </div>`;
  }

  private stepDuration(request: AccessRequest): string {
    const id = request.request_id;
    const show = (this._step[id] || 1) === 3 ? 'show' : '';
    const presets = [
      { value: 'none', label: 'No expiry' },
      { value: '3600000', label: '1 hour' },
      { value: '86400000', label: '24 hours' },
      { value: '604800000', label: '7 days' },
      { value: 'custom', label: 'Custom' },
    ];
    const chips = presets
      .map((p) => `<button type="button" class="chip ${p.value === 'none' ? 'sel' : ''}" data-expiry-chip="${this.escape(id)}" data-expiry-value="${p.value}">${this.escape(p.label)}</button>`)
      .join('');
    return `
      <div class="pane ${show}" data-pane="3" data-pane-for="${this.escape(id)}">
        <p class="lead">How long should this access last?</p>
        <input type="hidden" data-approve-expiry="${this.escape(id)}" value="none">
        <div class="chips" data-expiry-chips="${this.escape(id)}">${chips}</div>
        <input type="datetime-local" data-approve-expiry-custom="${this.escape(id)}" style="display:none;max-width:280px">
        <div class="summary-box" data-approve-summary="${this.escape(id)}">
          You are granting <b>${this.escape(this.manifestName(request))}</b> permission to <b data-summary-perms>${this.escape(this.plainSummary(request.manifest))}</b>. Access lasts <b data-summary-expiry>until you revoke it</b>.
        </div>
        <div class="nav-row">
          <div class="left"><button class="ghost" data-step-prev="${this.escape(id)}">Back</button></div>
          <div class="right">
            <button class="danger" data-reject="${this.escape(id)}">Reject</button>
            <button data-approve="${this.escape(id)}">Approve access</button>
          </div>
        </div>
      </div>`;
  }

  // ---------- grants ----------

  isGrantExpired(grant: Grant): boolean {
    if (!grant.expires_at || grant.revoked) return false;
    const expires = new Date(grant.expires_at);
    if (Number.isNaN(expires.getTime())) return false;
    return Date.now() >= expires.getTime();
  }

  grantStatus(grant: Grant): 'revoked' | 'expired' | 'active' {
    if (grant.revoked) return 'revoked';
    if (this.isGrantExpired(grant)) return 'expired';
    return 'active';
  }

  statusPill(status: string): string {
    const map: Record<string, { cls: string; label: string }> = {
      active: { cls: 'ok', label: 'active' },
      expired: { cls: 'warn', label: 'expired' },
      revoked: { cls: 'off', label: 'revoked' },
    };
    const v = map[status] || map.active;
    return `<span class="pill ${v.cls}"><span class="dot"></span>${v.label}</span>`;
  }

  grantCard(grant: Grant): string {
    const name = this.manifestName(grant);
    const status = this.grantStatus(grant);
    const restrictions = Array.isArray(grant.restrictions) ? grant.restrictions : [];
    const s = this.scopes(grant.manifest);
    const activeRestrictions = restrictions.filter((r) => r.enabled !== false).length;
    return `
      <div class="grant ${status}" data-grant-name="${this.escape(name)}" data-grant-card-status="${status}">
        <div class="grant-head">
          <div class="l">
            <div class="grant-avatar">${this.escape(this.initials(name))}</div>
            <div>
              <div class="grant-name">${this.escape(name)}</div>
              <div class="grant-sub">${this.escape(this.plainSummary(grant.manifest))}${restrictions.length ? ` &middot; ${activeRestrictions}/${restrictions.length} restrictions active` : ''}</div>
            </div>
          </div>
          ${this.statusPill(status)}
        </div>
        <div class="grant-body">
          <div class="meta">
            <div><div class="k">Version</div><div class="v">${this.escape(this.manifestVersion(grant))}</div></div>
            <div><div class="k">Created</div><div class="v">${this.escape(this.formatDate(grant.created_at))}</div></div>
            <div><div class="k">Last used</div><div class="v">${grant.last_used_at ? this.escape(this.formatDate(grant.last_used_at)) : 'never'}</div></div>
            ${grant.expires_at ? `<div><div class="k">Expires</div><div class="v">${this.escape(this.formatDate(grant.expires_at))}</div></div>` : ''}
            ${grant.revoked ? `<div><div class="k">Revoked</div><div class="v">${this.escape(this.formatDate(grant.revoked_at))}</div></div>` : ''}
          </div>
        </div>
        <details class="sec">
          <summary>Permissions <span class="count-tag">&middot; ${this.escape(this.scopeSummary(grant.manifest))}</span></summary>
          <div class="sec-inner">
            <div class="scope-grid">
              ${SCOPE_DEFS.map((def) => this.scopeBox(def.title, s[def.key])).join('')}
            </div>
          </div>
        </details>
        ${grant.revoked ? '' : this.restrictionsSection(grant.grant_id, restrictions)}
        ${this.grantActivity(grant.grant_id)}
        <div class="grant-body">
          <div class="btn-row" style="margin-top:6px">
            ${grant.revoked ? '' : `<button class="danger" data-revoke="${this.escape(grant.grant_id)}">${icons.ban} Revoke access</button>`}
            <button class="danger" data-delete-grant="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">${icons.trash} Delete record</button>
          </div>
        </div>
      </div>`;
  }

  private scopeBox(title: string, values: string[]): string {
    return `
      <div class="scope-box">
        <div class="t">${this.escape(title)}</div>
        ${values.length ? `<ul>${values.map((v) => `<li><code>${this.escape(v)}</code></li>`).join('')}</ul>` : '<div class="muted">None</div>'}
      </div>`;
  }

  restrictionsSection(grantId: string, restrictions: Restriction[]): string {
    const rows = restrictions.length
      ? `<div class="rest">${restrictions.map((r, i) => this.restrictionRow(r, i, grantId)).join('')}</div>`
      : '<p class="muted" style="margin:4px 0">No restrictions. Access follows the granted permissions at all times.</p>';
    return `
      <details class="sec restriction-section">
        <summary>Restrictions <span class="count-tag">&middot; ${restrictions.length}</span></summary>
        <div class="sec-inner">
          ${rows}
          <div class="rest-add" data-rf-fields-wrap="${this.escape(grantId)}">
            <label class="field" style="margin-top:0">Add a restriction</label>
            <select data-rf-type="${this.escape(grantId)}">
              <option value="">Choose type…</option>
              <option value="expiry">Expiry — deny after a date/time</option>
              <option value="schedule">Schedule — allow only in a time window</option>
              <option value="pin">PIN — require a code to act</option>
              <option value="rate_limit">Rate limit — max N calls per window</option>
              <option value="template">Template — allow only when a HA template is true</option>
            </select>
            <div data-rf-fields="${this.escape(grantId)}"></div>
          </div>
        </div>
      </details>`;
  }

  restrictionRow(r: Restriction, index: number, grantId: string): string {
    const type = String(r.type || '');
    const appliesTo = String(r.applies_to || 'grant');
    const params = (r.params || {}) as Record<string, unknown>;
    const enabled = r.enabled !== false;
    const id = this.escape(grantId);
    let detail = '';
    if (type === 'expiry') detail = `deny after ${this.escape(String(params.expires_at || '?'))}`;
    if (type === 'schedule') detail = `${this.escape((params.days as string[] || []).join(', '))} ${this.escape(String(params.start_time || ''))}–${this.escape(String(params.end_time || ''))}`;
    if (type === 'pin') detail = 'PIN set';
    if (type === 'rate_limit') detail = `max ${this.escape(String(params.limit || '?'))} per ${this.escape(String(params.window_seconds || '?'))} s`;
    if (type === 'template') detail = this.escape(String(params.value_template || ''));
    return `
      <div class="rest-row ${enabled ? '' : 'disabled'}">
        <div class="rest-main">
          <div class="rest-info">
            <span class="rest-badge">${this.escape(type)}</span>
            <code>${this.escape(appliesTo)}</code>
            <small>${detail}</small>
            ${enabled ? '' : '<span class="rest-tag">disabled</span>'}
          </div>
          <div class="rest-actions">
            <button class="subtle tiny" data-toggle-restriction="${id}" data-restriction-index="${index}">${enabled ? 'Disable' : 'Enable'}</button>
            <button class="subtle tiny" data-edit-restriction="${id}" data-restriction-index="${index}">Edit</button>
            <button class="danger tiny" data-remove-restriction="${id}" data-restriction-index="${index}">Remove</button>
          </div>
        </div>
        <div class="rest-edit" data-restriction-edit="${id}" data-restriction-index="${index}" hidden></div>
      </div>`;
  }

  private inputStyle = 'max-width:420px';

  restrictionTypeFields(type: string): string {
    const applies = `<label class="field">Applies to <small class="muted">(grant / actions / read / history / camera / domain.service@entity_id)</small></label>
      <input type="text" data-rf-applies placeholder="grant" value="grant" style="${this.inputStyle}">`;
    if (type === 'expiry') return applies + `<label class="field">Deny after</label><input type="datetime-local" data-rf-expires style="${this.inputStyle}">`;
    if (type === 'schedule') return applies + `<label class="field">Allowed days</label><div class="chk-row" style="margin-bottom:10px">${DAYS.map((d) => `<label><input type="checkbox" data-rf-day="${d}" checked> ${d}</label>`).join('')}</div><div class="chk-row"><label class="field" style="margin:0">From <input type="time" data-rf-start value="08:00" style="width:auto"></label><label class="field" style="margin:0">Until <input type="time" data-rf-end value="22:00" style="width:auto"></label></div>`;
    if (type === 'pin') return applies + `<label class="field">PIN <small class="muted">(set by you, never stored as plaintext)</small></label><input type="password" data-rf-pin placeholder="Enter PIN" autocomplete="new-password" style="max-width:280px">`;
    if (type === 'rate_limit') return applies + `<div class="chk-row" style="margin-top:10px"><label class="field" style="margin:0">Max calls <input type="number" data-rf-limit min="1" value="10" style="width:80px"></label><label class="field" style="margin:0">per <input type="number" data-rf-window min="1" value="3600" style="width:90px"> seconds</label></div>`;
    if (type === 'template') return applies + `<label class="field">Condition template <small class="muted">(Jinja2; falsy or error denies)</small></label><textarea data-rf-template rows="3" placeholder="{{ is_state('alarm_control_panel.home_alarm', 'disarmed') }}" style="${this.inputStyle};font-family:monospace"></textarea>`;
    return '';
  }

  restrictionEditFields(r: Restriction): string {
    const type = String(r.type || '');
    const params = (r.params || {}) as Record<string, unknown>;
    const applies = `<label class="field" style="margin-top:0">Applies to</label><input type="text" data-re-applies value="${this.escape(String(r.applies_to || 'grant'))}" style="${this.inputStyle}">`;
    if (type === 'expiry') return applies + `<label class="field">Deny after</label><input type="datetime-local" data-re-expires value="${this.escape(this.toLocalInput(params.expires_at))}" style="${this.inputStyle}">`;
    if (type === 'schedule') {
      const days = Array.isArray(params.days) ? (params.days as string[]) : [];
      return applies + `<label class="field">Allowed days</label><div class="chk-row" style="margin-bottom:10px">${DAYS.map((d) => `<label><input type="checkbox" data-re-day="${d}" ${days.includes(d) ? 'checked' : ''}> ${d}</label>`).join('')}</div><div class="chk-row"><label class="field" style="margin:0">From <input type="time" data-re-start value="${this.escape(String(params.start_time || '08:00'))}" style="width:auto"></label><label class="field" style="margin:0">Until <input type="time" data-re-end value="${this.escape(String(params.end_time || '22:00'))}" style="width:auto"></label></div>`;
    }
    if (type === 'pin') return applies + `<label class="field">New PIN <small class="muted">(leave blank to keep current)</small></label><input type="password" data-re-pin placeholder="Leave blank to keep current" autocomplete="new-password" style="max-width:280px">`;
    if (type === 'rate_limit') return applies + `<div class="chk-row" style="margin-top:10px"><label class="field" style="margin:0">Max calls <input type="number" data-re-limit min="1" value="${this.escape(String(params.limit ?? 10))}" style="width:80px"></label><label class="field" style="margin:0">per <input type="number" data-re-window min="1" value="${this.escape(String(params.window_seconds ?? 3600))}" style="width:90px"> seconds</label></div>`;
    if (type === 'template') return applies + `<label class="field">Condition template</label><textarea data-re-template rows="3" style="${this.inputStyle};font-family:monospace">${this.escape(String(params.value_template || ''))}</textarea>`;
    return applies;
  }

  buildEditedRestriction(grantId: string, index: number, editEl: HTMLElement): Restriction | null {
    const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
    const original = grant?.restrictions?.[index];
    if (!original) return null;
    const type = String(original.type || '');
    const appliesTo = (editEl.querySelector<HTMLInputElement>('[data-re-applies]')?.value || 'grant').trim();
    const params: Record<string, unknown> = { ...(original.params || {}) };
    if (type === 'expiry') {
      const raw = editEl.querySelector<HTMLInputElement>('[data-re-expires]')?.value;
      if (!raw) { this.showFieldError(editEl, 'Please set a date/time for the expiry.'); return null; }
      params.expires_at = new Date(raw).toISOString();
    } else if (type === 'schedule') {
      params.days = DAYS.filter((d) => editEl.querySelector<HTMLInputElement>(`[data-re-day="${d}"]`)?.checked);
      params.start_time = editEl.querySelector<HTMLInputElement>('[data-re-start]')?.value || '00:00';
      params.end_time = editEl.querySelector<HTMLInputElement>('[data-re-end]')?.value || '23:59';
    } else if (type === 'pin') {
      const pin = editEl.querySelector<HTMLInputElement>('[data-re-pin]')?.value;
      if (pin) params.pin = pin;
    } else if (type === 'rate_limit') {
      params.limit = Number(editEl.querySelector<HTMLInputElement>('[data-re-limit]')?.value || 10);
      params.window_seconds = Number(editEl.querySelector<HTMLInputElement>('[data-re-window]')?.value || 3600);
    } else if (type === 'template') {
      const valueTemplate = (editEl.querySelector<HTMLTextAreaElement>('[data-re-template]')?.value || '').trim();
      if (!valueTemplate) { this.showFieldError(editEl, 'Please enter a condition template.'); return null; }
      params.value_template = valueTemplate;
    }
    return { ...original, applies_to: appliesTo, params };
  }

  buildNewRestriction(grantId: string): Restriction | null {
    const container = this.querySelector<HTMLElement>(`[data-rf-fields="${grantId}"]`);
    if (!container) return null;
    const type = this.querySelector<HTMLSelectElement>(`[data-rf-type="${grantId}"]`)?.value;
    if (!type) return null;
    const appliesTo = (container.querySelector<HTMLInputElement>('[data-rf-applies]')?.value || 'grant').trim();
    const id = `${type}-${Date.now()}`;
    if (type === 'expiry') {
      const raw = container.querySelector<HTMLInputElement>('[data-rf-expires]')?.value;
      if (!raw) { this.showFieldError(container, 'Please set a date/time for the expiry.'); return null; }
      return { id, type, enabled: true, applies_to: appliesTo, params: { expires_at: new Date(raw).toISOString() } };
    }
    if (type === 'schedule') {
      const days = DAYS.filter((d) => container.querySelector<HTMLInputElement>(`[data-rf-day="${d}"]`)?.checked);
      const start = container.querySelector<HTMLInputElement>('[data-rf-start]')?.value || '00:00';
      const end = container.querySelector<HTMLInputElement>('[data-rf-end]')?.value || '23:59';
      return { id, type, enabled: true, applies_to: appliesTo, params: { days, start_time: start, end_time: end } };
    }
    if (type === 'pin') {
      const pin = container.querySelector<HTMLInputElement>('[data-rf-pin]')?.value;
      if (!pin) { this.showFieldError(container, 'Please enter a PIN.'); return null; }
      return { id, type, enabled: true, applies_to: appliesTo, pin };
    }
    if (type === 'rate_limit') {
      const limit = Number(container.querySelector<HTMLInputElement>('[data-rf-limit]')?.value || 10);
      const window_ = Number(container.querySelector<HTMLInputElement>('[data-rf-window]')?.value || 3600);
      return { id, type, enabled: true, applies_to: appliesTo, params: { limit, window_seconds: window_ } };
    }
    if (type === 'template') {
      const valueTemplate = (container.querySelector<HTMLTextAreaElement>('[data-rf-template]')?.value || '').trim();
      if (!valueTemplate) { this.showFieldError(container, 'Please enter a condition template.'); return null; }
      return { id, type, enabled: true, applies_to: appliesTo, params: { value_template: valueTemplate } };
    }
    return null;
  }

  showFieldError(container: HTMLElement, message: string): void {
    if (!container) return;
    let note = container.querySelector<HTMLElement>('[data-rf-error]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'callout danger';
      note.setAttribute('data-rf-error', '');
      container.appendChild(note);
    }
    note.textContent = message;
  }

  // ---------- audit ----------

  auditEventLabel(event: string): string {
    const labels: Record<string, string> = {
      access_request_received: 'Access request received',
      access_request_approved: 'Access request approved',
      access_request_rejected: 'Access request rejected',
      grant_revoked: 'Grant revoked',
      grant_deleted: 'Grant deleted',
      grant_restrictions_updated: 'Restrictions updated',
      consumer_connected: 'Consumer connected',
      call_service: 'Service called',
      permission_error: 'Permission denied',
      rate_limited: 'Rate limited',
      restriction_denied: 'Restriction denied',
      history_query_limited: 'History query limited',
      session_error: 'Session error',
      webrtc_fallback: 'WebRTC fallback to relay',
      webrtc_answer: 'WebRTC negotiated',
    };
    return labels[event] || String(event || 'event');
  }

  private auditKind(event: string): { cls: string; icon: IconName } {
    if (['permission_error', 'session_error', 'grant_revoked', 'grant_deleted', 'restriction_denied'].includes(event)) return { cls: 'kind-danger', icon: 'alert' };
    if (['rate_limited', 'history_query_limited', 'access_request_rejected'].includes(event)) return { cls: 'kind-warn', icon: 'alert' };
    if (['access_request_approved', 'consumer_connected'].includes(event)) return { cls: 'kind-ok', icon: 'check' };
    return { cls: '', icon: 'dot' };
  }

  auditDetailSummary(details: Record<string, unknown> | null | undefined): string {
    if (!details || typeof details !== 'object') return '';
    const safeKeys = ['domain', 'service', 'operation', 'entity_count', 'denied_count', 'reason', 'manifest_name', 'restriction_count', 'restriction_id'];
    const parts: string[] = [];
    safeKeys.forEach((key) => {
      const v = (details as Record<string, unknown>)[key];
      if (v !== undefined && v !== null && v !== '') parts.push(`${key}: ${this.escape(String(v))}`);
    });
    return parts.join(' · ');
  }

  auditRow(event: AuditEvent): string {
    const detail = this.auditDetailSummary(event.details);
    const kind = this.auditKind(event.event);
    return `
      <div class="audit-row ${kind.cls}" data-audit-event data-audit-grant="${this.escape(event.grant_id || '')}">
        <span class="audit-ico">${icons[kind.icon]}</span>
        <span class="audit-mid">
          <span class="audit-type" data-audit-type>${this.escape(this.auditEventLabel(event.event))}</span>
          ${detail ? `<span class="audit-detail">${detail}</span>` : ''}
        </span>
        <span class="audit-meta">
          <span class="audit-ts">${this.escape(this.formatDate(event.ts))}</span>
          ${event.grant_id ? `<code class="audit-grant">${this.escape(this.shortKey(event.grant_id))}</code>` : ''}
        </span>
      </div>`;
  }

  auditSection(): string {
    const events = Array.isArray(this._lastState?.audit) ? this._lastState!.audit : [];
    const recent = events.slice(-50).reverse();
    return `
      <div class="h-page">Activity <span class="count">${events.length}</span></div>
      <div class="card audit-card">
        <div class="eyebrow">Access oversight</div>
        <p class="muted" style="margin:6px 0 12px">Recent Varco events. Sensitive payloads (states, snapshots, history) are never shown.</p>
        <div class="audit-list" data-audit-list>
          ${recent.length ? recent.map((e) => this.auditRow(e)).join('') : '<p class="empty">No activity recorded yet.</p>'}
        </div>
      </div>`;
  }

  grantActivity(grantId: string): string {
    const events = Array.isArray(this._lastState?.audit) ? this._lastState!.audit : [];
    const own = events.filter((e) => e.grant_id === grantId).slice(-25).reverse();
    return `
      <details class="sec grant-activity" data-grant-activity="${this.escape(grantId)}">
        <summary>Activity <span class="count-tag">&middot; ${own.length}</span></summary>
        <div class="sec-inner">
          <div class="audit-list">
            ${own.length ? own.map((e) => this.auditRow(e)).join('') : '<p class="empty">No activity for this grant.</p>'}
          </div>
        </div>
      </details>`;
  }

  // ---------- relay ----------

  relayHealthSection(relay: VarcoInfo['relay']): string {
    const info = relay || {};
    const connected = !!info.connected;
    return `
      <div class="card" data-relay-status="${connected ? 'connected' : 'disconnected'}">
        <div class="relay-line">
          <span class="eyebrow">Relay</span>
          ${connected ? '<span class="pill ok"><span class="dot"></span>connected</span>' : '<span class="pill danger"><span class="dot"></span>disconnected</span>'}
        </div>
        <div class="meta">
          <div><div class="k">Bridge URL</div><div class="v" data-relay-bridge-url><code>${info.bridge_url ? this.escape(info.bridge_url) : 'unknown'}</code></div></div>
          <div><div class="k">Last connected</div><div class="v" data-relay-last-connected>${info.last_connected ? this.escape(this.formatDate(info.last_connected)) : 'never'}</div></div>
        </div>
        ${info.last_error ? `<div class="callout danger" data-relay-last-error>Last error: ${this.escape(info.last_error)}</div>` : ''}
        ${!connected ? `<div class="callout warn relay-guidance" data-relay-guidance>Check that the bridge URL above is reachable from Home Assistant and review the integration logs for connection errors.</div>` : ''}
      </div>`;
  }

  // ---------- dashboard export ----------

  dashboardExportSection(): string {
    const dashboards = this._dashboards || [];
    const dashboard = this._selectedDashboardIndex !== undefined ? dashboards[this._selectedDashboardIndex] : undefined;
    const views = Array.isArray(this._exportConfig?.views) ? this._exportConfig!.views! : [];
    const result = this._exportResult;
    const selectedCount = this._selectedEntities?.size || 0;
    return `
      <div class="h-page">Dashboard brief export</div>
      <div class="card">
        <div class="eyebrow">Manifest blueprint</div>
        <p class="muted" style="margin:6px 0 12px">Harvest an existing Lovelace dashboard or view into a local zip for a coding agent. The zip contains <code>brief.md</code> and <code>manifest.json</code>; it does not create a grant.</p>
        ${this._dashboardError ? `<p class="callout warn">${this.escape(this._dashboardError)}</p>` : ''}
        ${this._exportError ? `<p class="callout danger">${this.escape(this._exportError)}</p>` : ''}
        <label class="field">Dashboard</label>
        <select data-dashboard-select>
          <option value="">Choose a dashboard...</option>
          ${dashboards.map((item, index) => `<option value="${index}" ${index === this._selectedDashboardIndex ? 'selected' : ''}>${this.escape(item.title)} (${this.escape(item.url_path || 'default')})</option>`).join('')}
        </select>
        ${dashboard && views.length ? `
          <label class="field">Scope</label>
          <select data-view-select>
            <option value="" ${this._selectedViewIndex === '' ? 'selected' : ''}>Whole dashboard</option>
            ${views.map((view, index) => { const v = view as { title?: string; path?: string }; return `<option value="${index}" ${String(index) === String(this._selectedViewIndex) ? 'selected' : ''}>View: ${this.escape(v.title || v.path || `View ${index + 1}`)}</option>`; }).join('')}
          </select>` : ''}
        ${this._exportLoading ? '<p class="muted">Harvesting dashboard...</p>' : ''}
        ${result ? this.exportPreview(result, selectedCount) : ''}
      </div>`;
  }

  exportPreview(result: ExportResult, selectedCount: number): string {
    const groups = this.groupExportEntities(result.entities);
    const previewManifest = this.previewManifest(result);
    return `
      <div class="export-summary">
        <strong>${selectedCount}</strong> of <strong>${result.entities.length}</strong> harvested entities selected.
        <span class="muted">${this.escape(this.scopeSummary(previewManifest))}</span>
      </div>
      ${result.warnings.length ? `
        <details class="sec" style="border:1px solid var(--varco-border);border-radius:var(--varco-radius-sm)">
          <summary>${result.warnings.length} unresolved or dynamic dashboard references</summary>
          <div class="sec-inner"><ul>${result.warnings.map((w) => `<li><code>${this.escape(w.path)}</code>: ${this.escape(w.message)}</li>`).join('')}</ul></div>
        </details>` : ''}
      <div class="entity-list">
        ${groups.length ? groups.map((group) => `
          <div class="entity-group">
            <div class="entity-group-title">${this.escape(group.title)}</div>
            ${group.entities.map((entity) => this.entityCheckbox(entity)).join('')}
          </div>`).join('') : '<p class="empty">No entities were harvested from this selection.</p>'}
      </div>
      <div class="btn-row">
        <button data-download-brief ${selectedCount ? '' : 'disabled'}>Download agent brief zip</button>
      </div>`;
  }

  groupExportEntities(entities: ExportEntity[]): { title: string; entities: ExportEntity[] }[] {
    const groups = new Map<string, ExportEntity[]>();
    entities.forEach((entity) => {
      const ref = entity.references?.[0];
      const title = ref ? `${ref.view} / ${ref.card_type}` : 'Other harvested entities';
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title)!.push(entity);
    });
    return Array.from(groups.entries()).map(([title, groupEntities]) => ({ title, entities: groupEntities }));
  }

  previewManifest(result: ExportResult): Manifest {
    const selected = result.entities.filter((e) => e.selected);
    return {
      read_entities: selected.filter((e) => e.scopes.read).map((e) => e.entity_id),
      subscriptions: selected.filter((e) => e.scopes.subscriptions).map((e) => e.entity_id),
      history: selected.filter((e) => e.scopes.history).map((e) => e.entity_id),
      camera_snapshots: selected.filter((e) => e.scopes.camera_snapshots).map((e) => e.entity_id),
      actions: [],
    };
  }

  entityCheckbox(entity: ExportEntity): string {
    const scopes: string[] = [];
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

  // ---------- dashboard export interactions (unchanged behaviour) ----------

  async pickDashboard(index: string): Promise<void> {
    if (index === '') {
      this._selectedDashboardIndex = undefined;
      this._exportConfig = null;
      this._exportResult = null;
      this.render(this._lastState!);
      return;
    }
    const dashboard = this._dashboards?.[Number(index)];
    if (!dashboard) return;
    this._exportLoading = true;
    this._exportError = '';
    this.render(this._lastState!);
    try {
      const message: { type: string; force: boolean; url_path?: string } = { type: 'lovelace/config', force: false };
      if (dashboard.url_path !== null && dashboard.url_path !== undefined) message.url_path = dashboard.url_path;
      this._exportConfig = await this._hass!.connection.sendMessagePromise(message);
      this._selectedDashboardIndex = Number(index);
      this._selectedViewIndex = '';
      await this.refreshExportPreview();
    } catch (err) {
      this._exportError = `Could not load dashboard: ${(err as Error).message || err}`;
      this._exportResult = null;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState!);
    }
  }

  async pickView(value: string): Promise<void> {
    this._selectedViewIndex = value;
    this._exportLoading = true;
    this.render(this._lastState!);
    try {
      await this.refreshExportPreview();
    } catch (err) {
      this._exportError = `Could not harvest view: ${(err as Error).message || err}`;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState!);
    }
  }

  async refreshExportPreview(): Promise<void> {
    const result = await this.requestDashboardExport();
    this._exportResult = result;
    this._selectedEntities = new Set(result.entities.filter((e) => e.selected).map((e) => e.entity_id));
  }

  async requestDashboardExport(selectedEntities?: string[]): Promise<ExportResult> {
    const dashboard = this._selectedDashboardIndex !== undefined ? this._dashboards?.[this._selectedDashboardIndex] : undefined;
    const message: Record<string, unknown> = {
      type: 'varco/dashboard_export',
      config: this._exportConfig,
      dashboard_title: dashboard?.title || 'Home Assistant dashboard',
      dashboard_url_path: dashboard?.url_path ?? null,
    };
    if (this._selectedViewIndex !== '' && this._selectedViewIndex !== undefined && this._selectedViewIndex !== null) message.view_index = Number(this._selectedViewIndex);
    if (selectedEntities) message.selected_entities = selectedEntities;
    return this._hass!.connection.sendMessagePromise<ExportResult>(message as { type: string });
  }

  toggleEntity(entityId: string, checked: boolean): void {
    if (!this._selectedEntities) this._selectedEntities = new Set();
    if (checked) this._selectedEntities.add(entityId);
    else this._selectedEntities.delete(entityId);
    if (this._exportResult) {
      this._exportResult.entities = this._exportResult.entities.map((e) => (e.entity_id === entityId ? { ...e, selected: checked } : e));
    }
    this.render(this._lastState!);
  }

  async downloadDashboardBrief(): Promise<void> {
    if (!this._exportResult) return;
    this._exportLoading = true;
    this.render(this._lastState!);
    try {
      const selected = Array.from(this._selectedEntities || []);
      const exportResult = await this.requestDashboardExport(selected);
      const zip = this.createZip({ 'brief.md': exportResult.brief, 'manifest.json': `${JSON.stringify(exportResult.manifest, null, 2)}\n` });
      const dashboard = this._selectedDashboardIndex !== undefined ? this._dashboards?.[this._selectedDashboardIndex] : undefined;
      const name = this.slugify(`${dashboard?.title || 'varco-dashboard'}-${exportResult.dashboard?.view_title || 'brief'}`);
      this.downloadBlob(zip, `${name}.zip`);
      this._exportResult = exportResult;
      this._selectedEntities = new Set(exportResult.entities.filter((e) => e.selected).map((e) => e.entity_id));
    } catch (err) {
      this._exportError = `Could not generate brief: ${(err as Error).message || err}`;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState!);
    }
  }

  // ---------- in-place grant filter ----------

  applyGrantFilter(): void {
    const search = (this._grantSearch || '').trim().toLowerCase();
    const statusFilter = this._grantStatusFilter || 'all';
    let visible = 0;
    this.querySelectorAll<HTMLElement>('.grant').forEach((card) => {
      const name = (card.getAttribute('data-grant-name') || '').toLowerCase();
      const status = card.getAttribute('data-grant-card-status') || 'active';
      const matches = (!search || name.includes(search)) && (statusFilter === 'all' || status === statusFilter);
      card.style.display = matches ? '' : 'none';
      if (matches) visible += 1;
    });
    const empty = this.querySelector<HTMLElement>('[data-grant-empty]');
    if (empty) empty.style.display = visible ? 'none' : '';
  }

  // ---------- inline confirm ----------

  showInlineConfirm(triggerEl: HTMLElement, opts: { kind: string; message: string; confirmLabel: string; onConfirm: () => void }): void {
    const row = triggerEl.closest<HTMLElement>('.btn-row') || triggerEl.parentElement;
    if (!row) { opts.onConfirm(); return; }
    if (row.querySelector('[data-confirm-row]')) return;
    triggerEl.style.display = 'none';
    const confirmEl = document.createElement('div');
    confirmEl.className = 'confirm';
    confirmEl.setAttribute('data-confirm-row', opts.kind);
    confirmEl.setAttribute(`data-confirm-${opts.kind}`, '');
    confirmEl.innerHTML = `
      <span class="msg">${this.escape(opts.message)}</span>
      <span class="acts">
        <button class="danger" data-confirm-yes>${this.escape(opts.confirmLabel)}</button>
        <button class="ghost" data-cancel-confirm>Cancel</button>
      </span>`;
    const cleanup = () => { confirmEl.remove(); triggerEl.style.display = ''; };
    confirmEl.querySelector<HTMLButtonElement>('[data-cancel-confirm]')!.onclick = cleanup;
    confirmEl.querySelector<HTMLButtonElement>('[data-confirm-yes]')!.onclick = () => {
      confirmEl.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      opts.onConfirm();
    };
    row.appendChild(confirmEl);
  }

  // ---------- wizard step navigation (client-side, no reload) ----------

  private setStep(requestId: string, step: number): void {
    this._step[requestId] = step;
    const panes = this.querySelector<HTMLElement>(`[data-panes="${CSS.escape(requestId)}"]`);
    const card = this.querySelector<HTMLElement>(`[data-request-card="${CSS.escape(requestId)}"]`);
    if (panes) {
      panes.querySelectorAll<HTMLElement>('.pane').forEach((p) => {
        p.classList.toggle('show', p.getAttribute('data-pane') === String(step));
      });
    }
    if (card) {
      const steps = card.querySelectorAll<HTMLElement>('.step');
      const bars = card.querySelectorAll<HTMLElement>('.step-bar');
      steps.forEach((el, i) => {
        const n = i + 1;
        el.classList.toggle('active', n === step);
        el.classList.toggle('done', n < step);
        const num = el.querySelector<HTMLElement>('.num');
        if (num) num.innerHTML = n < step ? icons.check : String(n);
      });
      bars.forEach((bar, i) => bar.classList.toggle('done', i + 1 < step));
    }
    if (step === 3) this.updateApproveSummary(requestId);
  }

  private currentExpiry(requestId: string): { value: string; label: string } {
    const hidden = this.querySelector<HTMLInputElement>(`[data-approve-expiry="${CSS.escape(requestId)}"]`);
    const value = hidden?.value || 'none';
    if (value === 'none') return { value, label: 'until you revoke it' };
    if (value === 'custom') {
      const custom = this.querySelector<HTMLInputElement>(`[data-approve-expiry-custom="${CSS.escape(requestId)}"]`)?.value;
      return { value, label: custom ? `until ${new Date(custom).toLocaleString()}` : 'a custom time (not set yet)' };
    }
    const map: Record<string, string> = { '3600000': 'for 1 hour', '86400000': 'for 24 hours', '604800000': 'for 7 days' };
    return { value, label: map[value] || 'for a limited time' };
  }

  private updateApproveSummary(requestId: string): void {
    const box = this.querySelector<HTMLElement>(`[data-approve-summary="${CSS.escape(requestId)}"]`);
    if (!box) return;
    // recompute permissions from current checkbox state
    const boxes = [...this.querySelectorAll<HTMLInputElement>(`[data-scope-request="${CSS.escape(requestId)}"]`)];
    const byKey: Record<string, string[]> = {};
    boxes.forEach((b) => { if (b.checked) (byKey[b.dataset.scopeKey!] = byKey[b.dataset.scopeKey!] || []).push(b.value); });
    const fakeManifest: Manifest = byKey;
    const permsEl = box.querySelector<HTMLElement>('[data-summary-perms]');
    const expiryEl = box.querySelector<HTMLElement>('[data-summary-expiry]');
    if (permsEl) permsEl.textContent = boxes.length ? this.plainSummary(fakeManifest) : this.plainSummary(this._lastState?.requests.find((r) => r.request_id === requestId)?.manifest);
    if (expiryEl) expiryEl.textContent = this.currentExpiry(requestId).label;
  }

  // ---------- render ----------

  render(state?: PanelState): void {
    if (state) this._lastState = state;
    if (!this._lastState || this._lastState.loading) {
      this.innerHTML = `<ha-card><div class="card-content">${styles()}<div class="wrap">Loading Varco…</div></div></ha-card>`;
      return;
    }
    const current = this._lastState;
    const pending = current.requests.filter((r) => r.status === 'pending');
    this.innerHTML = `
      <ha-card header="Varco Authority">
        <div class="card-content">${styles()}
          <div class="wrap">
            <div class="topbar">
              <div class="card">
                <div class="relay-line"><span class="eyebrow">Authority ID</span></div>
                <div class="v" style="margin-top:8px"><code>${this.escape(current.info.authority_id)}</code></div>
              </div>
              ${this.relayHealthSection(current.info.relay)}
            </div>

            <div class="h-page">Pending access requests ${pending.length ? `<span class="count">${pending.length}</span>` : ''}</div>
            ${pending.length ? pending.map((r) => this.requestCard(r)).join('') : '<p class="empty">No one is waiting for access right now.</p>'}

            <div class="h-page">Grants ${current.grants.length ? `<span class="count">${current.grants.length}</span>` : ''}</div>
            ${current.grants.length ? `
              <div class="controls">
                <div class="search">${icons.search}<input type="search" data-grant-search placeholder="Search by consumer name" value="${this.escape(this._grantSearch)}"></div>
                <select data-grant-status-filter>
                  ${['all', 'active', 'revoked', 'expired'].map((v) => `<option value="${v}" ${(this._grantStatusFilter || 'all') === v ? 'selected' : ''}>${v === 'all' ? 'All statuses' : v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
                </select>
              </div>` : ''}
            ${current.grants.length ? current.grants.map((g) => this.grantCard(g)).join('') : '<p class="empty">No grants yet.</p>'}
            ${current.grants.length ? '<p class="empty" data-grant-empty style="display:none">No grants match the current filter.</p>' : ''}

            ${this.auditSection()}

            ${this.dashboardExportSection()}
          </div>
        </div>
      </ha-card>`;
    this.wireEvents();
  }

  private wireEvents(): void {
    // wizard step nav
    this.querySelectorAll<HTMLElement>('[data-step-next]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.stepNext!;
        this.setStep(id, Math.min(3, (this._step[id] || 1) + 1));
      };
    });
    this.querySelectorAll<HTMLElement>('[data-step-prev]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.stepPrev!;
        this.setStep(id, Math.max(1, (this._step[id] || 1) - 1));
      };
    });
    // select all / none
    this.querySelectorAll<HTMLElement>('[data-scope-all]').forEach((el) => {
      el.onclick = () => { this.querySelectorAll<HTMLInputElement>(`[data-scope-request="${CSS.escape(el.dataset.scopeAll!)}"]`).forEach((b) => { b.checked = true; }); };
    });
    this.querySelectorAll<HTMLElement>('[data-scope-none]').forEach((el) => {
      el.onclick = () => { this.querySelectorAll<HTMLInputElement>(`[data-scope-request="${CSS.escape(el.dataset.scopeNone!)}"]`).forEach((b) => { b.checked = false; }); };
    });
    // expiry chips
    this.querySelectorAll<HTMLElement>('[data-expiry-chip]').forEach((chip) => {
      chip.onclick = () => {
        const id = chip.dataset.expiryChip!;
        const value = chip.dataset.expiryValue!;
        this.querySelectorAll<HTMLElement>(`[data-expiry-chips="${CSS.escape(id)}"] .chip`).forEach((c) => c.classList.remove('sel'));
        chip.classList.add('sel');
        const hidden = this.querySelector<HTMLInputElement>(`[data-approve-expiry="${CSS.escape(id)}"]`);
        if (hidden) hidden.value = value;
        const custom = this.querySelector<HTMLInputElement>(`[data-approve-expiry-custom="${CSS.escape(id)}"]`);
        if (custom) custom.style.display = value === 'custom' ? 'block' : 'none';
        this.updateApproveSummary(id);
      };
    });
    this.querySelectorAll<HTMLInputElement>('[data-approve-expiry-custom]').forEach((el) => {
      el.onchange = () => this.updateApproveSummary(el.dataset.approveExpiryCustom!);
    });

    // approve
    this.querySelectorAll<HTMLElement>('[data-approve]').forEach((el) => {
      el.onclick = () => {
        const requestId = el.dataset.approve!;
        const boxes = [...this.querySelectorAll<HTMLInputElement>(`[data-scope-request="${CSS.escape(requestId)}"]`)];
        const payload: Record<string, unknown> = { request_id: requestId };
        if (boxes.some((b) => !b.checked)) {
          const approved: Record<string, string[]> = {};
          boxes.forEach((b) => {
            (approved[b.dataset.scopeKey!] = approved[b.dataset.scopeKey!] || []);
            if (b.checked) approved[b.dataset.scopeKey!].push(b.value);
          });
          payload.approved_manifest = approved;
        }
        const expiry = this.currentExpiry(requestId);
        if (expiry.value === 'custom') {
          const customVal = this.querySelector<HTMLInputElement>(`[data-approve-expiry-custom="${CSS.escape(requestId)}"]`)?.value;
          if (customVal) payload.expires_at = new Date(customVal).toISOString();
        } else if (expiry.value !== 'none') {
          payload.expires_at = new Date(Date.now() + Number(expiry.value)).toISOString();
        }
        void this.call('varco/approve_request', payload);
      };
    });
    this.querySelectorAll<HTMLElement>('[data-reject]').forEach((el) => {
      el.onclick = () => void this.call('varco/reject_request', { request_id: el.dataset.reject! });
    });

    // revoke / delete with inline confirm
    this.querySelectorAll<HTMLElement>('[data-revoke]').forEach((el) => {
      el.onclick = () => this.showInlineConfirm(el, {
        kind: 'revoke',
        message: 'Revoke access? This immediately ends active sessions for this consumer.',
        confirmLabel: 'Revoke access',
        onConfirm: () => void this.call('varco/revoke_grant', { grant_id: el.dataset.revoke! }),
      });
    });
    this.querySelectorAll<HTMLElement>('[data-delete-grant]').forEach((el) => {
      el.onclick = () => this.showInlineConfirm(el, {
        kind: 'delete',
        message: `Delete grant record for ${el.dataset.name}? This also removes active access for that consumer.`,
        confirmLabel: 'Delete grant record',
        onConfirm: () => void this.call('varco/delete_grant', { grant_id: el.dataset.deleteGrant! }),
      });
    });

    // add-restriction type selector
    this.querySelectorAll<HTMLSelectElement>('[data-rf-type]').forEach((sel) => {
      sel.onchange = () => {
        const grantId = sel.dataset.rfType!;
        const fieldsEl = this.querySelector<HTMLElement>(`[data-rf-fields="${grantId}"]`);
        if (fieldsEl) fieldsEl.innerHTML = this.restrictionTypeFields(sel.value);
        if (sel.value && fieldsEl && !fieldsEl.querySelector('[data-rf-save]')) {
          const btn = document.createElement('button');
          btn.textContent = 'Save restriction';
          btn.dataset.rfSave = grantId;
          btn.style.marginTop = '12px';
          fieldsEl.appendChild(btn);
        }
      };
    });

    // remove restriction
    this.querySelectorAll<HTMLElement>('[data-remove-restriction]').forEach((btn) => {
      btn.onclick = async () => {
        const grantId = btn.dataset.removeRestriction!;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const existing = Array.isArray(grant?.restrictions) ? grant!.restrictions! : [];
        const updated = existing.filter((_, i) => i !== idx);
        await this._hass!.connection.sendMessagePromise({ type: 'varco/update_grant_restrictions', grant_id: grantId, restrictions: updated });
        this._loaded = false;
        await this.load();
      };
    });

    // toggle restriction
    this.querySelectorAll<HTMLElement>('[data-toggle-restriction]').forEach((btn) => {
      btn.onclick = async () => {
        const grantId = btn.dataset.toggleRestriction!;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const existing = Array.isArray(grant?.restrictions) ? grant!.restrictions! : [];
        if (!existing[idx]) return;
        (btn as HTMLButtonElement).disabled = true;
        const updated = existing.map((item, i) => (i === idx ? { ...item, enabled: item.enabled === false } : item));
        await this._hass!.connection.sendMessagePromise({ type: 'varco/update_grant_restrictions', grant_id: grantId, restrictions: updated });
        this._loaded = false;
        await this.load();
      };
    });

    // edit restriction in place
    this.querySelectorAll<HTMLElement>('[data-edit-restriction]').forEach((btn) => {
      btn.onclick = () => {
        const grantId = btn.dataset.editRestriction!;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const original = grant?.restrictions?.[idx];
        const editEl = this.querySelector<HTMLElement>(`[data-restriction-edit="${CSS.escape(grantId)}"][data-restriction-index="${idx}"]`);
        if (!original || !editEl) return;
        if (!editEl.hidden) return;
        editEl.innerHTML = `${this.restrictionEditFields(original)}<div class="btn-row" style="margin-top:8px"><button class="tiny" data-re-save>Save</button><button class="ghost tiny" data-re-cancel>Cancel</button></div>`;
        editEl.hidden = false;
        editEl.querySelector<HTMLButtonElement>('[data-re-cancel]')!.onclick = () => { editEl.hidden = true; editEl.innerHTML = ''; };
        editEl.querySelector<HTMLButtonElement>('[data-re-save]')!.onclick = async (ev) => {
          const updatedR = this.buildEditedRestriction(grantId, idx, editEl);
          if (!updatedR) return;
          const existing = Array.isArray(grant?.restrictions) ? grant!.restrictions! : [];
          const updated = existing.map((item, i) => (i === idx ? updatedR : item));
          const tgt = ev.currentTarget as HTMLButtonElement;
          tgt.disabled = true;
          tgt.textContent = 'Saving…';
          await this._hass!.connection.sendMessagePromise({ type: 'varco/update_grant_restrictions', grant_id: grantId, restrictions: updated });
          this._loaded = false;
          await this.load();
        };
      };
    });

    // grant filter
    const grantSearch = this.querySelector<HTMLInputElement>('[data-grant-search]');
    if (grantSearch) grantSearch.oninput = () => { this._grantSearch = grantSearch.value; this.applyGrantFilter(); };
    const grantStatusFilter = this.querySelector<HTMLSelectElement>('[data-grant-status-filter]');
    if (grantStatusFilter) grantStatusFilter.onchange = () => { this._grantStatusFilter = grantStatusFilter.value; this.applyGrantFilter(); };

    // dashboard export
    const dashboardSelect = this.querySelector<HTMLSelectElement>('[data-dashboard-select]');
    if (dashboardSelect) dashboardSelect.onchange = () => void this.pickDashboard(dashboardSelect.value);
    const viewSelect = this.querySelector<HTMLSelectElement>('[data-view-select]');
    if (viewSelect) viewSelect.onchange = () => void this.pickView(viewSelect.value);
    this.querySelectorAll<HTMLInputElement>('[data-export-entity]').forEach((el) => { el.onchange = () => this.toggleEntity(el.dataset.exportEntity!, el.checked); });
    const download = this.querySelector<HTMLElement>('[data-download-brief]');
    if (download) download.onclick = () => void this.downloadDashboardBrief();

    this.applyGrantFilter();
  }

  // ---------- zip (unchanged) ----------

  slugify(value: string): string {
    return String(value || 'varco-brief').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'varco-brief';
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  createZip(files: Record<string, string>): Blob {
    const encoder = new TextEncoder();
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
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
    return new Blob([...localParts, ...centralParts, end] as BlobPart[], { type: 'application/zip' });
  }

  zipHeader(size: number, signature: number, nameBytes: Uint8Array, data: Uint8Array, crc: number, offset: number): Uint8Array {
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

  crc32(data: Uint8Array): number {
    if (!this._crcTable) {
      this._crcTable = Array.from({ length: 256 }, (_, index) => {
        let crc = index;
        for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        return crc >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (let index = 0; index < data.length; index += 1) crc = this._crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
}

customElements.define('varco-panel', VarcoPanel);
