// Visual design system for the Varco Authority panel. Uses Home Assistant CSS
// variables so it adapts to the active theme (light/dark) automatically.

export const styles = (): string => `
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
    .share-suggestions { display: grid; gap: 6px; margin-top: 6px; }
    .share-suggestions button { justify-content: flex-start; background: var(--varco-surface-2); color: var(--varco-text); border-color: var(--varco-border); }
    .share-suggestions span { color: var(--varco-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
    .sec > summary::before { content: '›'; font-size: 18px; color: var(--varco-muted); transition: transform .15s ease; display: inline-block; }
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
