// src/styles.ts
var styles = () => `
  <style>
    :host {
      display: block;
      --varco-radius: 14px;
      --varco-radius-sm: 10px;
      --varco-gap: 16px;
      --varco-accent: var(--primary-color, #03a9f4);
      --varco-ok: var(--success-color, #2e9b54);
      --varco-warn: var(--warning-color, #f4a712);
      --varco-danger: var(--error-color, #db4437);
      --varco-surface: var(--card-background-color, #fff);
      --varco-surface-2: var(--secondary-background-color, #f4f5f7);
      --varco-border: var(--divider-color, rgba(0,0,0,.12));
      --varco-text: var(--primary-text-color, #1c1c1c);
      --varco-muted: var(--secondary-text-color, #6b6f76);
    }

    .wrap { padding: 4px 4px 32px; color: var(--varco-text); }

    /* ---- typography ---- */
    .h-page { font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--varco-muted); margin: 28px 0 12px; display: flex; align-items: center; gap: 10px; }
    .h-page:first-child { margin-top: 8px; }
    .h-page .count { background: var(--varco-surface-2); border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 700; letter-spacing: .02em; color: var(--varco-muted); }
    .eyebrow { color: var(--varco-muted); font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
    .muted { color: var(--varco-muted); }
    .empty { color: var(--varco-muted); padding: 14px 2px; }

    /* ---- buttons ---- */
    button {
      font: inherit; font-weight: 650; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      border: 1px solid transparent; border-radius: 10px;
      padding: 9px 16px; background: var(--varco-accent); color: var(--text-primary-color, #fff);
      transition: filter .12s ease, background .12s ease, border-color .12s ease, transform .04s ease;
    }
    button svg { width: 16px; height: 16px; flex: none; }
    button:hover { filter: brightness(1.06); }
    button:active { transform: translateY(1px); }
    button[disabled] { opacity: .45; cursor: not-allowed; filter: none; transform: none; }
    button.ghost { background: transparent; color: var(--varco-text); border-color: var(--varco-border); }
    button.ghost:hover { background: var(--varco-surface-2); filter: none; }
    button.subtle { background: var(--varco-surface-2); color: var(--varco-text); border-color: var(--varco-border); }
    button.subtle:hover { filter: none; background: var(--varco-border); }
    button.danger { background: transparent; color: var(--varco-danger); border-color: color-mix(in srgb, var(--varco-danger) 45%, transparent); }
    button.danger:hover { background: color-mix(in srgb, var(--varco-danger) 12%, transparent); filter: none; }
    button.tiny { padding: 5px 11px; font-size: 12px; border-radius: 8px; }
    .btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }

    /* ---- inputs ---- */
    input, select, textarea {
      font: inherit; color: var(--varco-text); background: var(--varco-surface);
      border: 1px solid var(--varco-border); border-radius: 10px; padding: 9px 11px; width: 100%;
      box-sizing: border-box;
    }
    input:focus, select:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--varco-accent) 55%, transparent); outline-offset: 1px; border-color: var(--varco-accent); }
    label.field { display: block; font-size: 12px; font-weight: 700; color: var(--varco-muted); margin: 14px 0 5px; }
    code { background: var(--varco-surface-2); padding: 2px 6px; border-radius: 6px; font-size: .92em; word-break: break-all; }

    /* ---- cards ---- */
    .card { background: var(--varco-surface); border: 1px solid var(--varco-border); border-radius: var(--varco-radius); padding: 18px; margin: 12px 0; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .card.flush { padding: 0; overflow: hidden; }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .card-title { margin: 4px 0 0; font-size: 17px; font-weight: 750; }

    /* ---- pills ---- */
    .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; padding: 5px 11px; white-space: nowrap; }
    .pill.ok { background: color-mix(in srgb, var(--varco-ok) 16%, transparent); color: var(--varco-ok); }
    .pill.warn { background: color-mix(in srgb, var(--varco-warn) 20%, transparent); color: color-mix(in srgb, var(--varco-warn) 78%, #000); }
    .pill.off { background: var(--varco-surface-2); color: var(--varco-muted); }
    .pill.danger { background: color-mix(in srgb, var(--varco-danger) 16%, transparent); color: var(--varco-danger); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

    /* ---- key/value meta ---- */
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px 18px; margin: 16px 0 4px; }
    .meta .k { color: var(--varco-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; margin-bottom: 3px; }
    .meta .v { font-weight: 600; }
    details.tech { margin-top: 14px; border-top: 1px dashed var(--varco-border); padding-top: 10px; }
    details.tech summary { cursor: pointer; color: var(--varco-muted); font-size: 12px; font-weight: 700; }
    details.tech .meta { margin-top: 12px; }

    /* ---- relay / authority header ---- */
    .topbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; margin-bottom: 8px; }
    .topbar .card { flex: 1 1 280px; margin: 0; }
    .relay-line { display: flex; align-items: center; gap: 10px; }
    .relay-guidance { margin-top: 12px; }

    /* ---- callouts ---- */
    .callout { border-radius: var(--varco-radius-sm); padding: 12px 14px; margin: 12px 0; font-size: 14px; background: var(--varco-surface-2); }
    .callout.warn { background: color-mix(in srgb, var(--varco-warn) 14%, transparent); border: 1px solid color-mix(in srgb, var(--varco-warn) 35%, transparent); }
    .callout.danger { background: color-mix(in srgb, var(--varco-danger) 10%, transparent); border: 1px solid color-mix(in srgb, var(--varco-danger) 35%, transparent); }

    /* ---- pending request / wizard ---- */
    .req { border: 1px solid var(--varco-border); border-left: 4px solid var(--varco-accent); border-radius: var(--varco-radius); background: var(--varco-surface); margin: 12px 0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .req-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; background: color-mix(in srgb, var(--varco-accent) 6%, var(--varco-surface)); }
    .req-id { display: flex; align-items: center; gap: 12px; }
    .req-avatar { width: 42px; height: 42px; border-radius: 12px; background: color-mix(in srgb, var(--varco-accent) 18%, transparent); color: var(--varco-accent); display: grid; place-items: center; font-weight: 800; font-size: 18px; flex: none; }
    .req-name { font-size: 17px; font-weight: 750; line-height: 1.2; }
    .req-sub { color: var(--varco-muted); font-size: 13px; margin-top: 2px; }
    .pair { text-align: right; }
    .pair .lab { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--varco-muted); }
    .pair .code { font-size: 22px; font-weight: 850; letter-spacing: .14em; font-variant-numeric: tabular-nums; }

    /* stepper */
    .steps { display: flex; align-items: center; gap: 0; padding: 14px 18px 0; }
    .step { display: flex; align-items: center; gap: 9px; color: var(--varco-muted); font-size: 13px; font-weight: 700; }
    .step .num { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; background: var(--varco-surface-2); color: var(--varco-muted); border: 1px solid var(--varco-border); flex: none; }
    .step.active { color: var(--varco-text); }
    .step.active .num { background: var(--varco-accent); color: #fff; border-color: transparent; }
    .step.done .num { background: color-mix(in srgb, var(--varco-ok) 20%, transparent); color: var(--varco-ok); border-color: transparent; }
    .step-bar { flex: 1; height: 2px; background: var(--varco-border); margin: 0 12px; border-radius: 2px; min-width: 16px; }
    .step-bar.done { background: var(--varco-ok); }

    .req-body { padding: 8px 18px 18px; }
    .panes > .pane { display: none; }
    .panes > .pane.show { display: block; animation: fade .18s ease; }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

    .lead { font-size: 15px; line-height: 1.5; margin: 14px 0; }
    .lead strong { font-weight: 750; }

    /* permission groups */
    .perm-group { border: 1px solid var(--varco-border); border-radius: var(--varco-radius-sm); margin: 10px 0; overflow: hidden; }
    .perm-head { display: flex; align-items: center; gap: 12px; padding: 11px 14px; background: var(--varco-surface-2); }
    .perm-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--varco-surface); border: 1px solid var(--varco-border); }
    .perm-ico svg { width: 17px; height: 17px; }
    .perm-meta { flex: 1; min-width: 0; }
    .perm-title { display: block; font-weight: 700; font-size: 14px; }
    .perm-desc { display: block; color: var(--varco-muted); font-size: 12px; margin-top: 1px; }
    .perm-count { font-size: 12px; font-weight: 700; color: var(--varco-muted); }
    .perm-items { list-style: none; margin: 0; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
    .perm-items li { margin: 0; }
    .perm-items label { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
    .perm-items label:hover { background: var(--varco-surface-2); }
    .perm-items input { width: auto; }
    .perm-empty { padding: 10px 14px; color: var(--varco-muted); font-size: 13px; }
    .perm-actions { display: flex; gap: 14px; margin: 4px 2px 0; }
    .perm-actions a { color: var(--varco-accent); font-size: 12px; font-weight: 700; cursor: pointer; }

    /* duration chips */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .chip { border: 1px solid var(--varco-border); background: var(--varco-surface); border-radius: 999px; padding: 8px 16px; font-size: 13px; font-weight: 650; cursor: pointer; color: var(--varco-text); }
    .chip:hover { background: var(--varco-surface-2); }
    .chip.sel { background: var(--varco-accent); color: #fff; border-color: transparent; }
    .summary-box { background: var(--varco-surface-2); border-radius: var(--varco-radius-sm); padding: 14px 16px; margin: 14px 0; font-size: 14px; line-height: 1.55; }
    .summary-box b { font-weight: 750; }

    .nav-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 18px; }
    .nav-row .left, .nav-row .right { display: flex; gap: 8px; }

    /* ---- grants ---- */
    .controls { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 14px; }
    .controls .search { flex: 1 1 240px; min-width: 180px; position: relative; }
    .controls .search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--varco-muted); pointer-events: none; }
    .controls .search input { padding-left: 36px; }
    .controls select { max-width: 200px; }

    .grant { border: 1px solid var(--varco-border); border-radius: var(--varco-radius); background: var(--varco-surface); margin: 12px 0; box-shadow: 0 1px 2px rgba(0,0,0,.04); overflow: hidden; }
    .grant.revoked, .grant.expired { opacity: .82; }
    .grant.revoked { border-left: 4px solid var(--varco-muted); }
    .grant.expired { border-left: 4px solid var(--varco-warn); }
    .grant.active { border-left: 4px solid var(--varco-ok); }
    .grant-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 18px; }
    .grant-head .l { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .grant-avatar { width: 38px; height: 38px; border-radius: 11px; background: var(--varco-surface-2); display: grid; place-items: center; font-weight: 800; flex: none; }
    .grant-name { font-weight: 750; font-size: 16px; }
    .grant-sub { color: var(--varco-muted); font-size: 12px; margin-top: 1px; }
    .grant-body { padding: 0 18px 16px; }

    .sec { border-top: 1px solid var(--varco-border); }
    .sec > summary { cursor: pointer; font-weight: 700; font-size: 14px; padding: 13px 18px; list-style: none; display: flex; align-items: center; gap: 8px; }
    .sec > summary::-webkit-details-marker { display: none; }
    .sec > summary::before { content: '\u203A'; font-size: 18px; color: var(--varco-muted); transition: transform .15s ease; display: inline-block; }
    .sec[open] > summary::before { transform: rotate(90deg); }
    .sec .sec-inner { padding: 0 18px 16px; }
    .sec .count-tag { color: var(--varco-muted); font-weight: 600; }

    .scope-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .scope-box { border: 1px solid var(--varco-border); border-radius: var(--varco-radius-sm); padding: 11px 13px; }
    .scope-box .t { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
    .scope-box ul { margin: 0; padding-left: 16px; }
    .scope-box li { margin: 3px 0; font-size: 13px; }

    /* restrictions */
    .rest { display: flex; flex-direction: column; gap: 8px; }
    .rest-row { background: var(--varco-surface-2); border-radius: var(--varco-radius-sm); padding: 10px 12px; }
    .rest-row.disabled { opacity: .6; }
    .rest-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .rest-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
    .rest-badge { background: color-mix(in srgb, var(--varco-accent) 16%, transparent); color: var(--varco-accent); border-radius: 6px; font-size: 11px; font-weight: 800; padding: 3px 8px; text-transform: uppercase; }
    .rest-info small { color: var(--varco-muted); }
    .rest-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .rest-tag { color: var(--varco-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .rest-edit { border-top: 1px solid var(--varco-border); margin-top: 10px; padding-top: 10px; }
    .rest-add { border: 1px dashed var(--varco-border); border-radius: var(--varco-radius-sm); margin-top: 12px; padding: 14px; }
    .chk-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .chk-row label { display: inline-flex; align-items: center; gap: 6px; width: auto; }
    .chk-row input { width: auto; }

    /* inline confirm */
    .confirm { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; width: 100%; padding: 12px 14px; border-radius: var(--varco-radius-sm); background: color-mix(in srgb, var(--varco-danger) 8%, transparent); border: 1px solid color-mix(in srgb, var(--varco-danger) 30%, transparent); }
    .confirm .msg { flex: 1 1 220px; font-size: 14px; }
    .confirm .acts { display: flex; gap: 8px; }

    /* audit */
    .audit-list { display: flex; flex-direction: column; gap: 4px; max-height: 460px; overflow: auto; }
    .grant-activity .audit-list { max-height: 320px; margin-top: 4px; }
    .audit-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px 12px; background: var(--varco-surface-2); border-radius: 9px; padding: 9px 12px; }
    .audit-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none; background: var(--varco-surface); border: 1px solid var(--varco-border); }
    .audit-ico svg { width: 14px; height: 14px; }
    .audit-mid { min-width: 0; }
    .audit-type { font-weight: 700; font-size: 13px; }
    .audit-detail { color: var(--varco-muted); font-size: 12px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; }
    .audit-meta { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .audit-ts { color: var(--varco-muted); font-size: 11px; white-space: nowrap; }
    .audit-grant { font-size: 10px; }
    .audit-row.kind-danger .audit-ico { background: color-mix(in srgb, var(--varco-danger) 12%, transparent); color: var(--varco-danger); border-color: transparent; }
    .audit-row.kind-warn .audit-ico { background: color-mix(in srgb, var(--varco-warn) 16%, transparent); color: color-mix(in srgb, var(--varco-warn) 80%, #000); border-color: transparent; }
    .audit-row.kind-ok .audit-ico { background: color-mix(in srgb, var(--varco-ok) 14%, transparent); color: var(--varco-ok); border-color: transparent; }

    /* export */
    .entity-list { border: 1px solid var(--varco-border); border-radius: var(--varco-radius-sm); max-height: 360px; overflow: auto; padding: 4px; margin-top: 10px; }
    .entity-group + .entity-group { border-top: 1px solid var(--varco-border); }
    .entity-group-title { color: var(--varco-muted); font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 8px 8px 4px; }
    .entity-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 8px; }
    .entity-row:hover { background: var(--varco-surface-2); }
    .entity-row input { width: auto; margin-top: 2px; }
    .entity-row small { color: var(--varco-muted); display: block; margin-top: 2px; }
    .export-summary { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: var(--varco-surface-2); border-radius: var(--varco-radius-sm); padding: 12px 14px; margin: 12px 0; font-size: 14px; }
  </style>`;

// src/icons.ts
var svg = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
var icons = {
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  live: svg('<path d="M5 12a7 7 0 0 1 7-7"/><path d="M5 12a7 7 0 0 0 7 7"/><circle cx="12" cy="12" r="2"/>'),
  history: svg('<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/>'),
  camera: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>'),
  bolt: svg('<path d="M13 2 3 14h7l-1 8 10-12h-7Z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>'),
  alert: svg('<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'),
  plug: svg('<path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0Z"/><path d="M12 17v5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  trash: svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'),
  ban: svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  dot: svg('<circle cx="12" cy="12" r="4"/>')
};

// src/panel.ts
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var SCOPE_DEFS = [
  { key: "read_entities", title: "Read entity states", desc: "See the current value of these entities", icon: "eye" },
  { key: "subscriptions", title: "Live updates", desc: "Get notified when these entities change", icon: "live" },
  { key: "history", title: "Query history", desc: "Read past values of these entities", icon: "history" },
  { key: "camera_snapshots", title: "Camera snapshots", desc: "Capture still images from these cameras", icon: "camera" },
  { key: "actions", title: "Control actions", desc: "Call these Home Assistant services", icon: "bolt" }
];
var VarcoPanel = class extends HTMLElement {
  _hass;
  _loaded = false;
  _lastState;
  _refreshTimer;
  _pendingSignature = "";
  _grantSearch = "";
  _grantStatusFilter = "all";
  // wizard step per request id
  _step = {};
  // dashboard export state
  _dashboards = [];
  _dashboardError = "";
  _exportError = "";
  _exportLoading = false;
  _exportConfig = null;
  _exportResult = null;
  _selectedDashboardIndex;
  _selectedViewIndex = "";
  _selectedEntities = /* @__PURE__ */ new Set();
  _crcTable;
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) void this.load();
  }
  connectedCallback() {
    this.render({ loading: true });
    this.addEventListener("click", this._onDelegatedClick);
    if (!this._refreshTimer) {
      const interval = Number(this.dataset.pollInterval) || 8e3;
      this._refreshTimer = window.setInterval(() => void this.refreshPending(), interval);
    }
  }
  disconnectedCallback() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = void 0;
    }
  }
  // Delegated handler for the dynamically-injected "Save restriction" button.
  _onDelegatedClick = async (ev) => {
    const target = ev.target;
    const saveBtn = target.closest("[data-rf-save]");
    if (saveBtn) {
      const grantId = saveBtn.dataset.rfSave;
      const newR = this.buildNewRestriction(grantId);
      if (!newR) return;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving\u2026";
      const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
      const existing = Array.isArray(grant?.restrictions) ? grant.restrictions : [];
      await this._hass.connection.sendMessagePromise({ type: "varco/update_grant_restrictions", grant_id: grantId, restrictions: [...existing, newR] });
      this._loaded = false;
      await this.load();
    }
  };
  async refreshPending() {
    if (!this._hass || !this._loaded) return;
    try {
      const requests = await this._hass.connection.sendMessagePromise({ type: "varco/access_requests" });
      const signature = requests.filter((r) => r.status === "pending").map((r) => r.request_id).sort().join(",");
      if (signature !== this._pendingSignature) {
        this._loaded = false;
        await this.load();
      }
    } catch {
    }
  }
  async load() {
    if (!this._hass) return;
    this._loaded = true;
    const [info, requests, grants, audit] = await Promise.all([
      this._hass.connection.sendMessagePromise({ type: "varco/info" }),
      this._hass.connection.sendMessagePromise({ type: "varco/access_requests" }),
      this._hass.connection.sendMessagePromise({ type: "varco/grants" }),
      this._hass.connection.sendMessagePromise({ type: "varco/audit" }).catch(() => [])
    ]);
    await this.loadDashboards();
    this._pendingSignature = requests.filter((r) => r.status === "pending").map((r) => r.request_id).sort().join(",");
    this.render({ info, requests, grants, audit });
  }
  async loadDashboards() {
    try {
      const dashboards = await this._hass.connection.sendMessagePromise({ type: "lovelace/dashboards/list" });
      this._dashboards = [
        { title: "Overview", url_path: null, mode: "default" },
        ...dashboards.map((d) => ({ title: d.title || d.url_path || "Dashboard", url_path: d.url_path, mode: d.mode || "storage" }))
      ];
      this._dashboardError = "";
    } catch (err) {
      this._dashboards = [{ title: "Overview", url_path: null, mode: "default" }];
      this._dashboardError = `Could not list dashboards: ${err.message || err}`;
    }
  }
  async call(type, payload) {
    await this._hass.connection.sendMessagePromise({ type, ...payload });
    this._loaded = false;
    await this.load();
  }
  // ---------- helpers ----------
  escape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  }
  manifestName(item) {
    return item?.manifest?.name || "Unknown consumer";
  }
  manifestVersion(item) {
    return item?.manifest?.version || "not declared";
  }
  initials(name) {
    const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  readScopes(manifest, key) {
    const value = manifest?.[key];
    return Array.isArray(value) ? value.map((v) => String(v)) : [];
  }
  scopes(manifest) {
    return {
      read_entities: this.readScopes(manifest, "read_entities"),
      subscriptions: this.readScopes(manifest, "subscriptions"),
      history: this.readScopes(manifest, "history"),
      camera_snapshots: this.readScopes(manifest, "camera_snapshots"),
      actions: this.readScopes(manifest, "actions")
    };
  }
  // Plain-language one-liner summarising what a consumer is asking for.
  plainSummary(manifest) {
    const s = this.scopes(manifest);
    const bits = [];
    const n = (arr, one, many) => `${arr.length} ${arr.length === 1 ? one : many}`;
    if (s.read_entities.length) bits.push(`read ${n(s.read_entities, "entity", "entities")}`);
    if (s.subscriptions.length) bits.push(`watch ${n(s.subscriptions, "entity", "entities")} live`);
    if (s.history.length) bits.push(`see history for ${n(s.history, "entity", "entities")}`);
    if (s.camera_snapshots.length) bits.push(`snapshot ${n(s.camera_snapshots, "camera", "cameras")}`);
    if (s.actions.length) bits.push(`control ${n(s.actions, "action", "actions")}`);
    if (!bits.length) return "no permissions";
    if (bits.length === 1) return bits[0];
    return `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
  }
  scopeSummary(manifest) {
    const s = this.scopes(manifest);
    return `${s.read_entities.length} read, ${s.subscriptions.length} live, ${s.history.length} history, ${s.camera_snapshots.length} cameras, ${s.actions.length} actions`;
  }
  shortKey(value) {
    const text = String(value || "");
    if (text.length <= 24) return text || "unknown";
    return `${text.slice(0, 12)}...${text.slice(-8)}`;
  }
  formatDate(value) {
    if (!value) return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }
  toLocalInput(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  // ---------- pending request wizard ----------
  requestCard(request) {
    const id = request.request_id;
    const name = this.manifestName(request);
    const step = this._step[id] || 1;
    const stepLabel = ["Confirm", "Permissions", "Duration"];
    const stepper = stepLabel.map((label, i) => {
      const n = i + 1;
      const cls = step === n ? "active" : step > n ? "done" : "";
      const bar = i < stepLabel.length - 1 ? `<div class="step-bar ${step > n ? "done" : ""}"></div>` : "";
      return `<div class="step ${cls}"><span class="num">${step > n ? icons.check : n}</span><span class="step-text">${label}</span></div>${bar}`;
    }).join("");
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
  stepConfirm(request) {
    const id = request.request_id;
    const name = this.manifestName(request);
    const show = (this._step[id] || 1) === 1 ? "show" : "";
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
  stepPermissions(request) {
    const id = request.request_id;
    const show = (this._step[id] || 1) === 2 ? "show" : "";
    const scopes = this.scopes(request.manifest);
    const groups = SCOPE_DEFS.map((def) => {
      const values = scopes[def.key];
      const items = values.length ? `<ul class="perm-items">${values.map(
        (value) => `<li><label><input type="checkbox" checked data-scope-request="${this.escape(id)}" data-scope-key="${this.escape(def.key)}" value="${this.escape(value)}"> <code>${this.escape(value)}</code></label></li>`
      ).join("")}</ul>` : '<div class="perm-empty">None requested</div>';
      return `
        <div class="perm-group">
          <div class="perm-head">
            <span class="perm-ico">${icons[def.icon]}</span>
            <span class="perm-meta"><span class="perm-title">${this.escape(def.title)}</span><span class="perm-desc">${this.escape(def.desc)}</span></span>
            <span class="perm-count">${values.length}</span>
          </div>
          ${items}
        </div>`;
    }).join("");
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
  stepDuration(request) {
    const id = request.request_id;
    const show = (this._step[id] || 1) === 3 ? "show" : "";
    const presets = [
      { value: "none", label: "No expiry" },
      { value: "3600000", label: "1 hour" },
      { value: "86400000", label: "24 hours" },
      { value: "604800000", label: "7 days" },
      { value: "custom", label: "Custom" }
    ];
    const chips = presets.map((p) => `<button type="button" class="chip ${p.value === "none" ? "sel" : ""}" data-expiry-chip="${this.escape(id)}" data-expiry-value="${p.value}">${this.escape(p.label)}</button>`).join("");
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
  isGrantExpired(grant) {
    if (!grant.expires_at || grant.revoked) return false;
    const expires = new Date(grant.expires_at);
    if (Number.isNaN(expires.getTime())) return false;
    return Date.now() >= expires.getTime();
  }
  grantStatus(grant) {
    if (grant.revoked) return "revoked";
    if (this.isGrantExpired(grant)) return "expired";
    return "active";
  }
  statusPill(status) {
    const map = {
      active: { cls: "ok", label: "active" },
      expired: { cls: "warn", label: "expired" },
      revoked: { cls: "off", label: "revoked" }
    };
    const v = map[status] || map.active;
    return `<span class="pill ${v.cls}"><span class="dot"></span>${v.label}</span>`;
  }
  grantCard(grant) {
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
              <div class="grant-sub">${this.escape(this.plainSummary(grant.manifest))}${restrictions.length ? ` &middot; ${activeRestrictions}/${restrictions.length} restrictions active` : ""}</div>
            </div>
          </div>
          ${this.statusPill(status)}
        </div>
        <div class="grant-body">
          <div class="meta">
            <div><div class="k">Version</div><div class="v">${this.escape(this.manifestVersion(grant))}</div></div>
            <div><div class="k">Created</div><div class="v">${this.escape(this.formatDate(grant.created_at))}</div></div>
            <div><div class="k">Last used</div><div class="v">${grant.last_used_at ? this.escape(this.formatDate(grant.last_used_at)) : "never"}</div></div>
            ${grant.expires_at ? `<div><div class="k">Expires</div><div class="v">${this.escape(this.formatDate(grant.expires_at))}</div></div>` : ""}
            ${grant.revoked ? `<div><div class="k">Revoked</div><div class="v">${this.escape(this.formatDate(grant.revoked_at))}</div></div>` : ""}
          </div>
        </div>
        <details class="sec">
          <summary>Permissions <span class="count-tag">&middot; ${this.escape(this.scopeSummary(grant.manifest))}</span></summary>
          <div class="sec-inner">
            <div class="scope-grid">
              ${SCOPE_DEFS.map((def) => this.scopeBox(def.title, s[def.key])).join("")}
            </div>
          </div>
        </details>
        ${grant.revoked ? "" : this.restrictionsSection(grant.grant_id, restrictions)}
        ${this.grantActivity(grant.grant_id)}
        <div class="grant-body">
          <div class="btn-row" style="margin-top:6px">
            ${grant.revoked ? "" : `<button class="danger" data-revoke="${this.escape(grant.grant_id)}">${icons.ban} Revoke access</button>`}
            <button class="danger" data-delete-grant="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">${icons.trash} Delete record</button>
          </div>
        </div>
      </div>`;
  }
  scopeBox(title, values) {
    return `
      <div class="scope-box">
        <div class="t">${this.escape(title)}</div>
        ${values.length ? `<ul>${values.map((v) => `<li><code>${this.escape(v)}</code></li>`).join("")}</ul>` : '<div class="muted">None</div>'}
      </div>`;
  }
  restrictionsSection(grantId, restrictions) {
    const rows = restrictions.length ? `<div class="rest">${restrictions.map((r, i) => this.restrictionRow(r, i, grantId)).join("")}</div>` : '<p class="muted" style="margin:4px 0">No restrictions. Access follows the granted permissions at all times.</p>';
    return `
      <details class="sec restriction-section">
        <summary>Restrictions <span class="count-tag">&middot; ${restrictions.length}</span></summary>
        <div class="sec-inner">
          ${rows}
          <div class="rest-add" data-rf-fields-wrap="${this.escape(grantId)}">
            <label class="field" style="margin-top:0">Add a restriction</label>
            <select data-rf-type="${this.escape(grantId)}">
              <option value="">Choose type\u2026</option>
              <option value="expiry">Expiry \u2014 deny after a date/time</option>
              <option value="schedule">Schedule \u2014 allow only in a time window</option>
              <option value="pin">PIN \u2014 require a code to act</option>
              <option value="rate_limit">Rate limit \u2014 max N calls per window</option>
              <option value="template">Template \u2014 allow only when a HA template is true</option>
            </select>
            <div data-rf-fields="${this.escape(grantId)}"></div>
          </div>
        </div>
      </details>`;
  }
  restrictionRow(r, index, grantId) {
    const type = String(r.type || "");
    const appliesTo = String(r.applies_to || "grant");
    const params = r.params || {};
    const enabled = r.enabled !== false;
    const id = this.escape(grantId);
    let detail = "";
    if (type === "expiry") detail = `deny after ${this.escape(String(params.expires_at || "?"))}`;
    if (type === "schedule") detail = `${this.escape((params.days || []).join(", "))} ${this.escape(String(params.start_time || ""))}\u2013${this.escape(String(params.end_time || ""))}`;
    if (type === "pin") detail = "PIN set";
    if (type === "rate_limit") detail = `max ${this.escape(String(params.limit || "?"))} per ${this.escape(String(params.window_seconds || "?"))} s`;
    if (type === "template") detail = this.escape(String(params.value_template || ""));
    return `
      <div class="rest-row ${enabled ? "" : "disabled"}">
        <div class="rest-main">
          <div class="rest-info">
            <span class="rest-badge">${this.escape(type)}</span>
            <code>${this.escape(appliesTo)}</code>
            <small>${detail}</small>
            ${enabled ? "" : '<span class="rest-tag">disabled</span>'}
          </div>
          <div class="rest-actions">
            <button class="subtle tiny" data-toggle-restriction="${id}" data-restriction-index="${index}">${enabled ? "Disable" : "Enable"}</button>
            <button class="subtle tiny" data-edit-restriction="${id}" data-restriction-index="${index}">Edit</button>
            <button class="danger tiny" data-remove-restriction="${id}" data-restriction-index="${index}">Remove</button>
          </div>
        </div>
        <div class="rest-edit" data-restriction-edit="${id}" data-restriction-index="${index}" hidden></div>
      </div>`;
  }
  inputStyle = "max-width:420px";
  restrictionTypeFields(type) {
    const applies = `<label class="field">Applies to <small class="muted">(grant / actions / read / history / camera / domain.service@entity_id)</small></label>
      <input type="text" data-rf-applies placeholder="grant" value="grant" style="${this.inputStyle}">`;
    if (type === "expiry") return applies + `<label class="field">Deny after</label><input type="datetime-local" data-rf-expires style="${this.inputStyle}">`;
    if (type === "schedule") return applies + `<label class="field">Allowed days</label><div class="chk-row" style="margin-bottom:10px">${DAYS.map((d) => `<label><input type="checkbox" data-rf-day="${d}" checked> ${d}</label>`).join("")}</div><div class="chk-row"><label class="field" style="margin:0">From <input type="time" data-rf-start value="08:00" style="width:auto"></label><label class="field" style="margin:0">Until <input type="time" data-rf-end value="22:00" style="width:auto"></label></div>`;
    if (type === "pin") return applies + `<label class="field">PIN <small class="muted">(set by you, never stored as plaintext)</small></label><input type="password" data-rf-pin placeholder="Enter PIN" autocomplete="new-password" style="max-width:280px">`;
    if (type === "rate_limit") return applies + `<div class="chk-row" style="margin-top:10px"><label class="field" style="margin:0">Max calls <input type="number" data-rf-limit min="1" value="10" style="width:80px"></label><label class="field" style="margin:0">per <input type="number" data-rf-window min="1" value="3600" style="width:90px"> seconds</label></div>`;
    if (type === "template") return applies + `<label class="field">Condition template <small class="muted">(Jinja2; falsy or error denies)</small></label><textarea data-rf-template rows="3" placeholder="{{ is_state('alarm_control_panel.home_alarm', 'disarmed') }}" style="${this.inputStyle};font-family:monospace"></textarea>`;
    return "";
  }
  restrictionEditFields(r) {
    const type = String(r.type || "");
    const params = r.params || {};
    const applies = `<label class="field" style="margin-top:0">Applies to</label><input type="text" data-re-applies value="${this.escape(String(r.applies_to || "grant"))}" style="${this.inputStyle}">`;
    if (type === "expiry") return applies + `<label class="field">Deny after</label><input type="datetime-local" data-re-expires value="${this.escape(this.toLocalInput(params.expires_at))}" style="${this.inputStyle}">`;
    if (type === "schedule") {
      const days = Array.isArray(params.days) ? params.days : [];
      return applies + `<label class="field">Allowed days</label><div class="chk-row" style="margin-bottom:10px">${DAYS.map((d) => `<label><input type="checkbox" data-re-day="${d}" ${days.includes(d) ? "checked" : ""}> ${d}</label>`).join("")}</div><div class="chk-row"><label class="field" style="margin:0">From <input type="time" data-re-start value="${this.escape(String(params.start_time || "08:00"))}" style="width:auto"></label><label class="field" style="margin:0">Until <input type="time" data-re-end value="${this.escape(String(params.end_time || "22:00"))}" style="width:auto"></label></div>`;
    }
    if (type === "pin") return applies + `<label class="field">New PIN <small class="muted">(leave blank to keep current)</small></label><input type="password" data-re-pin placeholder="Leave blank to keep current" autocomplete="new-password" style="max-width:280px">`;
    if (type === "rate_limit") return applies + `<div class="chk-row" style="margin-top:10px"><label class="field" style="margin:0">Max calls <input type="number" data-re-limit min="1" value="${this.escape(String(params.limit ?? 10))}" style="width:80px"></label><label class="field" style="margin:0">per <input type="number" data-re-window min="1" value="${this.escape(String(params.window_seconds ?? 3600))}" style="width:90px"> seconds</label></div>`;
    if (type === "template") return applies + `<label class="field">Condition template</label><textarea data-re-template rows="3" style="${this.inputStyle};font-family:monospace">${this.escape(String(params.value_template || ""))}</textarea>`;
    return applies;
  }
  buildEditedRestriction(grantId, index, editEl) {
    const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
    const original = grant?.restrictions?.[index];
    if (!original) return null;
    const type = String(original.type || "");
    const appliesTo = (editEl.querySelector("[data-re-applies]")?.value || "grant").trim();
    const params = { ...original.params || {} };
    if (type === "expiry") {
      const raw = editEl.querySelector("[data-re-expires]")?.value;
      if (!raw) {
        this.showFieldError(editEl, "Please set a date/time for the expiry.");
        return null;
      }
      params.expires_at = new Date(raw).toISOString();
    } else if (type === "schedule") {
      params.days = DAYS.filter((d) => editEl.querySelector(`[data-re-day="${d}"]`)?.checked);
      params.start_time = editEl.querySelector("[data-re-start]")?.value || "00:00";
      params.end_time = editEl.querySelector("[data-re-end]")?.value || "23:59";
    } else if (type === "pin") {
      const pin = editEl.querySelector("[data-re-pin]")?.value;
      if (pin) params.pin = pin;
    } else if (type === "rate_limit") {
      params.limit = Number(editEl.querySelector("[data-re-limit]")?.value || 10);
      params.window_seconds = Number(editEl.querySelector("[data-re-window]")?.value || 3600);
    } else if (type === "template") {
      const valueTemplate = (editEl.querySelector("[data-re-template]")?.value || "").trim();
      if (!valueTemplate) {
        this.showFieldError(editEl, "Please enter a condition template.");
        return null;
      }
      params.value_template = valueTemplate;
    }
    return { ...original, applies_to: appliesTo, params };
  }
  buildNewRestriction(grantId) {
    const container = this.querySelector(`[data-rf-fields="${grantId}"]`);
    if (!container) return null;
    const type = this.querySelector(`[data-rf-type="${grantId}"]`)?.value;
    if (!type) return null;
    const appliesTo = (container.querySelector("[data-rf-applies]")?.value || "grant").trim();
    const id = `${type}-${Date.now()}`;
    if (type === "expiry") {
      const raw = container.querySelector("[data-rf-expires]")?.value;
      if (!raw) {
        this.showFieldError(container, "Please set a date/time for the expiry.");
        return null;
      }
      return { id, type, enabled: true, applies_to: appliesTo, params: { expires_at: new Date(raw).toISOString() } };
    }
    if (type === "schedule") {
      const days = DAYS.filter((d) => container.querySelector(`[data-rf-day="${d}"]`)?.checked);
      const start = container.querySelector("[data-rf-start]")?.value || "00:00";
      const end = container.querySelector("[data-rf-end]")?.value || "23:59";
      return { id, type, enabled: true, applies_to: appliesTo, params: { days, start_time: start, end_time: end } };
    }
    if (type === "pin") {
      const pin = container.querySelector("[data-rf-pin]")?.value;
      if (!pin) {
        this.showFieldError(container, "Please enter a PIN.");
        return null;
      }
      return { id, type, enabled: true, applies_to: appliesTo, pin };
    }
    if (type === "rate_limit") {
      const limit = Number(container.querySelector("[data-rf-limit]")?.value || 10);
      const window_ = Number(container.querySelector("[data-rf-window]")?.value || 3600);
      return { id, type, enabled: true, applies_to: appliesTo, params: { limit, window_seconds: window_ } };
    }
    if (type === "template") {
      const valueTemplate = (container.querySelector("[data-rf-template]")?.value || "").trim();
      if (!valueTemplate) {
        this.showFieldError(container, "Please enter a condition template.");
        return null;
      }
      return { id, type, enabled: true, applies_to: appliesTo, params: { value_template: valueTemplate } };
    }
    return null;
  }
  showFieldError(container, message) {
    if (!container) return;
    let note = container.querySelector("[data-rf-error]");
    if (!note) {
      note = document.createElement("p");
      note.className = "callout danger";
      note.setAttribute("data-rf-error", "");
      container.appendChild(note);
    }
    note.textContent = message;
  }
  // ---------- audit ----------
  auditEventLabel(event) {
    const labels = {
      access_request_received: "Access request received",
      access_request_approved: "Access request approved",
      access_request_rejected: "Access request rejected",
      grant_revoked: "Grant revoked",
      grant_deleted: "Grant deleted",
      grant_restrictions_updated: "Restrictions updated",
      consumer_connected: "Consumer connected",
      call_service: "Service called",
      permission_error: "Permission denied",
      rate_limited: "Rate limited",
      restriction_denied: "Restriction denied",
      history_query_limited: "History query limited",
      session_error: "Session error",
      webrtc_fallback: "WebRTC fallback to relay",
      webrtc_answer: "WebRTC negotiated"
    };
    return labels[event] || String(event || "event");
  }
  auditKind(event) {
    if (["permission_error", "session_error", "grant_revoked", "grant_deleted", "restriction_denied"].includes(event)) return { cls: "kind-danger", icon: "alert" };
    if (["rate_limited", "history_query_limited", "access_request_rejected"].includes(event)) return { cls: "kind-warn", icon: "alert" };
    if (["access_request_approved", "consumer_connected"].includes(event)) return { cls: "kind-ok", icon: "check" };
    return { cls: "", icon: "dot" };
  }
  auditDetailSummary(details) {
    if (!details || typeof details !== "object") return "";
    const safeKeys = ["domain", "service", "operation", "entity_count", "denied_count", "reason", "manifest_name", "restriction_count", "restriction_id"];
    const parts = [];
    safeKeys.forEach((key) => {
      const v = details[key];
      if (v !== void 0 && v !== null && v !== "") parts.push(`${key}: ${this.escape(String(v))}`);
    });
    return parts.join(" \xB7 ");
  }
  auditRow(event) {
    const detail = this.auditDetailSummary(event.details);
    const kind = this.auditKind(event.event);
    return `
      <div class="audit-row ${kind.cls}" data-audit-event data-audit-grant="${this.escape(event.grant_id || "")}">
        <span class="audit-ico">${icons[kind.icon]}</span>
        <span class="audit-mid">
          <span class="audit-type" data-audit-type>${this.escape(this.auditEventLabel(event.event))}</span>
          ${detail ? `<span class="audit-detail">${detail}</span>` : ""}
        </span>
        <span class="audit-meta">
          <span class="audit-ts">${this.escape(this.formatDate(event.ts))}</span>
          ${event.grant_id ? `<code class="audit-grant">${this.escape(this.shortKey(event.grant_id))}</code>` : ""}
        </span>
      </div>`;
  }
  auditSection() {
    const events = Array.isArray(this._lastState?.audit) ? this._lastState.audit : [];
    const recent = events.slice(-50).reverse();
    return `
      <div class="h-page">Activity <span class="count">${events.length}</span></div>
      <div class="card audit-card">
        <div class="eyebrow">Access oversight</div>
        <p class="muted" style="margin:6px 0 12px">Recent Varco events. Sensitive payloads (states, snapshots, history) are never shown.</p>
        <div class="audit-list" data-audit-list>
          ${recent.length ? recent.map((e) => this.auditRow(e)).join("") : '<p class="empty">No activity recorded yet.</p>'}
        </div>
      </div>`;
  }
  grantActivity(grantId) {
    const events = Array.isArray(this._lastState?.audit) ? this._lastState.audit : [];
    const own = events.filter((e) => e.grant_id === grantId).slice(-25).reverse();
    return `
      <details class="sec grant-activity" data-grant-activity="${this.escape(grantId)}">
        <summary>Activity <span class="count-tag">&middot; ${own.length}</span></summary>
        <div class="sec-inner">
          <div class="audit-list">
            ${own.length ? own.map((e) => this.auditRow(e)).join("") : '<p class="empty">No activity for this grant.</p>'}
          </div>
        </div>
      </details>`;
  }
  // ---------- relay ----------
  relayHealthSection(relay) {
    const info = relay || {};
    const connected = !!info.connected;
    return `
      <div class="card" data-relay-status="${connected ? "connected" : "disconnected"}">
        <div class="relay-line">
          <span class="eyebrow">Relay</span>
          ${connected ? '<span class="pill ok"><span class="dot"></span>connected</span>' : '<span class="pill danger"><span class="dot"></span>disconnected</span>'}
        </div>
        <div class="meta">
          <div><div class="k">Bridge URL</div><div class="v" data-relay-bridge-url><code>${info.bridge_url ? this.escape(info.bridge_url) : "unknown"}</code></div></div>
          <div><div class="k">Last connected</div><div class="v" data-relay-last-connected>${info.last_connected ? this.escape(this.formatDate(info.last_connected)) : "never"}</div></div>
        </div>
        ${info.last_error ? `<div class="callout danger" data-relay-last-error>Last error: ${this.escape(info.last_error)}</div>` : ""}
        ${!connected ? `<div class="callout warn relay-guidance" data-relay-guidance>Check that the bridge URL above is reachable from Home Assistant and review the integration logs for connection errors.</div>` : ""}
      </div>`;
  }
  // ---------- dashboard export ----------
  dashboardExportSection() {
    const dashboards = this._dashboards || [];
    const dashboard = this._selectedDashboardIndex !== void 0 ? dashboards[this._selectedDashboardIndex] : void 0;
    const views = Array.isArray(this._exportConfig?.views) ? this._exportConfig.views : [];
    const result = this._exportResult;
    const selectedCount = this._selectedEntities?.size || 0;
    return `
      <div class="h-page">Dashboard brief export</div>
      <div class="card">
        <div class="eyebrow">Manifest blueprint</div>
        <p class="muted" style="margin:6px 0 12px">Harvest an existing Lovelace dashboard or view into a local zip for a coding agent. The zip contains <code>brief.md</code> and <code>manifest.json</code>; it does not create a grant.</p>
        ${this._dashboardError ? `<p class="callout warn">${this.escape(this._dashboardError)}</p>` : ""}
        ${this._exportError ? `<p class="callout danger">${this.escape(this._exportError)}</p>` : ""}
        <label class="field">Dashboard</label>
        <select data-dashboard-select>
          <option value="">Choose a dashboard...</option>
          ${dashboards.map((item, index) => `<option value="${index}" ${index === this._selectedDashboardIndex ? "selected" : ""}>${this.escape(item.title)} (${this.escape(item.url_path || "default")})</option>`).join("")}
        </select>
        ${dashboard && views.length ? `
          <label class="field">Scope</label>
          <select data-view-select>
            <option value="" ${this._selectedViewIndex === "" ? "selected" : ""}>Whole dashboard</option>
            ${views.map((view, index) => {
      const v = view;
      return `<option value="${index}" ${String(index) === String(this._selectedViewIndex) ? "selected" : ""}>View: ${this.escape(v.title || v.path || `View ${index + 1}`)}</option>`;
    }).join("")}
          </select>` : ""}
        ${this._exportLoading ? '<p class="muted">Harvesting dashboard...</p>' : ""}
        ${result ? this.exportPreview(result, selectedCount) : ""}
      </div>`;
  }
  exportPreview(result, selectedCount) {
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
          <div class="sec-inner"><ul>${result.warnings.map((w) => `<li><code>${this.escape(w.path)}</code>: ${this.escape(w.message)}</li>`).join("")}</ul></div>
        </details>` : ""}
      <div class="entity-list">
        ${groups.length ? groups.map((group) => `
          <div class="entity-group">
            <div class="entity-group-title">${this.escape(group.title)}</div>
            ${group.entities.map((entity) => this.entityCheckbox(entity)).join("")}
          </div>`).join("") : '<p class="empty">No entities were harvested from this selection.</p>'}
      </div>
      <div class="btn-row">
        <button data-download-brief ${selectedCount ? "" : "disabled"}>Download agent brief zip</button>
      </div>`;
  }
  groupExportEntities(entities) {
    const groups = /* @__PURE__ */ new Map();
    entities.forEach((entity) => {
      const ref = entity.references?.[0];
      const title = ref ? `${ref.view} / ${ref.card_type}` : "Other harvested entities";
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(entity);
    });
    return Array.from(groups.entries()).map(([title, groupEntities]) => ({ title, entities: groupEntities }));
  }
  previewManifest(result) {
    const selected = result.entities.filter((e) => e.selected);
    return {
      read_entities: selected.filter((e) => e.scopes.read).map((e) => e.entity_id),
      subscriptions: selected.filter((e) => e.scopes.subscriptions).map((e) => e.entity_id),
      history: selected.filter((e) => e.scopes.history).map((e) => e.entity_id),
      camera_snapshots: selected.filter((e) => e.scopes.camera_snapshots).map((e) => e.entity_id),
      actions: []
    };
  }
  entityCheckbox(entity) {
    const scopes = [];
    if (entity.scopes.read) scopes.push("read");
    if (entity.scopes.subscriptions) scopes.push("live");
    if (entity.scopes.history) scopes.push("history");
    if (entity.scopes.camera_snapshots) scopes.push("camera");
    const ref = entity.references?.[0];
    return `
      <label class="entity-row">
        <input type="checkbox" data-export-entity="${this.escape(entity.entity_id)}" ${entity.selected ? "checked" : ""}>
        <span>
          <code>${this.escape(entity.entity_id)}</code>
          <small>${this.escape(scopes.join(", ") || "referenced")} ${ref ? `from ${this.escape(ref.view)} / ${this.escape(ref.card_type)}` : ""}</small>
        </span>
      </label>`;
  }
  // ---------- dashboard export interactions (unchanged behaviour) ----------
  async pickDashboard(index) {
    if (index === "") {
      this._selectedDashboardIndex = void 0;
      this._exportConfig = null;
      this._exportResult = null;
      this.render(this._lastState);
      return;
    }
    const dashboard = this._dashboards?.[Number(index)];
    if (!dashboard) return;
    this._exportLoading = true;
    this._exportError = "";
    this.render(this._lastState);
    try {
      const message = { type: "lovelace/config", force: false };
      if (dashboard.url_path !== null && dashboard.url_path !== void 0) message.url_path = dashboard.url_path;
      this._exportConfig = await this._hass.connection.sendMessagePromise(message);
      this._selectedDashboardIndex = Number(index);
      this._selectedViewIndex = "";
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
    this._selectedEntities = new Set(result.entities.filter((e) => e.selected).map((e) => e.entity_id));
  }
  async requestDashboardExport(selectedEntities) {
    const dashboard = this._selectedDashboardIndex !== void 0 ? this._dashboards?.[this._selectedDashboardIndex] : void 0;
    const message = {
      type: "varco/dashboard_export",
      config: this._exportConfig,
      dashboard_title: dashboard?.title || "Home Assistant dashboard",
      dashboard_url_path: dashboard?.url_path ?? null
    };
    if (this._selectedViewIndex !== "" && this._selectedViewIndex !== void 0 && this._selectedViewIndex !== null) message.view_index = Number(this._selectedViewIndex);
    if (selectedEntities) message.selected_entities = selectedEntities;
    return this._hass.connection.sendMessagePromise(message);
  }
  toggleEntity(entityId, checked) {
    if (!this._selectedEntities) this._selectedEntities = /* @__PURE__ */ new Set();
    if (checked) this._selectedEntities.add(entityId);
    else this._selectedEntities.delete(entityId);
    if (this._exportResult) {
      this._exportResult.entities = this._exportResult.entities.map((e) => e.entity_id === entityId ? { ...e, selected: checked } : e);
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
      const zip = this.createZip({ "brief.md": exportResult.brief, "manifest.json": `${JSON.stringify(exportResult.manifest, null, 2)}
` });
      const dashboard = this._selectedDashboardIndex !== void 0 ? this._dashboards?.[this._selectedDashboardIndex] : void 0;
      const name = this.slugify(`${dashboard?.title || "varco-dashboard"}-${exportResult.dashboard?.view_title || "brief"}`);
      this.downloadBlob(zip, `${name}.zip`);
      this._exportResult = exportResult;
      this._selectedEntities = new Set(exportResult.entities.filter((e) => e.selected).map((e) => e.entity_id));
    } catch (err) {
      this._exportError = `Could not generate brief: ${err.message || err}`;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState);
    }
  }
  // ---------- in-place grant filter ----------
  applyGrantFilter() {
    const search = (this._grantSearch || "").trim().toLowerCase();
    const statusFilter = this._grantStatusFilter || "all";
    let visible = 0;
    this.querySelectorAll(".grant").forEach((card) => {
      const name = (card.getAttribute("data-grant-name") || "").toLowerCase();
      const status = card.getAttribute("data-grant-card-status") || "active";
      const matches = (!search || name.includes(search)) && (statusFilter === "all" || status === statusFilter);
      card.style.display = matches ? "" : "none";
      if (matches) visible += 1;
    });
    const empty = this.querySelector("[data-grant-empty]");
    if (empty) empty.style.display = visible ? "none" : "";
  }
  // ---------- inline confirm ----------
  showInlineConfirm(triggerEl, opts) {
    const row = triggerEl.closest(".btn-row") || triggerEl.parentElement;
    if (!row) {
      opts.onConfirm();
      return;
    }
    if (row.querySelector("[data-confirm-row]")) return;
    triggerEl.style.display = "none";
    const confirmEl = document.createElement("div");
    confirmEl.className = "confirm";
    confirmEl.setAttribute("data-confirm-row", opts.kind);
    confirmEl.setAttribute(`data-confirm-${opts.kind}`, "");
    confirmEl.innerHTML = `
      <span class="msg">${this.escape(opts.message)}</span>
      <span class="acts">
        <button class="danger" data-confirm-yes>${this.escape(opts.confirmLabel)}</button>
        <button class="ghost" data-cancel-confirm>Cancel</button>
      </span>`;
    const cleanup = () => {
      confirmEl.remove();
      triggerEl.style.display = "";
    };
    confirmEl.querySelector("[data-cancel-confirm]").onclick = cleanup;
    confirmEl.querySelector("[data-confirm-yes]").onclick = () => {
      confirmEl.querySelectorAll("button").forEach((b) => {
        b.disabled = true;
      });
      opts.onConfirm();
    };
    row.appendChild(confirmEl);
  }
  // ---------- wizard step navigation (client-side, no reload) ----------
  setStep(requestId, step) {
    this._step[requestId] = step;
    const panes = this.querySelector(`[data-panes="${CSS.escape(requestId)}"]`);
    const card = this.querySelector(`[data-request-card="${CSS.escape(requestId)}"]`);
    if (panes) {
      panes.querySelectorAll(".pane").forEach((p) => {
        p.classList.toggle("show", p.getAttribute("data-pane") === String(step));
      });
    }
    if (card) {
      const steps = card.querySelectorAll(".step");
      const bars = card.querySelectorAll(".step-bar");
      steps.forEach((el, i) => {
        const n = i + 1;
        el.classList.toggle("active", n === step);
        el.classList.toggle("done", n < step);
        const num = el.querySelector(".num");
        if (num) num.innerHTML = n < step ? icons.check : String(n);
      });
      bars.forEach((bar, i) => bar.classList.toggle("done", i + 1 < step));
    }
    if (step === 3) this.updateApproveSummary(requestId);
  }
  currentExpiry(requestId) {
    const hidden = this.querySelector(`[data-approve-expiry="${CSS.escape(requestId)}"]`);
    const value = hidden?.value || "none";
    if (value === "none") return { value, label: "until you revoke it" };
    if (value === "custom") {
      const custom = this.querySelector(`[data-approve-expiry-custom="${CSS.escape(requestId)}"]`)?.value;
      return { value, label: custom ? `until ${new Date(custom).toLocaleString()}` : "a custom time (not set yet)" };
    }
    const map = { "3600000": "for 1 hour", "86400000": "for 24 hours", "604800000": "for 7 days" };
    return { value, label: map[value] || "for a limited time" };
  }
  updateApproveSummary(requestId) {
    const box = this.querySelector(`[data-approve-summary="${CSS.escape(requestId)}"]`);
    if (!box) return;
    const boxes = [...this.querySelectorAll(`[data-scope-request="${CSS.escape(requestId)}"]`)];
    const byKey = {};
    boxes.forEach((b) => {
      if (b.checked) (byKey[b.dataset.scopeKey] = byKey[b.dataset.scopeKey] || []).push(b.value);
    });
    const fakeManifest = byKey;
    const permsEl = box.querySelector("[data-summary-perms]");
    const expiryEl = box.querySelector("[data-summary-expiry]");
    if (permsEl) permsEl.textContent = boxes.length ? this.plainSummary(fakeManifest) : this.plainSummary(this._lastState?.requests.find((r) => r.request_id === requestId)?.manifest);
    if (expiryEl) expiryEl.textContent = this.currentExpiry(requestId).label;
  }
  // ---------- render ----------
  render(state) {
    if (state) this._lastState = state;
    if (!this._lastState || this._lastState.loading) {
      this.innerHTML = `<ha-card><div class="card-content">${styles()}<div class="wrap">Loading Varco\u2026</div></div></ha-card>`;
      return;
    }
    const current = this._lastState;
    const pending = current.requests.filter((r) => r.status === "pending");
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

            <div class="h-page">Pending access requests ${pending.length ? `<span class="count">${pending.length}</span>` : ""}</div>
            ${pending.length ? pending.map((r) => this.requestCard(r)).join("") : '<p class="empty">No one is waiting for access right now.</p>'}

            <div class="h-page">Grants ${current.grants.length ? `<span class="count">${current.grants.length}</span>` : ""}</div>
            ${current.grants.length ? `
              <div class="controls">
                <div class="search">${icons.search}<input type="search" data-grant-search placeholder="Search by consumer name" value="${this.escape(this._grantSearch)}"></div>
                <select data-grant-status-filter>
                  ${["all", "active", "revoked", "expired"].map((v) => `<option value="${v}" ${(this._grantStatusFilter || "all") === v ? "selected" : ""}>${v === "all" ? "All statuses" : v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join("")}
                </select>
              </div>` : ""}
            ${current.grants.length ? current.grants.map((g) => this.grantCard(g)).join("") : '<p class="empty">No grants yet.</p>'}
            ${current.grants.length ? '<p class="empty" data-grant-empty style="display:none">No grants match the current filter.</p>' : ""}

            ${this.auditSection()}

            ${this.dashboardExportSection()}
          </div>
        </div>
      </ha-card>`;
    this.wireEvents();
  }
  wireEvents() {
    this.querySelectorAll("[data-step-next]").forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.stepNext;
        this.setStep(id, Math.min(3, (this._step[id] || 1) + 1));
      };
    });
    this.querySelectorAll("[data-step-prev]").forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.stepPrev;
        this.setStep(id, Math.max(1, (this._step[id] || 1) - 1));
      };
    });
    this.querySelectorAll("[data-scope-all]").forEach((el) => {
      el.onclick = () => {
        this.querySelectorAll(`[data-scope-request="${CSS.escape(el.dataset.scopeAll)}"]`).forEach((b) => {
          b.checked = true;
        });
      };
    });
    this.querySelectorAll("[data-scope-none]").forEach((el) => {
      el.onclick = () => {
        this.querySelectorAll(`[data-scope-request="${CSS.escape(el.dataset.scopeNone)}"]`).forEach((b) => {
          b.checked = false;
        });
      };
    });
    this.querySelectorAll("[data-expiry-chip]").forEach((chip) => {
      chip.onclick = () => {
        const id = chip.dataset.expiryChip;
        const value = chip.dataset.expiryValue;
        this.querySelectorAll(`[data-expiry-chips="${CSS.escape(id)}"] .chip`).forEach((c) => c.classList.remove("sel"));
        chip.classList.add("sel");
        const hidden = this.querySelector(`[data-approve-expiry="${CSS.escape(id)}"]`);
        if (hidden) hidden.value = value;
        const custom = this.querySelector(`[data-approve-expiry-custom="${CSS.escape(id)}"]`);
        if (custom) custom.style.display = value === "custom" ? "block" : "none";
        this.updateApproveSummary(id);
      };
    });
    this.querySelectorAll("[data-approve-expiry-custom]").forEach((el) => {
      el.onchange = () => this.updateApproveSummary(el.dataset.approveExpiryCustom);
    });
    this.querySelectorAll("[data-approve]").forEach((el) => {
      el.onclick = () => {
        const requestId = el.dataset.approve;
        const boxes = [...this.querySelectorAll(`[data-scope-request="${CSS.escape(requestId)}"]`)];
        const payload = { request_id: requestId };
        if (boxes.some((b) => !b.checked)) {
          const approved = {};
          boxes.forEach((b) => {
            approved[b.dataset.scopeKey] = approved[b.dataset.scopeKey] || [];
            if (b.checked) approved[b.dataset.scopeKey].push(b.value);
          });
          payload.approved_manifest = approved;
        }
        const expiry = this.currentExpiry(requestId);
        if (expiry.value === "custom") {
          const customVal = this.querySelector(`[data-approve-expiry-custom="${CSS.escape(requestId)}"]`)?.value;
          if (customVal) payload.expires_at = new Date(customVal).toISOString();
        } else if (expiry.value !== "none") {
          payload.expires_at = new Date(Date.now() + Number(expiry.value)).toISOString();
        }
        void this.call("varco/approve_request", payload);
      };
    });
    this.querySelectorAll("[data-reject]").forEach((el) => {
      el.onclick = () => void this.call("varco/reject_request", { request_id: el.dataset.reject });
    });
    this.querySelectorAll("[data-revoke]").forEach((el) => {
      el.onclick = () => this.showInlineConfirm(el, {
        kind: "revoke",
        message: "Revoke access? This immediately ends active sessions for this consumer.",
        confirmLabel: "Revoke access",
        onConfirm: () => void this.call("varco/revoke_grant", { grant_id: el.dataset.revoke })
      });
    });
    this.querySelectorAll("[data-delete-grant]").forEach((el) => {
      el.onclick = () => this.showInlineConfirm(el, {
        kind: "delete",
        message: `Delete grant record for ${el.dataset.name}? This also removes active access for that consumer.`,
        confirmLabel: "Delete grant record",
        onConfirm: () => void this.call("varco/delete_grant", { grant_id: el.dataset.deleteGrant })
      });
    });
    this.querySelectorAll("[data-rf-type]").forEach((sel) => {
      sel.onchange = () => {
        const grantId = sel.dataset.rfType;
        const fieldsEl = this.querySelector(`[data-rf-fields="${grantId}"]`);
        if (fieldsEl) fieldsEl.innerHTML = this.restrictionTypeFields(sel.value);
        if (sel.value && fieldsEl && !fieldsEl.querySelector("[data-rf-save]")) {
          const btn = document.createElement("button");
          btn.textContent = "Save restriction";
          btn.dataset.rfSave = grantId;
          btn.style.marginTop = "12px";
          fieldsEl.appendChild(btn);
        }
      };
    });
    this.querySelectorAll("[data-remove-restriction]").forEach((btn) => {
      btn.onclick = async () => {
        const grantId = btn.dataset.removeRestriction;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const existing = Array.isArray(grant?.restrictions) ? grant.restrictions : [];
        const updated = existing.filter((_, i) => i !== idx);
        await this._hass.connection.sendMessagePromise({ type: "varco/update_grant_restrictions", grant_id: grantId, restrictions: updated });
        this._loaded = false;
        await this.load();
      };
    });
    this.querySelectorAll("[data-toggle-restriction]").forEach((btn) => {
      btn.onclick = async () => {
        const grantId = btn.dataset.toggleRestriction;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const existing = Array.isArray(grant?.restrictions) ? grant.restrictions : [];
        if (!existing[idx]) return;
        btn.disabled = true;
        const updated = existing.map((item, i) => i === idx ? { ...item, enabled: item.enabled === false } : item);
        await this._hass.connection.sendMessagePromise({ type: "varco/update_grant_restrictions", grant_id: grantId, restrictions: updated });
        this._loaded = false;
        await this.load();
      };
    });
    this.querySelectorAll("[data-edit-restriction]").forEach((btn) => {
      btn.onclick = () => {
        const grantId = btn.dataset.editRestriction;
        const idx = Number(btn.dataset.restrictionIndex);
        const grant = this._lastState?.grants?.find((g) => g.grant_id === grantId);
        const original = grant?.restrictions?.[idx];
        const editEl = this.querySelector(`[data-restriction-edit="${CSS.escape(grantId)}"][data-restriction-index="${idx}"]`);
        if (!original || !editEl) return;
        if (!editEl.hidden) return;
        editEl.innerHTML = `${this.restrictionEditFields(original)}<div class="btn-row" style="margin-top:8px"><button class="tiny" data-re-save>Save</button><button class="ghost tiny" data-re-cancel>Cancel</button></div>`;
        editEl.hidden = false;
        editEl.querySelector("[data-re-cancel]").onclick = () => {
          editEl.hidden = true;
          editEl.innerHTML = "";
        };
        editEl.querySelector("[data-re-save]").onclick = async (ev) => {
          const updatedR = this.buildEditedRestriction(grantId, idx, editEl);
          if (!updatedR) return;
          const existing = Array.isArray(grant?.restrictions) ? grant.restrictions : [];
          const updated = existing.map((item, i) => i === idx ? updatedR : item);
          const tgt = ev.currentTarget;
          tgt.disabled = true;
          tgt.textContent = "Saving\u2026";
          await this._hass.connection.sendMessagePromise({ type: "varco/update_grant_restrictions", grant_id: grantId, restrictions: updated });
          this._loaded = false;
          await this.load();
        };
      };
    });
    const grantSearch = this.querySelector("[data-grant-search]");
    if (grantSearch) grantSearch.oninput = () => {
      this._grantSearch = grantSearch.value;
      this.applyGrantFilter();
    };
    const grantStatusFilter = this.querySelector("[data-grant-status-filter]");
    if (grantStatusFilter) grantStatusFilter.onchange = () => {
      this._grantStatusFilter = grantStatusFilter.value;
      this.applyGrantFilter();
    };
    const dashboardSelect = this.querySelector("[data-dashboard-select]");
    if (dashboardSelect) dashboardSelect.onchange = () => void this.pickDashboard(dashboardSelect.value);
    const viewSelect = this.querySelector("[data-view-select]");
    if (viewSelect) viewSelect.onchange = () => void this.pickView(viewSelect.value);
    this.querySelectorAll("[data-export-entity]").forEach((el) => {
      el.onchange = () => this.toggleEntity(el.dataset.exportEntity, el.checked);
    });
    const download = this.querySelector("[data-download-brief]");
    if (download) download.onclick = () => void this.downloadDashboardBrief();
    this.applyGrantFilter();
  }
  // ---------- zip (unchanged) ----------
  slugify(value) {
    return String(value || "varco-brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "varco-brief";
  }
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
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
      const local = this.zipHeader(30, 67324752, nameBytes, data, crc, offset);
      localParts.push(local, nameBytes, data);
      const central = this.zipHeader(46, 33639248, nameBytes, data, crc, offset);
      centralParts.push(central, nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 101010256, true);
    view.setUint16(8, Object.keys(files).length, true);
    view.setUint16(10, Object.keys(files).length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }
  zipHeader(size, signature, nameBytes, data, crc, offset) {
    const header = new Uint8Array(size);
    const view = new DataView(header.buffer);
    view.setUint32(0, signature, true);
    const dosDate = 44 << 9 | 1 << 5 | 1;
    if (signature === 67324752) {
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
        let crc2 = index;
        for (let bit = 0; bit < 8; bit += 1) crc2 = crc2 & 1 ? 3988292384 ^ crc2 >>> 1 : crc2 >>> 1;
        return crc2 >>> 0;
      });
    }
    let crc = 4294967295;
    for (let index = 0; index < data.length; index += 1) crc = this._crcTable[(crc ^ data[index]) & 255] ^ crc >>> 8;
    return (crc ^ 4294967295) >>> 0;
  }
};
customElements.define("varco-panel", VarcoPanel);
export {
  VarcoPanel
};
