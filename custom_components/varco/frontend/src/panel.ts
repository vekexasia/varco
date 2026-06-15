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

const FONTS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">`;

interface ScopeDef {
  key: ScopeKey;
  title: string;
  desc: string;
  icon: IconName;
  color: string;
  short: string;
}

const SCOPE_DEFS: ScopeDef[] = [
  { key: 'read_entities', title: 'Read entity states', desc: 'See the current value of these entities', icon: 'eye', color: 'var(--c-read)', short: 'READ' },
  { key: 'subscriptions', title: 'Live updates', desc: 'Get notified when these entities change', icon: 'live', color: 'var(--c-live)', short: 'LIVE' },
  { key: 'history', title: 'Query history', desc: 'Read past values of these entities', icon: 'history', color: 'var(--c-history)', short: 'HISTORY' },
  { key: 'camera_snapshots', title: 'Camera snapshots', desc: 'Capture still images from these cameras', icon: 'camera', color: 'var(--c-cameras)', short: 'CAMERAS' },
  { key: 'actions', title: 'Control actions', desc: 'Call these Home Assistant services', icon: 'bolt', color: 'var(--c-actions)', short: 'ACTIONS' },
];

// Audit category -> label + colour, used by the activity filter tabs and markers.
const CAT: Record<string, { label: string; color: string }> = {
  connection: { label: 'CONNECTION', color: 'var(--accent)' },
  share: { label: 'SHARE', color: 'var(--primary)' },
  access: { label: 'ACCESS', color: 'var(--text-2)' },
  control: { label: 'CONTROL', color: 'var(--coral)' },
  admin: { label: 'ADMIN', color: 'var(--red)' },
};

const ANCHORS: Array<[string, string]> = [
  ['sec-overview', 'Overview'],
  ['sec-share', 'Share'],
  ['sec-requests', 'Requests'],
  ['sec-grants', 'Grants'],
  ['sec-activity', 'Activity'],
  ['sec-export', 'Export'],
];

interface Toast {
  msg: string;
  tone: 'ok' | 'danger' | 'warn';
}

export class VarcoPanel extends HTMLElement {
  private _hass?: Hass;
  private _loaded = false;
  private _lastState?: PanelState;
  private _refreshTimer?: number;
  private _toastTimer?: number;
  private _pendingSignature = '';
  private _grantSearch = '';
  private _grantStatusFilter = 'all';
  private _activityFilter = 'all';
  private _confirmRevoke: { grantId: string; name: string } | null = null;
  private _toast: Toast | null = null;
  private _authCopied = false;
  private _shareEntityId = '';
  private _shareName = '';
  private _shareClaims = '1';
  private _shareUrl = '';
  private _shareError = '';
  private _shareLoading = false;
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
      const signature = requests.filter((r) => r.status === 'pending').map((r) => `${r.request_id}:${r.pairing_code}:${JSON.stringify(r.manifest)}`).sort().join(',');
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
    this._pendingSignature = requests.filter((r) => r.status === 'pending').map((r) => `${r.request_id}:${r.pairing_code}:${JSON.stringify(r.manifest)}`).sort().join(',');
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


  private flash(msg: string, tone: Toast['tone'] = 'ok'): void {
    this._toast = { msg, tone };
    this.renderToast();
    clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => { this._toast = null; this.renderToast(); }, 2600);
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

  // Coloured permission chips for the grant card header.
  permChips(manifest: Manifest | undefined): string {
    const s = this.scopes(manifest);
    return SCOPE_DEFS
      .filter((def) => s[def.key].length)
      .map((def) => `<span class="perm-chip"><span class="sw" style="background:${def.color}"></span>${s[def.key].length} ${def.short}</span>`)
      .join('');
  }

  shortKey(value: unknown): string {
    const text = String(value || '');
    if (text.length <= 24) return text || 'unknown';
    return `${text.slice(0, 12)}…${text.slice(-8)}`;
  }

  formatDate(value: unknown): string {
    if (!value) return 'unknown';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  formatTime(value: unknown): string {
    if (!value) return '';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString();
  }

  toLocalInput(iso: unknown): string {
    if (!iso) return '';
    const date = new Date(iso as string);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ---------- KPI strip ----------

  private kpiStrip(): string {
    const state = this._lastState!;
    const grants = state.grants || [];
    const active = grants.filter((g) => this.grantStatus(g) === 'active');
    const pending = state.requests.filter((r) => r.status === 'pending').length;
    const audit = Array.isArray(state.audit) ? state.audit : [];
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const events24 = audit.filter((e) => { const t = new Date(e.ts).getTime(); return !Number.isNaN(t) && t >= dayAgo; }).length;

    const ents = new Set<string>();
    let actions = 0;
    active.forEach((g) => {
      const s = this.scopes(g.manifest);
      [...s.read_entities, ...s.subscriptions, ...s.camera_snapshots].forEach((e) => ents.add(e));
      actions += s.actions.length;
    });
    const connected = !!state.info.relay?.connected;

    const kpis = [
      { lab: 'Active grants', val: String(active.length), sub: `of ${grants.length} total`, color: 'var(--accent)' },
      { lab: 'Pending requests', val: String(pending), sub: pending ? 'awaiting review' : 'all clear', color: pending ? 'var(--amber)' : 'var(--text-3)' },
      { lab: 'Events · 24h', val: String(events24), sub: `${audit.length} all time`, color: 'var(--primary)' },
      { lab: 'Surface exposed', val: String(ents.size), sub: `${ents.size} entities · ${actions} actions`, color: 'var(--violet)' },
      { lab: 'Relay', val: connected ? 'Connected' : 'Offline', sub: state.info.relay?.last_connected ? `last ${this.formatTime(state.info.relay.last_connected)}` : 'never', color: connected ? 'var(--accent)' : 'var(--red)' },
    ];
    return `<div class="kpi-grid">${kpis.map((k) => `
      <div class="kpi">
        <div class="head"><span class="dot" style="background:${k.color}"></span><span class="lab">${this.escape(k.lab)}</span></div>
        <div class="val">${this.escape(k.val)}</div>
        <div class="sub">${this.escape(k.sub)}</div>
      </div>`).join('')}</div>`;
  }

  private legend(): string {
    return `<div class="legend">${SCOPE_DEFS.map((d) => `<span class="item"><span class="sw" style="background:${d.color}"></span>${this.escape(d.short)}</span>`).join('')}</div>`;
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
            <span class="perm-ico" style="color:${def.color}">${icons[def.icon]}</span>
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
            <button class="go" data-approve="${this.escape(id)}">Approve access</button>
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
        <div class="grant-chips"><div class="perm-chips">${this.permChips(grant.manifest)}</div></div>
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
          <summary>Scope · what this consumer may touch <span class="count-tag">&middot; ${this.escape(this.scopeSummary(grant.manifest))}</span></summary>
          <div class="sec-inner">
            <div class="scope-grid">
              ${SCOPE_DEFS.map((def) => this.scopeBox(def, s[def.key])).join('')}
            </div>
          </div>
        </details>
        ${grant.revoked ? '' : this.restrictionsSection(grant.grant_id, restrictions)}
        ${this.grantActivity(grant.grant_id)}
        <div class="grant-body">
          <div class="btn-row" style="margin-top:6px">
            ${grant.revoked ? '' : `<button class="danger" data-revoke="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">${icons.ban} Revoke access</button>`}
            <button class="danger" data-delete-grant="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">${icons.trash} Delete record</button>
          </div>
        </div>
      </div>`;
  }

  private scopeBox(def: ScopeDef, values: string[]): string {
    return `
      <div class="scope-box">
        <div class="t"><span class="sw" style="background:${def.color}"></span>${this.escape(def.short)}</div>
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
    const container = this.querySelector<HTMLElement>(`[data-rf-fields="${CSS.escape(grantId)}"]`);
    if (!container) return null;
    const type = this.querySelector<HTMLSelectElement>(`[data-rf-type="${CSS.escape(grantId)}"]`)?.value;
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
      grant_created: 'Grant created',
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
      share_created: 'Share created',
      share_claimed: 'Share claimed',
      webrtc_fallback: 'WebRTC fallback to relay',
      webrtc_answer: 'WebRTC negotiated',
    };
    return labels[event] || String(event || 'event');
  }

  // Map a raw audit event name to one of the five activity categories.
  auditCategory(event: string): keyof typeof CAT {
    if (['consumer_connected', 'webrtc_answer', 'webrtc_fallback', 'session_error'].includes(event)) return 'connection';
    if (['share_created', 'share_claimed'].includes(event)) return 'share';
    if (event === 'call_service') return 'control';
    if (['access_request_received', 'access_request_approved', 'access_request_rejected', 'grant_created', 'grant_revoked', 'grant_deleted', 'grant_restrictions_updated'].includes(event)) return 'admin';
    return 'access';
  }

  private auditSuccess(event: string): boolean {
    return ['access_request_approved', 'grant_created', 'consumer_connected', 'call_service', 'share_claimed', 'webrtc_answer'].includes(event);
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
    const cat = this.auditCategory(event.event);
    const color = CAT[cat].color;
    const success = this.auditSuccess(event.event);
    const markerStyle = success
      ? `background:${color};border-color:${color};color:var(--bg);`
      : `background:transparent;border-color:${color};color:${color};`;
    return `
      <div class="audit-row" data-audit-event data-audit-grant="${this.escape(event.grant_id || '')}">
        <span class="audit-ico" style="${markerStyle}">${success ? '✓' : ''}</span>
        <span class="audit-mid">
          <span class="audit-type" data-audit-type>${this.escape(this.auditEventLabel(event.event))}</span>
          <span class="audit-cat" style="color:${color}">${CAT[cat].label}</span>
          ${detail ? `<span class="audit-detail">${detail}</span>` : ''}
        </span>
        <span class="audit-meta">
          <span class="audit-ts">${this.escape(this.formatTime(event.ts))}</span>
          ${event.grant_id ? `<code class="audit-grant">${this.escape(this.shortKey(event.grant_id))}</code>` : ''}
        </span>
      </div>`;
  }

  auditSection(): string {
    const events = Array.isArray(this._lastState?.audit) ? this._lastState!.audit : [];
    const filter = this._activityFilter;
    const filtered = (filter === 'all' ? events : events.filter((e) => this.auditCategory(e.event) === filter)).slice().reverse().slice(0, 80);
    const filterDefs: Array<[string, string]> = [['all', 'All'], ['connection', 'Connect'], ['share', 'Share'], ['access', 'Access'], ['control', 'Control'], ['admin', 'Admin']];
    const tabs = filterDefs.map(([k, l]) => `<button class="afilter ${filter === k ? 'sel' : ''}" data-activity-filter="${k}">${l}</button>`).join('');
    return `
      <div class="audit-card">
        <div class="audit-toolbar">
          <div class="top">
            <span class="title">Access oversight</span>
            <span class="ct">${filtered.length}</span>
            <span class="vspace"></span>
            <span class="note"><span class="dot"></span>states, snapshots &amp; history are never logged</span>
          </div>
          <div class="act-filters">${tabs}</div>
        </div>
        <div class="audit-list" data-audit-list>
          ${filtered.length ? filtered.map((e) => this.auditRow(e)).join('') : '<p class="empty" style="padding:18px">No activity recorded yet.</p>'}
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

  // ---------- entity share ----------

  shareEntities(): Array<{ id: string; label: string }> {
    return Object.entries(this._hass?.states || {})
      .map(([id, state]) => ({ id, label: String(state.attributes?.friendly_name || id) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  shareEntityLabel(entityId: string): string {
    return this.shareEntities().find((entity) => entity.id === entityId)?.label || entityId;
  }

  entityShareSection(): string {
    return `
      <div class="card panel">
        ${this._shareError ? `<p class="callout danger">${this.escape(this._shareError)}</p>` : ''}
        ${this._shareUrl ? `<p class="callout"><b>Share created.</b><br><code>${this.escape(this._shareUrl)}</code></p><button class="subtle" data-copy-share-link>Copy link</button>` : ''}
        <label class="field">Entity</label>
        <input data-share-entity placeholder="Start typing a name or entity id" value="${this.escape(this._shareEntityId)}" autocomplete="off">
        <div class="share-suggestions" data-share-suggestions></div>
        <label class="field">Share name</label>
        <input data-share-name placeholder="Mario living room light" value="${this.escape(this._shareName)}">
        <label class="field">Allowed devices / claims</label>
        <input data-share-claims type="number" min="1" value="${this.escape(this._shareClaims)}">
        <div class="btn-row"><button data-create-entity-share ${this._shareLoading ? 'disabled' : ''}>${this._shareLoading ? 'Creating…' : 'Create share link'}</button></div>
      </div>`;
  }

  entityShareManifest(entityId: string, name: string): Manifest {
    const domain = entityId.split('.')[0];
    return {
      name,
      version: '1',
      read_entities: [entityId],
      subscriptions: [entityId],
      actions: ['sensor', 'binary_sensor'].includes(domain) ? [] : [`${domain}.*@${entityId}`],
    };
  }

  localShareUrl(shareUrl: string): string {
    if (!['127.0.0.1', 'localhost'].includes(location.hostname)) return shareUrl;
    try {
      const url = new URL(shareUrl);
      const bridge = new URL(shareUrl);
      bridge.protocol = bridge.protocol === 'https:' ? 'wss:' : 'ws:';
      url.protocol = 'http:';
      url.hostname = '127.0.0.1';
      url.port = '8787';
      url.searchParams.set('bridge', bridge.origin);
      return url.toString();
    } catch {
      return shareUrl;
    }
  }

  copyText(value: string): void {
    if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(value); return; }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  updateShareSuggestions(input: HTMLInputElement): void {
    const box = this.querySelector<HTMLElement>('[data-share-suggestions]');
    if (!box) return;
    const query = input.value.trim().toLowerCase();
    const matches = this.shareEntities()
      .filter((entity) => !query || entity.id.toLowerCase().includes(query) || entity.label.toLowerCase().includes(query))
      .slice(0, 8);
    box.innerHTML = matches.map((entity) => `<button type="button" data-share-pick="${this.escape(entity.id)}"><span>${this.escape(entity.label)}</span><code>${this.escape(entity.id)}</code></button>`).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-share-pick]').forEach((button) => {
      button.onclick = () => {
        const entityId = button.dataset.sharePick || '';
        this._shareEntityId = entityId;
        input.value = entityId;
        const nameInput = this.querySelector<HTMLInputElement>('[data-share-name]');
        if (nameInput && !nameInput.value.trim()) {
          this._shareName = this.shareEntityLabel(entityId);
          nameInput.value = this._shareName;
        }
        box.innerHTML = '';
      };
    });
  }

  async createEntityShare(): Promise<void> {
    const entityId = this._shareEntityId.trim();
    const name = this._shareName.trim() || entityId;
    const maxClaims = Number(this._shareClaims || '1');
    this._shareError = '';
    this._shareUrl = '';
    if (!/^\w+\.[\w-]+$/.test(entityId)) { this._shareError = 'Enter an entity id like light.kitchen.'; this.render(this._lastState!); return; }
    if (!Number.isInteger(maxClaims) || maxClaims < 1) { this._shareError = 'Allowed devices must be a positive number.'; this.render(this._lastState!); return; }
    this._shareLoading = true;
    this.render(this._lastState!);
    try {
      const response = await this._hass!.connection.sendMessagePromise<{ share_url: string }>({
        type: 'varco/create_share',
        name,
        max_claims: maxClaims,
        manifest: this.entityShareManifest(entityId, name),
      });
      this._shareUrl = this.localShareUrl(response.share_url);
      this.flash('Share link minted', 'ok');
    } catch (err) {
      this._shareError = (err as Error)?.message || String(err);
      this.flash('Could not create share', 'danger');
    } finally {
      this._shareLoading = false;
      this.render(this._lastState!);
    }
  }

  // ---------- dashboard export ----------

  dashboardExportSection(): string {
    const dashboards = this._dashboards || [];
    const dashboard = this._selectedDashboardIndex !== undefined ? dashboards[this._selectedDashboardIndex] : undefined;
    const views = Array.isArray(this._exportConfig?.views) ? this._exportConfig!.views! : [];
    const result = this._exportResult;
    const selectedCount = this._selectedEntities?.size || 0;
    return `
      <div class="card panel">
        ${this._dashboardError ? `<p class="callout warn">${this.escape(this._dashboardError)}</p>` : ''}
        ${this._exportError ? `<p class="callout danger">${this.escape(this._exportError)}</p>` : ''}
        <label class="field">Dashboard</label>
        <select data-dashboard-select>
          <option value="">Choose a dashboard…</option>
          ${dashboards.map((item, index) => `<option value="${index}" ${index === this._selectedDashboardIndex ? 'selected' : ''}>${this.escape(item.title)} (${this.escape(item.url_path || 'default')})</option>`).join('')}
        </select>
        ${dashboard && views.length ? `
          <label class="field">Scope</label>
          <select data-view-select>
            <option value="" ${this._selectedViewIndex === '' ? 'selected' : ''}>Whole dashboard</option>
            ${views.map((view, index) => { const v = view as { title?: string; path?: string }; return `<option value="${index}" ${String(index) === String(this._selectedViewIndex) ? 'selected' : ''}>View: ${this.escape(v.title || v.path || `View ${index + 1}`)}</option>`; }).join('')}
          </select>` : ''}
        ${this._exportLoading ? '<p class="muted" style="margin-top:12px">Harvesting dashboard…</p>' : ''}
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
        <details class="sec" style="border:1px solid var(--border);border-radius:var(--varco-radius-sm)">
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
        <button class="go" data-download-brief ${selectedCount ? '' : 'disabled'}>Download agent brief zip</button>
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
    const message: { type: string; [key: string]: unknown } = {
      type: 'varco/dashboard_export',
      config: this._exportConfig,
      dashboard_title: dashboard?.title || 'Home Assistant dashboard',
      dashboard_url_path: dashboard?.url_path ?? null,
    };
    if (this._selectedViewIndex !== '' && this._selectedViewIndex !== undefined && this._selectedViewIndex !== null) message.view_index = Number(this._selectedViewIndex);
    if (selectedEntities) message.selected_entities = selectedEntities;
    return this._hass!.connection.sendMessagePromise<ExportResult>(message);
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
      this.flash(`Exported ${name}.zip`, 'ok');
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

  // ---------- inline confirm (delete) ----------

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

  // ---------- chrome fragments ----------

  private topBar(info: VarcoInfo): string {
    const connected = !!info.relay?.connected;
    const brandSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="5" height="18" rx="2" fill="var(--accent)"/><rect x="16" y="3" width="5" height="18" rx="2" fill="var(--text-3)"/><circle cx="12" cy="12" r="2.6" fill="var(--accent)"/></svg>';
    return `
      <div class="vbar">
        <div class="vbrand">
          ${brandSvg}
          <span class="name">Varco <span class="sub">Authority</span></span>
          <span class="vchip ${connected ? 'ok' : 'off'}"><span class="dot"></span>${connected ? 'Relay connected' : 'Relay offline'}</span>
        </div>
      </div>`;
  }

  private summaryHeader(info: VarcoInfo): string {
    const connected = !!info.relay?.connected;
    const bridge = info.relay?.bridge_url || 'unknown';
    const last = info.relay?.last_connected ? this.formatTime(info.relay.last_connected) : 'never';
    const tabs = ANCHORS.map(([id, label]) => `<button class="atab" data-anchor="${id}">${label}</button>`).join('');
    return `
      <div class="summary">
        <div class="summary-top">
          <div class="summary-id">
            <div class="lab">Authority</div>
            <div class="copy" data-copy-auth>
              <span class="val mono">${this.escape(this.shortKey(info.authority_id))}</span>
              <span class="act">${this._authCopied ? 'COPIED' : 'COPY'}</span>
            </div>
          </div>
          <div class="summary-relay" data-relay-status="${connected ? 'connected' : 'disconnected'}">
            <div class="line"><span class="dot" style="background:${connected ? 'var(--accent)' : 'var(--red)'}"></span>${connected ? 'Relay connected' : 'Relay offline'}</div>
            <div class="meta mono"><span data-relay-bridge-url>${this.escape(bridge)}</span> &middot; last <span data-relay-last-connected>${this.escape(last)}</span></div>
          </div>
        </div>
        <div class="anchor-tabs">${tabs}</div>
      </div>`;
  }

  private revokeModal(): string {
    if (!this._confirmRevoke) return '';
    const name = this._confirmRevoke.name;
    return `
      <div class="modal-scrim" data-revoke-cancel>
        <div class="modal" data-revoke-stop>
          <div class="mhead">
            <span class="micon">&#9888;</span>
            <span class="mtitle">Revoke access?</span>
          </div>
          <p>This ends access for <strong>${this.escape(name)}</strong> immediately.</p>
          <p class="fine">Active and future sessions are cut by the Authority on the next check. The grant record stays for audit until you delete it.</p>
          <div class="macts">
            <button class="ghost" data-revoke-cancel>Cancel</button>
            <button style="background:var(--red);color:#fff" data-revoke-confirm>Revoke access</button>
          </div>
        </div>
      </div>`;
  }

  private renderToast(): void {
    const host = this.querySelector<HTMLElement>('[data-toast-host]');
    if (!host) return;
    if (!this._toast) { host.innerHTML = ''; return; }
    const toneFg: Record<Toast['tone'], string> = { ok: 'var(--accent)', danger: 'var(--red)', warn: 'var(--amber)' };
    const icon: Record<Toast['tone'], string> = { ok: '✓', danger: '✕', warn: '!' };
    const t = this._toast;
    host.innerHTML = `
      <div class="toast" style="border-color:color-mix(in srgb, ${toneFg[t.tone]} 40%, transparent)">
        <span class="ico" style="background:${toneFg[t.tone]}">${icon[t.tone]}</span>
        <span class="msg">${this.escape(t.msg)}</span>
      </div>`;
  }

  // ---------- render ----------

  render(state?: PanelState): void {
    if (state) this._lastState = state;
    if (!this._lastState || this._lastState.loading) {
      this.innerHTML = `${FONTS}<div class="varco-root">${styles()}<div class="wrap" style="padding:40px 22px">Loading Varco…</div></div>`;
      return;
    }
    const current = this._lastState;
    const pending = current.requests.filter((r) => r.status === 'pending');
    const activeCount = current.grants.filter((g) => this.grantStatus(g) === 'active').length;
    this.innerHTML = `
      ${FONTS}
      <div class="varco-root">
        ${styles()}
        ${this.topBar(current.info)}
        ${this.summaryHeader(current.info)}
        <div class="wrap">

          <section id="sec-overview">
            <div class="sec-eyebrow">Overview</div>
            <div class="sec-title">At a glance</div>
            ${this.legend()}
            ${this.kpiStrip()}
          </section>

          <section id="sec-share">
            <div class="sec-eyebrow">Create</div>
            <div class="sec-title">Share an entity</div>
            <div class="sec-lead">Mint a claim link for one Home Assistant entity. The consumer claims it, then asks you for a grant.</div>
            ${this.entityShareSection()}
          </section>

          <section id="sec-requests">
            <div class="sec-eyebrow">Consent</div>
            <div class="sec-title">Pending access requests ${pending.length ? `<span class="badge amber mono">${pending.length}</span>` : ''}</div>
            ${pending.length ? pending.map((r) => this.requestCard(r)).join('') : '<p class="empty">No one is waiting for access right now.</p>'}
          </section>

          <section id="sec-grants">
            <div class="sec-eyebrow">Access</div>
            <div class="sec-title">Grants <span class="badge muted mono">${activeCount} active</span></div>
            ${current.grants.length ? `
              <div class="controls">
                <div class="search">${icons.search}<input type="search" data-grant-search placeholder="Search by consumer name" value="${this.escape(this._grantSearch)}"></div>
                <div class="seg" data-grant-status-seg>
                  ${['all', 'active', 'revoked', 'expired'].map((v) => `<button data-grant-status="${v}" class="${(this._grantStatusFilter || 'all') === v ? 'sel' : ''}">${v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}
                </div>
              </div>` : ''}
            ${current.grants.length ? current.grants.map((g) => this.grantCard(g)).join('') : '<p class="empty">No grants yet.</p>'}
            ${current.grants.length ? '<p class="empty" data-grant-empty style="display:none">No grants match the current filter.</p>' : ''}
          </section>

          <section id="sec-activity">
            <div class="sec-eyebrow">Audit</div>
            <div class="sec-title">Activity</div>
            ${this.auditSection()}
          </section>

          <section id="sec-export">
            <div class="sec-eyebrow">Handoff</div>
            <div class="sec-title">Dashboard brief export</div>
            <div class="sec-lead">Harvest an existing Lovelace dashboard or view into a local zip for a coding agent. The zip contains <code>brief.md</code> and <code>manifest.json</code>; it does not create a grant.</div>
            ${this.dashboardExportSection()}
          </section>

        </div>
        ${this.revokeModal()}
        <div data-toast-host></div>
      </div>`;
    this.renderToast();
    this.wireEvents();
  }

  private wireEvents(): void {
    // copy authority id
    const copyAuth = this.querySelector<HTMLElement>('[data-copy-auth]');
    if (copyAuth) copyAuth.onclick = () => {
      this.copyText(this._lastState!.info.authority_id);
      this._authCopied = true;
      const act = copyAuth.querySelector<HTMLElement>('.act');
      if (act) act.textContent = 'COPIED';
      window.setTimeout(() => { this._authCopied = false; const a = copyAuth.querySelector<HTMLElement>('.act'); if (a) a.textContent = 'COPY'; }, 1500);
    };
    // anchor tabs
    this.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
      el.onclick = () => { this.querySelector(`#${el.dataset.anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    });
    // activity filter
    this.querySelectorAll<HTMLElement>('[data-activity-filter]').forEach((el) => {
      el.onclick = () => {
        this._activityFilter = el.dataset.activityFilter!;
        const card = this.querySelector('.audit-card');
        if (card) card.outerHTML = this.auditSection();
        // rewire filter buttons after replacement
        this.wireActivity();
      };
    });

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
        if (boxes.length > 0) {
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
          if (!customVal || Number.isNaN(new Date(customVal).getTime())) {
            const summary = this.querySelector<HTMLElement>(`[data-approve-summary="${CSS.escape(requestId)}"]`);
            if (summary) this.showFieldError(summary, 'Please set a date/time for the custom expiry.');
            return;
          }
          payload.expires_at = new Date(customVal).toISOString();
        } else if (expiry.value !== 'none') {
          payload.expires_at = new Date(Date.now() + Number(expiry.value)).toISOString();
        }
        const name = this._lastState?.requests.find((r) => r.request_id === requestId)?.manifest?.name || 'consumer';
        void this.call('varco/approve_request', payload).then(() => this.flash(`Access granted to ${name}`, 'ok'));
      };
    });
    this.querySelectorAll<HTMLElement>('[data-reject]').forEach((el) => {
      el.onclick = () => void this.call('varco/reject_request', { request_id: el.dataset.reject! }).then(() => this.flash('Request rejected', 'danger'));
    });

    // revoke -> modal; delete -> inline confirm
    this.querySelectorAll<HTMLElement>('[data-revoke]').forEach((el) => {
      el.onclick = () => { this._confirmRevoke = { grantId: el.dataset.revoke!, name: el.dataset.name || 'this consumer' }; this.render(this._lastState!); };
    });
    this.querySelectorAll<HTMLElement>('[data-delete-grant]').forEach((el) => {
      el.onclick = () => this.showInlineConfirm(el, {
        kind: 'delete',
        message: `Delete grant record for ${el.dataset.name}? This also removes active access for that consumer.`,
        confirmLabel: 'Delete grant record',
        onConfirm: () => void this.call('varco/delete_grant', { grant_id: el.dataset.deleteGrant! }).then(() => this.flash('Grant record deleted', 'warn')),
      });
    });
    // revoke modal actions
    this.querySelectorAll<HTMLElement>('[data-revoke-cancel]').forEach((el) => {
      el.onclick = (ev) => { if (ev.target !== el) return; this._confirmRevoke = null; this.render(this._lastState!); };
    });
    const revokeStop = this.querySelector<HTMLElement>('[data-revoke-stop]');
    if (revokeStop) revokeStop.onclick = (ev) => ev.stopPropagation();
    const revokeConfirm = this.querySelector<HTMLElement>('[data-revoke-confirm]');
    if (revokeConfirm && this._confirmRevoke) {
      const { grantId, name } = this._confirmRevoke;
      revokeConfirm.onclick = () => { this._confirmRevoke = null; void this.call('varco/revoke_grant', { grant_id: grantId }).then(() => this.flash(`Access revoked for ${name}`, 'danger')); };
    }

    // add-restriction type selector
    this.querySelectorAll<HTMLSelectElement>('[data-rf-type]').forEach((sel) => {
      sel.onchange = () => {
        const grantId = sel.dataset.rfType!;
        const fieldsEl = this.querySelector<HTMLElement>(`[data-rf-fields="${CSS.escape(grantId)}"]`);
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
    this.querySelectorAll<HTMLElement>('[data-grant-status]').forEach((el) => {
      el.onclick = () => {
        this._grantStatusFilter = el.dataset.grantStatus!;
        this.querySelectorAll<HTMLElement>('[data-grant-status]').forEach((b) => b.classList.toggle('sel', b.dataset.grantStatus === this._grantStatusFilter));
        this.applyGrantFilter();
      };
    });

    // entity share
    const shareEntity = this.querySelector<HTMLInputElement>('[data-share-entity]');
    if (shareEntity) {
      shareEntity.oninput = () => { this._shareEntityId = shareEntity.value; this.updateShareSuggestions(shareEntity); };
      shareEntity.onfocus = () => this.updateShareSuggestions(shareEntity);
    }
    const shareName = this.querySelector<HTMLInputElement>('[data-share-name]');
    if (shareName) shareName.oninput = () => { this._shareName = shareName.value; };
    const shareClaims = this.querySelector<HTMLInputElement>('[data-share-claims]');
    if (shareClaims) shareClaims.oninput = () => { this._shareClaims = shareClaims.value; };
    const createShare = this.querySelector<HTMLElement>('[data-create-entity-share]');
    if (createShare) createShare.onclick = () => void this.createEntityShare();
    const copyShare = this.querySelector<HTMLElement>('[data-copy-share-link]');
    if (copyShare) copyShare.onclick = () => { this.copyText(this._shareUrl); this.flash('Link copied', 'ok'); };

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

  // Rewire just the activity filter buttons after an in-place audit re-render.
  private wireActivity(): void {
    this.querySelectorAll<HTMLElement>('[data-activity-filter]').forEach((el) => {
      el.onclick = () => {
        this._activityFilter = el.dataset.activityFilter!;
        const card = this.querySelector('.audit-card');
        if (card) card.outerHTML = this.auditSection();
        this.wireActivity();
      };
    });
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
