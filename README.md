# Varco

Varco is a relay-first access protocol for Home Assistant consumers. The consumer never receives a Home Assistant token and Home Assistant stays behind an outbound WebSocket relay.

## Layout

- `custom_components/varco`: Home Assistant Authority integration, consent storage, grant enforcement, audit, panel and services.
- `bridge/`: Cloudflare Worker/Durable Object opaque bridge.
- `packages/client`: browser TypeScript client (`@varco/client`).
- `examples/consumer-dashboard`: minimal dashboard consumer.
- `tests/`: Python authority tests.

## Verified deployment

- Bridge: `https://varco-bridge.vekexasia.workers.dev`
- Demo dashboard: `https://master.varco-dashboard-5qy.pages.dev`
- HA static demo: `http://192.168.1.47:8123/local/varco/index.html`

## Commands

```bash
npm test
npm run build
pytest -q tests
```

HA services:

- `varco.approve_request`
- `varco.reject_request`
- `varco.revoke_grant`

HA panel path: `/varco`.
