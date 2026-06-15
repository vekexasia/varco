export function renderShareShell(shareCode: string): string {
  const code = escapeHtml(shareCode);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Varco share</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { width: min(720px, calc(100vw - 32px)); }
    .card { border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 20px; padding: 24px; box-shadow: 0 18px 60px color-mix(in srgb, CanvasText 10%, transparent); }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 6vw, 48px); letter-spacing: -0.04em; }
    p { line-height: 1.5; }
    #app { display: grid; gap: 14px; }
    .muted { color: color-mix(in srgb, CanvasText 62%, transparent); }
    .error { color: #d93025; }
    .varco-share-cards { display: grid; gap: 12px; }
    .varco-card { border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); border-radius: 16px; padding: 16px; }
    .varco-card header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
    .varco-card h2 { margin: 0; font-size: 18px; }
    .varco-card p { margin: 0; }
    .varco-card__controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    button { border: 0; border-radius: 999px; padding: 10px 14px; background: #2563eb; color: white; font: inherit; cursor: pointer; }
    input, select { font: inherit; }
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
    function setStatus(message) { app.innerHTML = '<h1>Varco share</h1><p class="muted"></p>'; app.querySelector('p').textContent = message; }
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
