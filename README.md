![Varco header](docs/website/public/assets/header.png)

# Varco

Varco lets external apps use Home Assistant without receiving a Home Assistant token and without requiring Home Assistant to be publicly reachable.

A consumer asks for a narrow grant. The Home Assistant owner approves or rejects it in the Varco panel. Home Assistant then enforces that stored grant on every read, subscription, history query, camera snapshot, and service call.

## Start

> **Deploy in 10 minutes:** [vekexasia.github.io/varco/getting-started/quickstart](https://vekexasia.github.io/varco/getting-started/quickstart/)

- Home Assistant integration: install through HACS as a custom repository (`https://github.com/vekexasia/varco`) or copy `custom_components/varco`.
- Browser client: `npm install @varco/client`.
- Bridge: use the default public bridge (`wss://varco-bridge.andreabaccega.com`) unless you need to self-host.

Documentation: [vekexasia.github.io/varco](https://vekexasia.github.io/varco/). Source lives in [`docs/website`](docs/website).

## Core guarantees

- Consumers never receive a Home Assistant long-lived access token.
- Home Assistant does not need an inbound public URL for Varco traffic.
- Grants are bound to a consumer public key and stored inside Home Assistant.
- Home Assistant remains the Authority for consent, grants, policy checks, service calls, and audit.
- The bridge routes encrypted envelopes and does not make permission decisions.
- Revocation is enforced by the Authority for active and future sessions.

## Try the demo

Open the Gazzetta-style energy dashboard: [varco-demo.andreabaccega.com](https://varco-demo.andreabaccega.com/).
Open the guest-stay dashboard: [varco-guest-demo.andreabaccega.com](https://varco-guest-demo.andreabaccega.com/).

These demos are browser-only consumers backed by a synthetic Home Assistant showcase instance. They connect through Varco with pre-approved grants scoped to the entities and actions used by each dashboard.


## Development

```bash
npm install
npm test
npm run build
npm run check
pytest -q tests
```

Package-level commands:

```bash
npm --workspace packages/client run test
npm --workspace bridge run test
npm --workspace examples/consumer-dashboard run build
npm run dev:ha:gazzetta-demo
npm run dev:ha:guest-stay-demo
```

Varco is an early MVP/prototype. The core pieces in this repository are implemented and covered by tests, but the API and grant model may still change.
