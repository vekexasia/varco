// src/styles.ts
var styles = () => `
  <style>
    .varco-root {
      --varco-radius: 14px;
      --varco-radius-sm: 10px;
      --bg: #0E1116; --bg-2: #0A0D11; --surface: #161B22; --surface-2: #1B2129; --elev: #222C37;
      --border: #28323D; --border-soft: #1E242C;
      --text: #E7EDF3; --text-2: #9BA7B3; --text-3: #697682;
      --accent: #2DD4A7; --accent-ink: #04150F; --amber: #F2B45A; --red: #F2606A;
      --primary: #7C8CFF; --primary-ink: #0A0E1F; --violet: #A98BFF; --coral: #FF8E6B;
      --c-read: #7C8CFF; --c-live: #2DD4A7; --c-history: #F2B45A; --c-cameras: #A98BFF; --c-actions: #FF8E6B;
      --shadow: 0 22px 50px rgba(0,0,0,.5);
      /* compatibility aliases used by existing component rules */
      --varco-surface: var(--surface); --varco-surface-2: var(--surface-2); --varco-border: var(--border);
      --varco-text: var(--text); --varco-muted: var(--text-2); --varco-accent: var(--primary);
      --varco-ok: var(--accent); --varco-warn: var(--amber); --varco-danger: var(--red);
      display: block; background: var(--bg); color: var(--text);
      font-family: 'Hanken Grotesk', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: light) {
      .varco-root {
        --bg: #EEF1F4; --bg-2: #E4E8EC; --surface: #FFFFFF; --surface-2: #F4F6F8; --elev: #FFFFFF;
        --border: #E1E6EB; --border-soft: #ECEFF2;
        --text: #15202B; --text-2: #566372; --text-3: #8A95A1;
        --accent: #0E9F78; --accent-ink: #FFFFFF; --amber: #A8741A; --red: #D6454F;
        --primary: #4858E0; --primary-ink: #FFFFFF; --violet: #7C5CE0; --coral: #CF5E37;
        --c-read: #4858E0; --c-live: #0E9F78; --c-history: #A8741A; --c-cameras: #7C5CE0; --c-actions: #CF5E37;
        --shadow: 0 22px 50px rgba(20,32,43,.16);
      }
    }

    .varco-root * { box-sizing: border-box; }
    .varco-root .mono, .varco-root code { font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .varco-root section[id] { scroll-margin-top: 124px; }
    .wrap { padding: 0 22px 90px; }

    @keyframes vToast { from { opacity: 0; transform: translate(-50%, 14px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

    /* ---- top bar ---- */
    .vbar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 16px; height: 56px; padding: 0 22px; background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(14px); border-bottom: 1px solid var(--border); }
    .vbrand { display: flex; align-items: center; gap: 11px; }
    .vbrand .name { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
    .vbrand .name .sub { color: var(--text-3); font-weight: 500; }
    .vchip { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; font-size: 11.5px; font-weight: 600; border-radius: 999px; padding: 4px 10px; }
    .vchip.ok { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
    .vchip.off { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); border: 1px solid color-mix(in srgb, var(--red) 30%, transparent); }
    .vchip .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
    .vspace { flex: 1; }
    .seg { display: flex; gap: 3px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
    .seg button { font: inherit; font-size: 12.5px; font-weight: 600; border: none; border-radius: 7px; padding: 6px 12px; cursor: pointer; background: transparent; color: var(--text-2); }
    .seg button.sel { background: var(--elev); color: var(--text); }

    /* ---- sticky summary ---- */
    .summary { position: sticky; top: 56px; z-index: 30; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(12px); padding: 16px 22px 12px; border-bottom: 1px solid var(--border); }
    .summary-top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 13px; }
    .summary-id { flex: 1; min-width: 0; }
    .summary-id .lab { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--text-3); margin-bottom: 3px; }
    .summary-id .copy { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; }
    .summary-id .copy:hover { opacity: .82; }
    .summary-id .copy .val { font-size: 13px; }
    .summary-id .copy .act { font-size: 10px; font-weight: 700; color: var(--text-3); letter-spacing: .05em; }
    .summary-relay { text-align: right; }
    .summary-relay .line { display: flex; align-items: center; gap: 7px; justify-content: flex-end; font-size: 12.5px; font-weight: 600; }
    .summary-relay .line .dot { width: 7px; height: 7px; border-radius: 50%; }
    .summary-relay .meta { font-size: 11px; color: var(--text-3); margin-top: 2px; }
    .anchor-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .atab { font-size: 12.5px; font-weight: 600; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; cursor: pointer; }
    .atab:hover { color: var(--text); border-color: var(--text-3); }

    /* ---- sections ---- */
    section { padding-top: 40px; }
    section:first-of-type { padding-top: 26px; }
    .sec-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
    .sec-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .sec-title .badge { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 10px; }
    .sec-title .badge.amber { color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
    .sec-title .badge.muted { color: var(--text-3); background: var(--surface-2); border: 1px solid var(--border); }
    .sec-lead { font-size: 13px; color: var(--text-2); margin: -8px 0 18px; line-height: 1.5; }

    /* ---- KPI strip ---- */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 12px; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 15px 17px; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .kpi .head { display: flex; align-items: center; gap: 7px; }
    .kpi .head .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .kpi .head .lab { font-size: 10.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kpi .val { font-size: 25px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.05; }
    .kpi .sub { font-size: 11.5px; color: var(--text-2); }

    /* ---- buttons ---- */
    .varco-root button {
      font: inherit; font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      border: 1px solid transparent; border-radius: 10px; padding: 9px 16px;
      background: var(--primary); color: var(--primary-ink);
      transition: filter .12s ease, background .12s ease, border-color .12s ease, transform .04s ease;
    }
    .varco-root button svg { width: 16px; height: 16px; flex: none; }
    .varco-root button:hover { filter: brightness(1.06); }
    .varco-root button:active { transform: translateY(1px); }
    .varco-root button[disabled] { opacity: .45; cursor: not-allowed; filter: none; transform: none; }
    button.go { background: var(--accent); color: var(--accent-ink); }
    button.ghost { background: transparent; color: var(--text); border-color: var(--border); }
    button.ghost:hover { background: var(--surface-2); filter: none; }
    button.subtle { background: var(--surface-2); color: var(--text); border-color: var(--border); }
    button.subtle:hover { filter: none; background: var(--border); }
    button.danger { background: transparent; color: var(--red); border-color: color-mix(in srgb, var(--red) 45%, transparent); }
    button.danger:hover { background: color-mix(in srgb, var(--red) 12%, transparent); filter: none; }
    button.tiny { padding: 5px 11px; font-size: 12px; border-radius: 8px; }
    .btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }

    /* ---- inputs ---- */
    .varco-root input, .varco-root select, .varco-root textarea {
      font: inherit; color: var(--text); background: var(--surface-2);
      border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; width: 100%;
    }
    .varco-root input:focus, .varco-root select:focus, .varco-root textarea:focus { outline: none; border-color: var(--primary); }
    .varco-root input::placeholder { color: var(--text-3); }
    label.field { display: block; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-3); margin: 14px 0 6px; }
    code { background: var(--surface-2); padding: 2px 6px; border-radius: 6px; font-size: .92em; word-break: break-all; }
    .muted { color: var(--text-2); }
    .empty { color: var(--text-2); padding: 14px 2px; }
    .eyebrow { color: var(--text-3); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
    .share-suggestions { display: grid; gap: 6px; margin-top: 6px; }
    .share-suggestions button { justify-content: flex-start; background: var(--surface-2); color: var(--text); border-color: var(--border); }
    .share-suggestions span { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ---- cards / panels ---- */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 15px; padding: 22px; margin: 0; }
    .panel { max-width: 540px; }

    /* ---- pills ---- */
    .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: 5px 11px; white-space: nowrap; }
    .pill.ok { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
    .pill.warn { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--amber); }
    .pill.off { background: var(--surface-2); color: var(--text-3); }
    .pill.danger { background: color-mix(in srgb, var(--red) 14%, transparent); color: var(--red); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

    /* ---- permission chips & legend ---- */
    .perm-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px; font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .perm-chip .sw { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
    .perm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin: -6px 0 16px; }
    .legend .item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-3); letter-spacing: .04em; text-transform: uppercase; }
    .legend .sw { width: 8px; height: 8px; border-radius: 2px; }

    /* ---- key/value meta ---- */
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px 18px; margin: 16px 0 4px; }
    .meta .k { color: var(--text-3); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 3px; }
    .meta .v { font-weight: 600; font-size: 13px; }
    details.tech { margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 10px; }
    details.tech summary { cursor: pointer; color: var(--text-2); font-size: 12px; font-weight: 700; }
    details.tech .meta { margin-top: 12px; }

    /* ---- callouts ---- */
    .callout { border-radius: var(--varco-radius-sm); padding: 12px 14px; margin: 12px 0; font-size: 14px; background: var(--surface-2); }
    .callout.warn { background: color-mix(in srgb, var(--amber) 14%, transparent); border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent); }
    .callout.danger { background: color-mix(in srgb, var(--red) 10%, transparent); border: 1px solid color-mix(in srgb, var(--red) 35%, transparent); }

    /* ---- pending request / wizard ---- */
    .req { border: 1px solid var(--border); border-radius: 15px; background: var(--surface); margin: 12px 0; overflow: hidden; }
    .req-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; background: var(--surface-2); }
    .req-id { display: flex; align-items: center; gap: 12px; }
    .req-avatar { width: 42px; height: 42px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); color: var(--text-2); display: grid; place-items: center; font-weight: 700; font-size: 16px; flex: none; font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .req-name { font-size: 16px; font-weight: 700; line-height: 1.2; }
    .req-sub { color: var(--text-2); font-size: 13px; margin-top: 2px; }
    .pair { text-align: right; }
    .pair .lab { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); }
    .pair .code { font-size: 22px; font-weight: 800; letter-spacing: .14em; font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', ui-monospace, monospace; }

    /* stepper */
    .steps { display: flex; align-items: center; gap: 0; padding: 14px 18px 0; }
    .step { display: flex; align-items: center; gap: 9px; color: var(--text-3); font-size: 13px; font-weight: 700; }
    .step .num { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border); flex: none; }
    .step.active { color: var(--text); }
    .step.active .num { background: var(--primary); color: var(--primary-ink); border-color: transparent; }
    .step.done .num { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); border-color: transparent; }
    .step-bar { flex: 1; height: 2px; background: var(--border); margin: 0 12px; border-radius: 2px; min-width: 16px; }
    .step-bar.done { background: var(--accent); }

    .req-body { padding: 8px 18px 18px; }
    .panes > .pane { display: none; }
    .panes > .pane.show { display: block; animation: fade .18s ease; }
    .lead { font-size: 15px; line-height: 1.5; margin: 14px 0; }
    .lead strong { font-weight: 700; }

    /* permission groups (wizard) */
    .perm-group { border: 1px solid var(--border); border-radius: var(--varco-radius-sm); margin: 10px 0; overflow: hidden; }
    .perm-head { display: flex; align-items: center; gap: 12px; padding: 11px 14px; background: var(--surface-2); }
    .perm-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--surface); border: 1px solid var(--border); }
    .perm-ico svg { width: 17px; height: 17px; }
    .perm-meta { flex: 1; min-width: 0; }
    .perm-title { display: block; font-weight: 700; font-size: 14px; }
    .perm-desc { display: block; color: var(--text-2); font-size: 12px; margin-top: 1px; }
    .perm-count { font-size: 12px; font-weight: 700; color: var(--text-2); }
    .perm-items { list-style: none; margin: 0; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
    .perm-items li { margin: 0; }
    .perm-items label { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
    .perm-items label:hover { background: var(--surface-2); }
    .perm-items input { width: auto; }
    .perm-empty { padding: 10px 14px; color: var(--text-2); font-size: 13px; }
    .perm-actions { display: flex; gap: 14px; margin: 4px 2px 0; }
    .perm-actions a { color: var(--primary); font-size: 12px; font-weight: 700; cursor: pointer; }

    /* duration chips */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .chip { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text); }
    .chip:hover { background: var(--surface-2); }
    .chip.sel { background: var(--primary); color: var(--primary-ink); border-color: transparent; }
    .summary-box { background: var(--surface-2); border-radius: var(--varco-radius-sm); padding: 14px 16px; margin: 14px 0; font-size: 14px; line-height: 1.55; }
    .summary-box b { font-weight: 700; }

    .nav-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 18px; }
    .nav-row .left, .nav-row .right { display: flex; gap: 8px; }

    /* ---- grants ---- */
    .controls { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 14px; }
    .controls .search { flex: 1 1 240px; min-width: 180px; position: relative; }
    .controls .search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--text-3); pointer-events: none; }
    .controls .search input { padding-left: 36px; background: var(--surface); }
    .controls .seg { flex: none; }

    .grant { border: 1px solid var(--border); border-radius: 15px; background: var(--surface); margin: 12px 0; overflow: hidden; }
    .grant.revoked, .grant.expired { opacity: .7; }
    .grant.flash, .req.flash { border-color: var(--primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 26%, transparent); }
    .grant-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; }
    .grant-head .l { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .grant-avatar { width: 40px; height: 40px; border-radius: 11px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); display: grid; place-items: center; font-weight: 700; flex: none; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 14px; }
    .grant-name { font-weight: 700; font-size: 15.5px; }
    .grant-sub { color: var(--text-2); font-size: 12.5px; margin-top: 2px; }
    .grant-body { padding: 0 18px 16px; }
    .grant-chips { padding: 0 18px 14px 72px; }

    .sec { border-top: 1px solid var(--border-soft); }
    .sec > summary { cursor: pointer; font-weight: 700; font-size: 14px; padding: 13px 18px; list-style: none; display: flex; align-items: center; gap: 8px; }
    .sec > summary::-webkit-details-marker { display: none; }
    .sec > summary::before { content: '\u203A'; font-size: 18px; color: var(--text-3); transition: transform .15s ease; display: inline-block; }
    .sec[open] > summary::before { transform: rotate(90deg); }
    .sec .sec-inner { padding: 0 18px 16px; }
    .sec .count-tag { color: var(--text-3); font-weight: 600; }

    .scope-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .scope-box { border: 1px solid var(--border); border-radius: var(--varco-radius-sm); padding: 11px 13px; }
    .scope-box .t { font-weight: 700; font-size: 12px; margin-bottom: 6px; letter-spacing: .04em; text-transform: uppercase; display: flex; align-items: center; gap: 7px; }
    .scope-box .t .sw { width: 8px; height: 8px; border-radius: 2px; }
    .scope-box ul { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .scope-box li { margin: 0; font-size: 12px; }

    /* restrictions */
    .rest { display: flex; flex-direction: column; gap: 8px; }
    .rest-row { background: var(--surface-2); border-radius: var(--varco-radius-sm); padding: 10px 12px; }
    .rest-row.disabled { opacity: .6; }
    .rest-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .rest-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
    .rest-badge { background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); border-radius: 6px; font-size: 11px; font-weight: 800; padding: 3px 8px; text-transform: uppercase; }
    .rest-info small { color: var(--text-2); }
    .rest-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .rest-tag { color: var(--text-3); font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .rest-edit { border-top: 1px solid var(--border); margin-top: 10px; padding-top: 10px; }
    .rest-add { border: 1px dashed var(--border); border-radius: var(--varco-radius-sm); margin-top: 12px; padding: 14px; }
    .chk-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .chk-row label { display: inline-flex; align-items: center; gap: 6px; width: auto; }
    .chk-row input { width: auto; }

    /* inline confirm */
    .confirm { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; width: 100%; padding: 12px 14px; border-radius: var(--varco-radius-sm); background: color-mix(in srgb, var(--red) 8%, transparent); border: 1px solid color-mix(in srgb, var(--red) 30%, transparent); }
    .confirm .msg { flex: 1 1 220px; font-size: 13.5px; line-height: 1.5; }
    .confirm .acts { display: flex; gap: 8px; }

    /* ---- audit ---- */
    .audit-card { background: var(--surface); border: 1px solid var(--border); border-radius: 15px; overflow: hidden; }
    .audit-toolbar { padding: 15px 18px 13px; border-bottom: 1px solid var(--border-soft); }
    .audit-toolbar .top { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
    .audit-toolbar .top .title { font-size: 13.5px; font-weight: 600; }
    .audit-toolbar .top .ct { font-size: 11px; font-weight: 600; color: var(--text-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px; font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .audit-toolbar .top .note { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--text-3); }
    .audit-toolbar .top .note .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .act-filters { display: flex; gap: 5px; flex-wrap: wrap; }
    .afilter { font: inherit; font-size: 11.5px; font-weight: 600; border-radius: 999px; padding: 5px 12px; cursor: pointer; white-space: nowrap; color: var(--text-3); background: transparent; border: 1px solid var(--border-soft); }
    .afilter.sel { color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); border-color: color-mix(in srgb, var(--accent) 38%, transparent); }
    .audit-list { display: flex; flex-direction: column; overflow: auto; max-height: 560px; }
    .grant-activity .audit-list { max-height: 320px; border: 1px solid var(--border); border-radius: 12px; }
    .audit-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px 13px; padding: 12px 18px; border-bottom: 1px solid var(--border-soft); }
    .audit-row[data-timeline-target] { cursor: pointer; }
    .audit-row[data-timeline-target]:hover { background: var(--surface-2); }
    .audit-ico { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex: none; border: 1.5px solid var(--text-3); color: var(--text-3); font-size: 12px; font-weight: 700; }
    .audit-mid { min-width: 0; }
    .audit-type { font-weight: 500; font-size: 13px; }
    .audit-cat { font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-left: 8px; }
    .audit-detail { color: var(--text-2); font-size: 12px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; }
    .audit-meta { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .audit-ts { color: var(--text-2); font-size: 11px; white-space: nowrap; font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .audit-grant { font-size: 10px; }

    /* ---- export ---- */
    .entity-list { border: 1px solid var(--border); border-radius: var(--varco-radius-sm); max-height: 360px; overflow: auto; padding: 4px; margin-top: 10px; }
    .entity-group + .entity-group { border-top: 1px solid var(--border); }
    .entity-group-title { color: var(--text-3); font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 8px 8px 4px; }
    .entity-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 8px; }
    .entity-row:hover { background: var(--surface-2); }
    .entity-row input { width: auto; margin-top: 2px; }
    .entity-row small { color: var(--text-2); display: block; margin-top: 2px; }
    .export-summary { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: var(--surface-2); border-radius: var(--varco-radius-sm); padding: 12px 14px; margin: 12px 0; font-size: 14px; }

    /* ---- revoke confirm modal ---- */
    .modal-scrim { position: fixed; inset: 0; z-index: 70; background: rgba(4,7,11,.55); display: flex; align-items: center; justify-content: center; padding: 24px; animation: fade .18s ease; }
    .modal { width: 420px; max-width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); padding: 24px; }
    .modal .mhead { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
    .modal .micon { width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, var(--red) 14%, transparent); color: var(--red); display: grid; place-items: center; font-size: 18px; font-weight: 700; }
    .modal .mtitle { font-size: 16px; font-weight: 700; }
    .modal p { margin: 0 0 6px; font-size: 13.5px; color: var(--text); line-height: 1.5; }
    .modal p.fine { margin: 0 0 20px; font-size: 12.5px; color: var(--text-2); }
    .modal .macts { display: flex; gap: 10px; justify-content: flex-end; }

    /* ---- toast ---- */
    .toast { position: fixed; left: 50%; bottom: 28px; z-index: 80; display: flex; align-items: center; gap: 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 12px 18px; box-shadow: var(--shadow); animation: vToast .26s cubic-bezier(.2,.7,.2,1); }
    .toast .ico { width: 18px; height: 18px; border-radius: 50%; color: var(--bg); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
    .toast .msg { font-size: 13px; font-weight: 600; }
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

// src/share.ts
var SHARE_MAX_CLAIMS = 100;
function parseShareClaims(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const claims = Number(value);
  return claims <= SHARE_MAX_CLAIMS ? claims : null;
}

// src/panel.ts
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var FONTS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">`;
var SCOPE_DEFS = [
  { key: "read_entities", title: "Read entity states", desc: "See the current value of these entities", icon: "eye", color: "var(--c-read)", short: "READ" },
  { key: "subscriptions", title: "Live updates", desc: "Get notified when these entities change", icon: "live", color: "var(--c-live)", short: "LIVE" },
  { key: "history", title: "Query history", desc: "Read past values of these entities", icon: "history", color: "var(--c-history)", short: "HISTORY" },
  { key: "camera_snapshots", title: "Camera snapshots", desc: "Capture still images from these cameras", icon: "camera", color: "var(--c-cameras)", short: "CAMERAS" },
  { key: "actions", title: "Control actions", desc: "Call these Home Assistant services", icon: "bolt", color: "var(--c-actions)", short: "ACTIONS" }
];
var CAT = {
  connection: { label: "CONNECTION", color: "var(--accent)" },
  share: { label: "SHARE", color: "var(--primary)" },
  access: { label: "ACCESS", color: "var(--text-2)" },
  control: { label: "CONTROL", color: "var(--coral)" },
  admin: { label: "ADMIN", color: "var(--red)" }
};
var ANCHORS = [
  ["sec-overview", "Overview"],
  ["sec-share", "Share"],
  ["sec-requests", "Requests"],
  ["sec-grants", "Grants"],
  ["sec-activity", "Activity"],
  ["sec-export", "Export"]
];
var VarcoPanel = class extends HTMLElement {
  _hass;
  _loaded = false;
  _lastState;
  _toastTimer;
  _eventUnsub;
  _subscribePromise;
  _grantSearch = "";
  _grantStatusFilter = "all";
  _activityFilter = "all";
  _confirmRevoke = null;
  _toast = null;
  _authCopied = false;
  _shareEntityId = "";
  _shareName = "";
  _shareClaims = "1";
  _shareUrl = "";
  _shareError = "";
  _shareLoading = false;
  // wizard step per request id
  _step = {};
  // dashboard export state
  _dashboards = [];
  _dashboardError = "";
  _exportError = "";
  _exportLoading = false;
  _exportConfig = null;
  _exportResult = null;
  _exportShareUses = "1";
  _exportShareUrl = "";
  _selectedDashboardIndex;
  _selectedViewIndex = "";
  _selectedEntities = /* @__PURE__ */ new Set();
  _selectedActionEntities = /* @__PURE__ */ new Set();
  _crcTable;
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) void this.load();
    void this.subscribe();
  }
  connectedCallback() {
    this.render({ loading: true });
    this.addEventListener("click", this._onDelegatedClick);
    void this.subscribe();
  }
  disconnectedCallback() {
    this._eventUnsub?.();
    this._eventUnsub = void 0;
    this._subscribePromise = void 0;
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
  async subscribe() {
    if (!this._hass || this._eventUnsub || this._subscribePromise) return;
    const subscribeMessage = this._hass.connection.subscribeMessage;
    if (!subscribeMessage) return;
    this._subscribePromise = subscribeMessage.call(this._hass.connection, async () => {
      this._loaded = false;
      await this.load();
    }, { type: "varco/subscribe" }).then((unsub) => {
      this._eventUnsub = unsub;
    }).catch(() => void 0).finally(() => {
      this._subscribePromise = void 0;
    });
    await this._subscribePromise;
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
  flash(msg, tone = "ok") {
    this._toast = { msg, tone };
    this.renderToast();
    clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this._toast = null;
      this.renderToast();
    }, 2600);
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
  // Coloured permission chips for the grant card header.
  permChips(manifest) {
    const s = this.scopes(manifest);
    return SCOPE_DEFS.filter((def) => s[def.key].length).map((def) => `<span class="perm-chip"><span class="sw" style="background:${def.color}"></span>${s[def.key].length} ${def.short}</span>`).join("");
  }
  shortKey(value) {
    const text = String(value || "");
    if (text.length <= 24) return text || "unknown";
    return `${text.slice(0, 12)}\u2026${text.slice(-8)}`;
  }
  formatDate(value) {
    if (!value) return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }
  formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString();
  }
  toLocalInput(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  // ---------- KPI strip ----------
  kpiStrip() {
    const state = this._lastState;
    const grants = state.grants || [];
    const active = grants.filter((g) => this.grantStatus(g) === "active");
    const pending = state.requests.filter((r) => r.status === "pending").length;
    const audit = Array.isArray(state.audit) ? state.audit : [];
    const dayAgo = Date.now() - 24 * 3600 * 1e3;
    const events24 = audit.filter((e) => {
      const t = new Date(e.ts).getTime();
      return !Number.isNaN(t) && t >= dayAgo;
    }).length;
    const ents = /* @__PURE__ */ new Set();
    let actions = 0;
    active.forEach((g) => {
      const s = this.scopes(g.manifest);
      [...s.read_entities, ...s.subscriptions, ...s.camera_snapshots].forEach((e) => ents.add(e));
      actions += s.actions.length;
    });
    const connected = !!state.info.relay?.connected;
    const kpis = [
      { lab: "Active grants", val: String(active.length), sub: `of ${grants.length} total`, color: "var(--accent)" },
      { lab: "Pending requests", val: String(pending), sub: pending ? "awaiting review" : "all clear", color: pending ? "var(--amber)" : "var(--text-3)" },
      { lab: "Events \xB7 24h", val: String(events24), sub: `${audit.length} all time`, color: "var(--primary)" },
      { lab: "Surface exposed", val: String(ents.size), sub: `${ents.size} entities \xB7 ${actions} actions`, color: "var(--violet)" },
      { lab: "Relay", val: connected ? "Connected" : "Offline", sub: state.info.relay?.last_connected ? `last ${this.formatTime(state.info.relay.last_connected)}` : "never", color: connected ? "var(--accent)" : "var(--red)" }
    ];
    return `<div class="kpi-grid">${kpis.map((k) => `
      <div class="kpi">
        <div class="head"><span class="dot" style="background:${k.color}"></span><span class="lab">${this.escape(k.lab)}</span></div>
        <div class="val">${this.escape(k.val)}</div>
        <div class="sub">${this.escape(k.sub)}</div>
      </div>`).join("")}</div>`;
  }
  legend() {
    return `<div class="legend">${SCOPE_DEFS.map((d) => `<span class="item"><span class="sw" style="background:${d.color}"></span>${this.escape(d.short)}</span>`).join("")}</div>`;
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
            <span class="perm-ico" style="color:${def.color}">${icons[def.icon]}</span>
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
            <button class="go" data-approve="${this.escape(id)}">Approve access</button>
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
      <div class="grant ${status}" data-grant-card="${this.escape(grant.grant_id)}" data-grant-name="${this.escape(name)}" data-grant-card-status="${status}">
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
        <div class="grant-chips"><div class="perm-chips">${this.permChips(grant.manifest)}</div></div>
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
          <summary>Scope \xB7 what this consumer may touch <span class="count-tag">&middot; ${this.escape(this.scopeSummary(grant.manifest))}</span></summary>
          <div class="sec-inner">
            <div class="scope-grid">
              ${SCOPE_DEFS.map((def) => this.scopeBox(def, s[def.key])).join("")}
            </div>
          </div>
        </details>
        ${grant.revoked ? "" : this.restrictionsSection(grant.grant_id, restrictions)}
        ${this.grantActivity(grant.grant_id)}
        <div class="grant-body">
          <div class="btn-row" style="margin-top:6px">
            ${grant.revoked ? "" : `<button class="danger" data-revoke="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">${icons.ban} Revoke access</button>`}
            <button class="danger" data-delete-grant="${this.escape(grant.grant_id)}" data-name="${this.escape(name)}">${icons.trash} Delete record</button>
          </div>
        </div>
      </div>`;
  }
  scopeBox(def, values) {
    return `
      <div class="scope-box">
        <div class="t"><span class="sw" style="background:${def.color}"></span>${this.escape(def.short)}</div>
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
    const container = this.querySelector(`[data-rf-fields="${CSS.escape(grantId)}"]`);
    if (!container) return null;
    const type = this.querySelector(`[data-rf-type="${CSS.escape(grantId)}"]`)?.value;
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
  // ---------- timeline ----------
  auditEventLabel(event) {
    const labels = {
      access_request_pending: "Access request pending",
      access_request_received: "Access request received",
      access_request_approved: "Access request approved",
      access_request_rejected: "Access request rejected",
      grant_active: "Grant active",
      grant_expired: "Grant expired",
      grant_created: "Grant created",
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
      share_created: "Share created",
      share_claimed: "Share claimed",
      share_revoked: "Share revoked",
      share_deleted: "Share deleted",
      share_expired: "Share expired",
      webrtc_fallback: "WebRTC fallback to relay",
      webrtc_answer: "WebRTC negotiated"
    };
    return labels[event] || String(event || "event");
  }
  auditCategory(event) {
    if (["consumer_connected", "webrtc_answer", "webrtc_fallback", "session_error"].includes(event)) return "connection";
    if (["share_created", "share_claimed", "share_revoked", "share_deleted", "share_expired"].includes(event)) return "share";
    if (event === "call_service") return "control";
    if (["access_request_pending", "access_request_received", "access_request_approved", "access_request_rejected", "grant_active", "grant_expired", "grant_created", "grant_revoked", "grant_deleted", "grant_restrictions_updated"].includes(event)) return "admin";
    return "access";
  }
  auditSuccess(event) {
    return ["access_request_approved", "grant_active", "grant_created", "consumer_connected", "call_service", "share_claimed", "webrtc_answer"].includes(event);
  }
  auditDetailSummary(details) {
    if (!details || typeof details !== "object") return "";
    const safeKeys = ["domain", "service", "operation", "entity_count", "denied_count", "reason", "manifest_name", "status", "restriction_count", "restriction_id"];
    const parts = [];
    safeKeys.forEach((key) => {
      const v = details[key];
      if (v !== void 0 && v !== null && v !== "") parts.push(`${key}: ${this.escape(String(v))}`);
    });
    return parts.join(" \xB7 ");
  }
  timelineItems(state) {
    const items = [...Array.isArray(state.audit) ? state.audit : []];
    const seenGrantEvents = new Set(items.map((e) => `${e.event}:${e.grant_id || ""}`));
    (state.requests || []).filter((r) => r.status === "pending").forEach((request) => {
      items.push({
        ts: request.created_at,
        event: "access_request_pending",
        grant_id: request.request_id,
        request_id: request.request_id,
        details: { manifest_name: this.manifestName(request) }
      });
    });
    (state.grants || []).forEach((grant) => {
      const status = this.grantStatus(grant);
      if (status === "active" && !seenGrantEvents.has(`grant_created:${grant.grant_id}`)) {
        items.push({ ts: grant.created_at || "", event: "grant_active", grant_id: grant.grant_id, details: { manifest_name: this.manifestName(grant), status } });
      }
      if (status === "expired") items.push({ ts: grant.expires_at || grant.created_at || "", event: "grant_expired", grant_id: grant.grant_id, details: { manifest_name: this.manifestName(grant), status } });
      if (status === "revoked" && !seenGrantEvents.has(`grant_revoked:${grant.grant_id}`)) {
        items.push({ ts: grant.revoked_at || grant.created_at || "", event: "grant_revoked", grant_id: grant.grant_id, details: { manifest_name: this.manifestName(grant), status } });
      }
    });
    return items.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
  }
  auditRow(event) {
    const detail = this.auditDetailSummary(event.details);
    const cat = this.auditCategory(event.event);
    const color = CAT[cat].color;
    const success = this.auditSuccess(event.event);
    const target = event.request_id ? `request:${event.request_id}` : event.grant_id ? `grant:${event.grant_id}` : "";
    const markerStyle = success ? `background:${color};border-color:${color};color:var(--bg);` : `background:transparent;border-color:${color};color:${color};`;
    return `
      <div class="audit-row" data-audit-event data-audit-grant="${this.escape(event.grant_id || "")}" ${target ? `data-timeline-target="${this.escape(target)}"` : ""}>
        <span class="audit-ico" style="${markerStyle}">${success ? "\u2713" : ""}</span>
        <span class="audit-mid">
          <span class="audit-type" data-audit-type>${this.escape(this.auditEventLabel(event.event))}</span>
          <span class="audit-cat" style="color:${color}">${CAT[cat].label}</span>
          ${detail ? `<span class="audit-detail">${detail}</span>` : ""}
        </span>
        <span class="audit-meta">
          <span class="audit-ts">${this.escape(this.formatTime(event.ts))}</span>
          ${event.grant_id ? `<code class="audit-grant">${this.escape(this.shortKey(event.grant_id))}</code>` : ""}
        </span>
      </div>`;
  }
  auditSection() {
    const events = this._lastState ? this.timelineItems(this._lastState) : [];
    const filter = this._activityFilter;
    const filtered = (filter === "all" ? events : events.filter((e) => this.auditCategory(e.event) === filter)).slice(0, 80);
    const filterDefs = [["all", "All"], ["connection", "Connect"], ["share", "Share"], ["access", "Access"], ["control", "Control"], ["admin", "Admin"]];
    const tabs = filterDefs.map(([k, l]) => `<button class="afilter ${filter === k ? "sel" : ""}" data-activity-filter="${k}">${l}</button>`).join("");
    return `
      <div class="audit-card">
        <div class="audit-toolbar">
          <div class="top">
            <span class="title">Timeline</span>
            <span class="ct">${filtered.length}</span>
            <span class="vspace"></span>
            <span class="note"><span class="dot"></span>states, snapshots &amp; history are never logged</span>
          </div>
          <div class="act-filters">${tabs}</div>
        </div>
        <div class="audit-list" data-audit-list>
          ${filtered.length ? filtered.map((e) => this.auditRow(e)).join("") : '<p class="empty" style="padding:18px">No activity recorded yet.</p>'}
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
  // ---------- entity share ----------
  shareEntities() {
    return Object.entries(this._hass?.states || {}).map(([id, state]) => ({ id, label: String(state.attributes?.friendly_name || id) })).sort((a, b) => a.id.localeCompare(b.id));
  }
  shareEntityLabel(entityId) {
    return this.shareEntities().find((entity) => entity.id === entityId)?.label || entityId;
  }
  entityShareSection() {
    return `
      <div class="card panel">
        ${this._shareError ? `<p class="callout danger">${this.escape(this._shareError)}</p>` : ""}
        ${this._shareUrl ? `<p class="callout"><b>Share created.</b><br><code>${this.escape(this._shareUrl)}</code></p><button class="subtle" data-copy-share-link>Copy link</button>` : ""}
        <label class="field">Entity</label>
        <input data-share-entity placeholder="Start typing a name or entity id" value="${this.escape(this._shareEntityId)}" autocomplete="off">
        <div class="share-suggestions" data-share-suggestions></div>
        <label class="field">Share name</label>
        <input data-share-name placeholder="Mario living room light" value="${this.escape(this._shareName)}">
        <label class="field">Allowed link uses</label>
        <input data-share-claims type="number" min="1" max="${SHARE_MAX_CLAIMS}" step="1" value="${this.escape(this._shareClaims)}">
        <div class="btn-row"><button data-create-entity-share ${this._shareLoading ? "disabled" : ""}>${this._shareLoading ? "Creating\u2026" : "Create share link"}</button></div>
      </div>`;
  }
  entityShareManifest(entityId, name) {
    const domain = entityId.split(".")[0];
    return {
      name,
      version: "1",
      read_entities: [entityId],
      subscriptions: [entityId],
      actions: ["sensor", "binary_sensor"].includes(domain) ? [] : [`${domain}.*@${entityId}`]
    };
  }
  localShareUrl(shareUrl) {
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) return shareUrl;
    try {
      const url = new URL(shareUrl);
      const bridge = new URL(shareUrl);
      bridge.protocol = bridge.protocol === "https:" ? "wss:" : "ws:";
      url.protocol = "http:";
      url.hostname = "127.0.0.1";
      url.port = "8787";
      url.searchParams.set("bridge", bridge.origin);
      return url.toString();
    } catch {
      return shareUrl;
    }
  }
  copyText(value) {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  updateShareSuggestions(input) {
    const box = this.querySelector("[data-share-suggestions]");
    if (!box) return;
    const query = input.value.trim().toLowerCase();
    const matches = this.shareEntities().filter((entity) => !query || entity.id.toLowerCase().includes(query) || entity.label.toLowerCase().includes(query)).slice(0, 8);
    box.innerHTML = matches.map((entity) => `<button type="button" data-share-pick="${this.escape(entity.id)}"><span>${this.escape(entity.label)}</span><code>${this.escape(entity.id)}</code></button>`).join("");
    box.querySelectorAll("[data-share-pick]").forEach((button) => {
      button.onclick = () => {
        const entityId = button.dataset.sharePick || "";
        this._shareEntityId = entityId;
        input.value = entityId;
        const nameInput = this.querySelector("[data-share-name]");
        if (nameInput && !nameInput.value.trim()) {
          this._shareName = this.shareEntityLabel(entityId);
          nameInput.value = this._shareName;
        }
        box.innerHTML = "";
      };
    });
  }
  async createEntityShare() {
    const entityId = this._shareEntityId.trim();
    const name = this._shareName.trim() || entityId;
    const maxClaims = parseShareClaims(this._shareClaims);
    this._shareError = "";
    this._shareUrl = "";
    if (!/^\w+\.[\w-]+$/.test(entityId)) {
      this._shareError = "Enter an entity id like light.kitchen.";
      this.render(this._lastState);
      return;
    }
    if (maxClaims === null) {
      this._shareError = `Allowed link uses must be a whole number from 1 to ${SHARE_MAX_CLAIMS}.`;
      this.render(this._lastState);
      return;
    }
    this._shareLoading = true;
    this.render(this._lastState);
    try {
      const response = await this._hass.connection.sendMessagePromise({
        type: "varco/create_share",
        name,
        max_claims: maxClaims,
        manifest: this.entityShareManifest(entityId, name)
      });
      this._shareUrl = this.localShareUrl(response.share_url);
      this.flash("Share link minted", "ok");
    } catch (err) {
      this._shareError = err?.message || String(err);
      this.flash("Could not create share", "danger");
    } finally {
      this._shareLoading = false;
      this.render(this._lastState);
    }
  }
  // ---------- dashboard export ----------
  dashboardExportSection() {
    const dashboards = this._dashboards || [];
    const dashboard = this._selectedDashboardIndex !== void 0 ? dashboards[this._selectedDashboardIndex] : void 0;
    const views = Array.isArray(this._exportConfig?.views) ? this._exportConfig.views : [];
    const result = this._exportResult;
    const selectedCount = this._selectedEntities?.size || 0;
    return `
      <div class="card panel">
        ${this._dashboardError ? `<p class="callout warn">${this.escape(this._dashboardError)}</p>` : ""}
        ${this._exportError ? `<p class="callout danger">${this.escape(this._exportError)}</p>` : ""}
        <label class="field">Dashboard</label>
        <select data-dashboard-select>
          <option value="">Choose a dashboard\u2026</option>
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
        ${this._exportLoading ? '<p class="muted" style="margin-top:12px">Harvesting dashboard\u2026</p>' : ""}
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
        <details class="sec" style="border:1px solid var(--border);border-radius:var(--varco-radius-sm)">
          <summary>${result.warnings.length} unresolved or dynamic dashboard references</summary>
          <div class="sec-inner"><ul>${result.warnings.map((w) => `<li><code>${this.escape(w.path)}</code>: ${this.escape(w.message)}</li>`).join("")}</ul></div>
        </details>` : ""}
      ${this._exportShareUrl ? `<p class="callout"><b>Share created.</b><br><code>${this.escape(this._exportShareUrl)}</code></p><button class="subtle" data-copy-export-share-link>Copy link</button>` : ""}
      <div class="entity-list">
        ${groups.length ? groups.map((group) => `
          <div class="entity-group">
            <div class="entity-group-title">${this.escape(group.title)}</div>
            ${group.entities.map((entity) => this.entityCheckbox(entity)).join("")}
          </div>`).join("") : '<p class="empty">No entities were harvested from this selection.</p>'}
      </div>
      <label class="field">Allowed link uses</label>
      <input data-export-share-uses type="number" min="1" max="${SHARE_MAX_CLAIMS}" step="1" value="${this.escape(this._exportShareUses)}">
      <div class="btn-row">
        <button class="go" data-download-brief ${selectedCount && !this._exportLoading ? "" : "disabled"}>Download agent brief zip</button>
        <button data-build-share-link ${selectedCount && !this._exportLoading ? "" : "disabled"}>${this._exportLoading ? "Building\u2026" : "Build share link"}</button>
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
    const manifest = {
      read_entities: selected.filter((e) => e.scopes.read).map((e) => e.entity_id),
      subscriptions: selected.filter((e) => e.scopes.subscriptions).map((e) => e.entity_id),
      history: selected.filter((e) => e.scopes.history).map((e) => e.entity_id),
      camera_snapshots: selected.filter((e) => e.scopes.camera_snapshots).map((e) => e.entity_id),
      actions: selected.filter((e) => this._selectedActionEntities.has(e.entity_id) && this.canControlEntity(e.entity_id)).map((e) => `${e.entity_id.split(".")[0]}.*@${e.entity_id}`)
    };
    if (result.manifest?.dashboard && typeof result.manifest.dashboard === "object") {
      const selectedIds = new Set(selected.map((entity) => entity.entity_id));
      const dashboard = result.manifest.dashboard;
      manifest.dashboard = { ...dashboard, cards: (dashboard.cards || []).map((card) => ({ ...card, entities: (card.entities || []).filter((entity) => selectedIds.has(entity)) })).filter((card) => card.entities.length) };
    }
    return manifest;
  }
  exportShareName(result) {
    return String(result.manifest?.name || result.dashboard?.view_title || "Dashboard share");
  }
  entityCheckbox(entity) {
    const scopes = [];
    if (entity.scopes.read) scopes.push("read");
    if (entity.scopes.subscriptions) scopes.push("live");
    if (entity.scopes.history) scopes.push("history");
    if (entity.scopes.camera_snapshots) scopes.push("camera");
    const ref = entity.references?.[0];
    const canAct = this.canControlEntity(entity.entity_id);
    const actionChecked = this._selectedActionEntities.has(entity.entity_id);
    return `
      <label class="entity-row">
        <input type="checkbox" data-export-entity="${this.escape(entity.entity_id)}" ${entity.selected ? "checked" : ""}>
        <span>
          <code>${this.escape(entity.entity_id)}</code>
          <small>${this.escape(scopes.join(", ") || "referenced")} ${ref ? `from ${this.escape(ref.view)} / ${this.escape(ref.card_type)}` : ""}</small>
          ${canAct ? `<small><input type="checkbox" data-export-action-entity="${this.escape(entity.entity_id)}" ${actionChecked ? "checked" : ""} ${entity.selected ? "" : "disabled"}> allow controls</small>` : ""}
        </span>
      </label>`;
  }
  canControlEntity(entityId) {
    return !["sensor", "binary_sensor"].includes(entityId.split(".")[0]);
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
    this._exportShareUrl = "";
    this._selectedEntities = new Set(result.entities.filter((e) => e.selected).map((e) => e.entity_id));
    this._selectedActionEntities = /* @__PURE__ */ new Set();
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
    if (!checked) this._selectedActionEntities.delete(entityId);
    if (this._exportResult) {
      this._exportResult.entities = this._exportResult.entities.map((e) => e.entity_id === entityId ? { ...e, selected: checked } : e);
    }
    this._exportShareUrl = "";
    this.render(this._lastState);
  }
  toggleActionEntity(entityId, checked) {
    if (checked) this._selectedActionEntities.add(entityId);
    else this._selectedActionEntities.delete(entityId);
    this._exportShareUrl = "";
    if (this._lastState) this.render(this._lastState);
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
      this.flash(`Exported ${name}.zip`, "ok");
    } catch (err) {
      this._exportError = `Could not generate brief: ${err.message || err}`;
    } finally {
      this._exportLoading = false;
      this.render(this._lastState);
    }
  }
  async buildDashboardShareLink() {
    if (!this._exportResult) return;
    const maxClaims = parseShareClaims(this._exportShareUses);
    if (maxClaims === null) {
      this._exportError = `Allowed link uses must be a whole number from 1 to ${SHARE_MAX_CLAIMS}.`;
      this.render(this._lastState);
      return;
    }
    this._exportLoading = true;
    this._exportError = "";
    this._exportShareUrl = "";
    this.render(this._lastState);
    try {
      const name = this.exportShareName(this._exportResult);
      const response = await this._hass.connection.sendMessagePromise({
        type: "varco/create_share",
        name,
        max_claims: maxClaims,
        manifest: { ...this.previewManifest(this._exportResult), name, version: "0.1.0" }
      });
      this._exportShareUrl = this.localShareUrl(response.share_url);
      this.flash("Share link minted", "ok");
    } catch (err) {
      this._exportError = `Could not build share link: ${err.message || err}`;
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
  // ---------- inline confirm (delete) ----------
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
  // ---------- chrome fragments ----------
  topBar(info) {
    const connected = !!info.relay?.connected;
    const brandSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="5" height="18" rx="2" fill="var(--accent)"/><rect x="16" y="3" width="5" height="18" rx="2" fill="var(--text-3)"/><circle cx="12" cy="12" r="2.6" fill="var(--accent)"/></svg>';
    return `
      <div class="vbar">
        <div class="vbrand">
          ${brandSvg}
          <span class="name">Varco <span class="sub">Authority</span></span>
          <span class="vchip ${connected ? "ok" : "off"}"><span class="dot"></span>${connected ? "Relay connected" : "Relay offline"}</span>
        </div>
      </div>`;
  }
  summaryHeader(info) {
    const connected = !!info.relay?.connected;
    const bridge = info.relay?.bridge_url || "unknown";
    const last = info.relay?.last_connected ? this.formatTime(info.relay.last_connected) : "never";
    const tabs = ANCHORS.map(([id, label]) => `<button class="atab" data-anchor="${id}">${label}</button>`).join("");
    return `
      <div class="summary">
        <div class="summary-top">
          <div class="summary-id">
            <div class="lab">Authority</div>
            <div class="copy" data-copy-auth>
              <span class="val mono">${this.escape(this.shortKey(info.authority_id))}</span>
              <span class="act">${this._authCopied ? "COPIED" : "COPY"}</span>
            </div>
          </div>
          <div class="summary-relay" data-relay-status="${connected ? "connected" : "disconnected"}">
            <div class="line"><span class="dot" style="background:${connected ? "var(--accent)" : "var(--red)"}"></span>${connected ? "Relay connected" : "Relay offline"}</div>
            <div class="meta mono"><span data-relay-bridge-url>${this.escape(bridge)}</span> &middot; last <span data-relay-last-connected>${this.escape(last)}</span></div>
          </div>
        </div>
        <div class="anchor-tabs">${tabs}</div>
      </div>`;
  }
  revokeModal() {
    if (!this._confirmRevoke) return "";
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
  renderToast() {
    const host = this.querySelector("[data-toast-host]");
    if (!host) return;
    if (!this._toast) {
      host.innerHTML = "";
      return;
    }
    const toneFg = { ok: "var(--accent)", danger: "var(--red)", warn: "var(--amber)" };
    const icon = { ok: "\u2713", danger: "\u2715", warn: "!" };
    const t = this._toast;
    host.innerHTML = `
      <div class="toast" style="border-color:color-mix(in srgb, ${toneFg[t.tone]} 40%, transparent)">
        <span class="ico" style="background:${toneFg[t.tone]}">${icon[t.tone]}</span>
        <span class="msg">${this.escape(t.msg)}</span>
      </div>`;
  }
  // ---------- render ----------
  render(state) {
    if (state) this._lastState = state;
    if (!this._lastState || this._lastState.loading) {
      this.innerHTML = `${FONTS}<div class="varco-root">${styles()}<div class="wrap" style="padding:40px 22px">Loading Varco\u2026</div></div>`;
      return;
    }
    const current = this._lastState;
    const pending = current.requests.filter((r) => r.status === "pending");
    const activeCount = current.grants.filter((g) => this.grantStatus(g) === "active").length;
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

          ${pending.length ? `
          <section id="sec-requests">
            <div class="sec-eyebrow">Consent</div>
            <div class="sec-title">Pending access requests <span class="badge amber mono">${pending.length}</span></div>
            ${pending.map((r) => this.requestCard(r)).join("")}
          </section>` : ""}

          ${current.grants.length ? `
          <section id="sec-grants">
            <div class="sec-eyebrow">Access</div>
            <div class="sec-title">Grants <span class="badge muted mono">${activeCount} active</span></div>
              <div class="controls">
                <div class="search">${icons.search}<input type="search" data-grant-search placeholder="Search by consumer name" value="${this.escape(this._grantSearch)}"></div>
                <div class="seg" data-grant-status-seg>
                  ${["all", "active", "revoked", "expired"].map((v) => `<button data-grant-status="${v}" class="${(this._grantStatusFilter || "all") === v ? "sel" : ""}">${v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join("")}
                </div>
              </div>
            ${current.grants.map((g) => this.grantCard(g)).join("")}
            <p class="empty" data-grant-empty style="display:none">No grants match the current filter.</p>
          </section>` : ""}

          ${this.timelineItems(current).length ? `
          <section id="sec-activity">
            <div class="sec-eyebrow">Audit</div>
            <div class="sec-title">Timeline</div>
            ${this.auditSection()}
          </section>` : ""}

          <section id="sec-export">
            <div class="sec-eyebrow">Handoff</div>
            <div class="sec-title">Dashboard export and build</div>
            <div class="sec-lead">Export a coding-agent brief, or build a read-only share link from the same harvested dashboard entities.</div>
            ${this.dashboardExportSection()}
          </section>

        </div>
        ${this.revokeModal()}
        <div data-toast-host></div>
      </div>`;
    this.renderToast();
    this.wireEvents();
  }
  wireEvents() {
    const copyAuth = this.querySelector("[data-copy-auth]");
    if (copyAuth) copyAuth.onclick = () => {
      this.copyText(this._lastState.info.authority_id);
      this._authCopied = true;
      const act = copyAuth.querySelector(".act");
      if (act) act.textContent = "COPIED";
      window.setTimeout(() => {
        this._authCopied = false;
        const a = copyAuth.querySelector(".act");
        if (a) a.textContent = "COPY";
      }, 1500);
    };
    this.querySelectorAll("[data-anchor]").forEach((el) => {
      el.onclick = () => {
        this.querySelector(`#${el.dataset.anchor}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
    this.wireActivity();
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
        if (boxes.length > 0) {
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
          if (!customVal || Number.isNaN(new Date(customVal).getTime())) {
            const summary = this.querySelector(`[data-approve-summary="${CSS.escape(requestId)}"]`);
            if (summary) this.showFieldError(summary, "Please set a date/time for the custom expiry.");
            return;
          }
          payload.expires_at = new Date(customVal).toISOString();
        } else if (expiry.value !== "none") {
          payload.expires_at = new Date(Date.now() + Number(expiry.value)).toISOString();
        }
        const name = this._lastState?.requests.find((r) => r.request_id === requestId)?.manifest?.name || "consumer";
        void this.call("varco/approve_request", payload).then(() => this.flash(`Access granted to ${name}`, "ok"));
      };
    });
    this.querySelectorAll("[data-reject]").forEach((el) => {
      el.onclick = () => void this.call("varco/reject_request", { request_id: el.dataset.reject }).then(() => this.flash("Request rejected", "danger"));
    });
    this.querySelectorAll("[data-revoke]").forEach((el) => {
      el.onclick = () => {
        this._confirmRevoke = { grantId: el.dataset.revoke, name: el.dataset.name || "this consumer" };
        this.render(this._lastState);
      };
    });
    this.querySelectorAll("[data-delete-grant]").forEach((el) => {
      el.onclick = () => this.showInlineConfirm(el, {
        kind: "delete",
        message: `Delete grant record for ${el.dataset.name}? This also removes active access for that consumer.`,
        confirmLabel: "Delete grant record",
        onConfirm: () => void this.call("varco/delete_grant", { grant_id: el.dataset.deleteGrant }).then(() => this.flash("Grant record deleted", "warn"))
      });
    });
    this.querySelectorAll("[data-revoke-cancel]").forEach((el) => {
      el.onclick = (ev) => {
        if (ev.target !== el) return;
        this._confirmRevoke = null;
        this.render(this._lastState);
      };
    });
    const revokeStop = this.querySelector("[data-revoke-stop]");
    if (revokeStop) revokeStop.onclick = (ev) => ev.stopPropagation();
    const revokeConfirm = this.querySelector("[data-revoke-confirm]");
    if (revokeConfirm && this._confirmRevoke) {
      const { grantId, name } = this._confirmRevoke;
      revokeConfirm.onclick = () => {
        this._confirmRevoke = null;
        void this.call("varco/revoke_grant", { grant_id: grantId }).then(() => this.flash(`Access revoked for ${name}`, "danger"));
      };
    }
    this.querySelectorAll("[data-rf-type]").forEach((sel) => {
      sel.onchange = () => {
        const grantId = sel.dataset.rfType;
        const fieldsEl = this.querySelector(`[data-rf-fields="${CSS.escape(grantId)}"]`);
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
    this.querySelectorAll("[data-grant-status]").forEach((el) => {
      el.onclick = () => {
        this._grantStatusFilter = el.dataset.grantStatus;
        this.querySelectorAll("[data-grant-status]").forEach((b) => b.classList.toggle("sel", b.dataset.grantStatus === this._grantStatusFilter));
        this.applyGrantFilter();
      };
    });
    const shareEntity = this.querySelector("[data-share-entity]");
    if (shareEntity) {
      shareEntity.oninput = () => {
        this._shareEntityId = shareEntity.value;
        this.updateShareSuggestions(shareEntity);
      };
      shareEntity.onfocus = () => this.updateShareSuggestions(shareEntity);
    }
    const shareName = this.querySelector("[data-share-name]");
    if (shareName) shareName.oninput = () => {
      this._shareName = shareName.value;
    };
    const shareClaims = this.querySelector("[data-share-claims]");
    if (shareClaims) shareClaims.oninput = () => {
      this._shareClaims = shareClaims.value;
    };
    const createShare = this.querySelector("[data-create-entity-share]");
    if (createShare) createShare.onclick = () => void this.createEntityShare();
    const copyShare = this.querySelector("[data-copy-share-link]");
    if (copyShare) copyShare.onclick = () => {
      this.copyText(this._shareUrl);
      this.flash("Link copied", "ok");
    };
    const dashboardSelect = this.querySelector("[data-dashboard-select]");
    if (dashboardSelect) dashboardSelect.onchange = () => void this.pickDashboard(dashboardSelect.value);
    const viewSelect = this.querySelector("[data-view-select]");
    if (viewSelect) viewSelect.onchange = () => void this.pickView(viewSelect.value);
    this.querySelectorAll("[data-export-entity]").forEach((el) => {
      el.onchange = () => this.toggleEntity(el.dataset.exportEntity, el.checked);
    });
    this.querySelectorAll("[data-export-action-entity]").forEach((el) => {
      el.onchange = () => this.toggleActionEntity(el.dataset.exportActionEntity, el.checked);
    });
    const exportShareUses = this.querySelector("[data-export-share-uses]");
    if (exportShareUses) exportShareUses.oninput = () => {
      this._exportShareUses = exportShareUses.value;
    };
    const download = this.querySelector("[data-download-brief]");
    if (download) download.onclick = () => void this.downloadDashboardBrief();
    const buildShare = this.querySelector("[data-build-share-link]");
    if (buildShare) buildShare.onclick = () => void this.buildDashboardShareLink();
    const copyExportShare = this.querySelector("[data-copy-export-share-link]");
    if (copyExportShare) copyExportShare.onclick = () => {
      this.copyText(this._exportShareUrl);
      this.flash("Link copied", "ok");
    };
    this.applyGrantFilter();
  }
  // Rewire just the activity controls after an in-place timeline re-render.
  wireActivity() {
    this.querySelectorAll("[data-activity-filter]").forEach((el) => {
      el.onclick = () => {
        this._activityFilter = el.dataset.activityFilter || "all";
        const card = this.querySelector(".audit-card");
        if (card) card.outerHTML = this.auditSection();
        this.wireActivity();
      };
    });
    this.querySelectorAll("[data-timeline-target]").forEach((el) => {
      el.onclick = () => this.focusTimelineTarget(el.dataset.timelineTarget || "");
    });
  }
  focusTimelineTarget(target) {
    const [kind, id] = target.split(":");
    if (!id) return;
    const selector = kind === "request" ? `[data-request-card="${CSS.escape(id)}"]` : `[data-grant-card="${CSS.escape(id)}"]`;
    const fallback = `[data-request-card="${CSS.escape(id)}"]`;
    const el = this.querySelector(selector) || this.querySelector(fallback);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    window.setTimeout(() => el.classList.remove("flash"), 1600);
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
  SHARE_MAX_CLAIMS,
  VarcoPanel,
  parseShareClaims
};
