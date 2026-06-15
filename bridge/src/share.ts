export function renderShareShell(shareCode: string): string {
  const code = escapeHtml(shareCode);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Varco share</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --accent: #2563eb; --line: color-mix(in srgb, CanvasText 12%, transparent); --soft: color-mix(in srgb, CanvasText 6%, transparent); --muted: color-mix(in srgb, CanvasText 58%, transparent); }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: Canvas; color: CanvasText; }
    main { width: min(560px, 100%); }
    .card { border: 1px solid var(--line); border-radius: 24px; padding: 28px; background: color-mix(in srgb, Canvas 92%, CanvasText 2%); box-shadow: 0 20px 70px color-mix(in srgb, CanvasText 9%, transparent); }
    h1 { margin: 0 0 4px; font-size: clamp(24px, 5vw, 34px); letter-spacing: -0.03em; font-weight: 650; }
    p { line-height: 1.5; margin: 0; }
    #app { display: grid; gap: 18px; }
    .muted { color: var(--muted); }
    .error { color: #d93025; }
    .varco-share-cards { display: grid; gap: 12px; }
    .varco-card { border: 1px solid var(--line); border-radius: 18px; padding: 18px; background: Canvas; transition: border-color .2s, box-shadow .2s; }
    .varco-card[data-active="true"] { border-color: color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent); }
    .varco-card__head { display: flex; align-items: center; gap: 10px; }
    .varco-card__dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: color-mix(in srgb, CanvasText 30%, transparent); transition: background .2s, box-shadow .2s; }
    .varco-card[data-active="true"] .varco-card__dot { background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
    .varco-card__title { margin: 0; font-size: 16px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .varco-card__state { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
    .varco-card__controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .varco-ctl__label { font-size: 12px; color: var(--muted); }
    .varco-ctl--btn { border: 0; border-radius: 999px; padding: 9px 16px; background: var(--soft); color: CanvasText; font: inherit; font-weight: 550; cursor: pointer; transition: background .15s, transform .05s; }
    .varco-ctl--btn:hover { background: color-mix(in srgb, CanvasText 12%, transparent); }
    .varco-ctl--btn:active { transform: scale(.97); }
    .varco-ctl--btn:disabled { opacity: .5; cursor: progress; }
    .varco-ctl--icon { display: inline-flex; align-items: center; justify-content: center; padding: 9px; width: 38px; height: 38px; }
    .varco-ctl--icon svg { display: block; }
    .varco-ctl--range, .varco-ctl--select { display: flex; flex-direction: column; gap: 6px; flex: 1 1 100%; }
    .varco-ctl__row { display: flex; align-items: center; gap: 12px; }
    .varco-ctl__row input[type=range] { flex: 1; accent-color: var(--accent); }
    .varco-ctl__value { font-size: 13px; color: CanvasText; font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
    .varco-ctl--toggle { display: inline-flex; align-items: center; }
    .varco-ctl--toggle input { appearance: none; width: 44px; height: 26px; border-radius: 999px; background: var(--soft); position: relative; cursor: pointer; transition: background .15s; }
    .varco-ctl--toggle input:checked { background: var(--accent); }
    .varco-ctl--toggle input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: Canvas; transition: transform .15s; }
    .varco-ctl--toggle input:checked::after { transform: translateX(18px); }
    .varco-ctl--toggle input:disabled { opacity: .5; cursor: progress; }
    select { font: inherit; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--line); background: Canvas; color: CanvasText; }
  </style>
</head>
<body>
  <main class="card" data-share-code="${code}">
    <div id="app">
      <h1>Varco share</h1>
      <p class="muted">Opening shared Home Assistant controls...</p>
    </div>
  </main>
  <script type="module">
    import { createVarcoClient, consumerIdentityFromPrivateKey, buildShareCards, renderShareCards, VarcoConnectionStrategy } from '/varco-client.js';

    const app = document.getElementById('app');
    const shareCode = document.querySelector('main').dataset.shareCode;
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const claimSecret = fragment.get('claim');
    const legacyPrivateKey = fragment.get('key') || (claimSecret ? '' : location.hash.slice(1));
    const authorityId = params.get('authority') || fragment.get('authority');
    const bridgeUrl = params.get('bridge') || fragment.get('bridge') || location.origin.replace(/^http/, 'ws');

    if (location.hash) history.replaceState(null, '', location.pathname + location.search);

    function fail(message) { app.innerHTML = '<h1>Varco share</h1><p class="error"></p>'; app.querySelector('p').textContent = message; }
    let ready = false;
    function setStatus(message) { if (ready) return; app.innerHTML = '<h1>Varco share</h1><p class="muted"></p>'; app.querySelector('p').textContent = message; }
    function scopedStorage(authority, share) {
      const prefix = 'varco.shareIdentity.v1.' + authority + '.' + share + '.';
      return {
        getItem: (key) => localStorage.getItem(prefix + key),
        setItem: (key, value) => localStorage.setItem(prefix + key, value),
        removeItem: (key) => localStorage.removeItem(prefix + key),
      };
    }

    if (!authorityId) fail('This share link is missing required authority data.');
    else {
      try {
        const storage = scopedStorage(authorityId, shareCode);
        let identity;
        if (legacyPrivateKey) {
          identity = consumerIdentityFromPrivateKey(legacyPrivateKey);
          storage.setItem('varco.consumerIdentity.v1', JSON.stringify({ privateKey: legacyPrivateKey, publicKey: identity.publicKey }));
        }
        const client = createVarcoClient({
          authorityId,
          bridgeUrl,
          ...(identity ? { identity } : { storage }),
          manifest: { name: 'Varco share', version: '1' },
          connectionStrategy: VarcoConnectionStrategy.Optimistic,
          onTransportStatus: (status) => setStatus(status.detail || 'Connecting...'),
        });
        if (claimSecret) await client.claimShare(shareCode, claimSecret);
        await client.connect();
        const grant = await client.getGrantInfo();
        const entities = Array.from(new Set([...(grant.manifest.read_entities || []), ...(grant.manifest.subscriptions || [])]));
        const states = entities.length ? await client.getStates(entities) : {};
        ready = true;
        app.innerHTML = '<h1></h1><div id="cards"></div>';
        app.querySelector('h1').textContent = grant.manifest.name || 'Varco share';
        const render = () => { app.querySelector('#cards').innerHTML = renderShareCards(buildShareCards(grant.manifest, states)); };
        render();
        app.addEventListener('click', async (event) => {
          const button = event.target.closest('button[data-service]');
          if (!button) return;
          button.disabled = true;
          try { await client.callService(button.dataset.domain, button.dataset.service, { entity_id: button.dataset.entity }); }
          finally { button.disabled = false; }
        });
        app.addEventListener('change', async (event) => {
          const toggle = event.target.closest('input[data-toggle]');
          if (!toggle) return;
          toggle.disabled = true;
          try { await client.callService(toggle.dataset.domain, toggle.checked ? 'turn_on' : 'turn_off', { entity_id: toggle.dataset.entity }); }
          catch { toggle.checked = !toggle.checked; }
          finally { toggle.disabled = false; }
        });
        app.addEventListener('input', (event) => {
          const range = event.target.closest('input[type=range][data-service]');
          if (!range) return;
          const out = range.parentElement.querySelector('.varco-ctl__value');
          if (out) out.textContent = range.value;
        });
        app.addEventListener('change', async (event) => {
          const input = event.target.closest('[data-service][data-value-key]');
          if (!input) return;
          input.disabled = true;
          try { await client.callService(input.dataset.domain, input.dataset.service, { entity_id: input.dataset.entity, [input.dataset.valueKey]: input.type === 'range' ? Number(input.value) : input.value }); }
          finally { input.disabled = false; }
        });
        if (entities.length) {
          await client.subscribeEntities(entities, (event) => {
            Object.assign(states, event.states || {});
            render();
          });
        }
      } catch (err) { fail(err?.message || String(err)); }
    }
  </script>
</body>
</html>`;
}

export function shareShellResponse(shareCode: string): Response {
  return new Response(renderShareShell(shareCode), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
