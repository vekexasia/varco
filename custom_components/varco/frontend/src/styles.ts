// Visual design system for the Varco Authority panel ("Briefing" layout).
// A self-contained console aesthetic (not the HA default) that follows the
// browser's prefers-color-scheme, Hanken Grotesk for UI and JetBrains Mono for
// IDs, hashes and timestamps. Tokens are scoped to .varco-root (the panel
// renders into light DOM, so :host would never match).

export const styles = (): string => `
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
    .sec > summary::before { content: '›'; font-size: 18px; color: var(--text-3); transition: transform .15s ease; display: inline-block; }
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
