# Varco agent guide

This file is for LLM coding agents working in this repository. Keep all user-facing documentation in English.

## Project summary

Varco is a relay-first access protocol for Home Assistant consumers. The consumer never receives a Home Assistant token. Home Assistant stays behind an outbound WebSocket relay and acts as the Authority for consent, grants, policy enforcement, Home Assistant service calls, and audit.

## Read first

Before changing behavior, read:

1. `README.md`
2. `docs/home-assistant.md`
3. `docs/consumer-integration.md`
4. `docs/protocol.md`
5. The specific source files involved in the change.

`PRD.md` contains product notes and may lag behind implementation. Do not edit it unless the user explicitly asks for PRD changes.

## Main paths

- `custom_components/varco/`: Home Assistant custom integration.
- `custom_components/varco/authority.py`: data-plane message handling and grant enforcement.
- `custom_components/varco/policy.py`: scope matching.
- `custom_components/varco/relay.py`: outbound relay connection and encrypted message routing.
- `custom_components/varco/websocket_api.py`: admin WebSocket commands for the Home Assistant panel.
- `custom_components/varco/frontend/panel.js`: Home Assistant panel at `/varco`.
- `bridge/`: Cloudflare Worker and Durable Object opaque bridge.
- `packages/client/`: browser TypeScript client.
- `examples/consumer-dashboard/`: minimal consumer dashboard.
- `examples/gazzetta-energy-showcase/`: read-only energy showcase.
- `tests/`: Python Authority tests.

## Non-negotiable invariants

- Do not give Home Assistant tokens to consumers.
- Do not require inbound public access to Home Assistant for normal Varco traffic.
- Do not trust the bridge with application plaintext or permission decisions.
- Do not trust the consumer for permission decisions.
- Enforce the stored grant on every data-plane message.
- Keep revocation effective for active and future sessions.
- Do not log entity states, camera snapshots, history payloads, or sensitive service data in audit logs.
- Keep relay transport working even when WebRTC is available.

## Documentation rules

- Documentation must be in English.
- Prefer concrete Home Assistant and TypeScript examples.
- Keep LLM-facing docs explicit: name files, functions, message types, scope fields, and commands.
- If behavior is not implemented, label it as future work or omit it.
- Do not claim npm publication, HACS availability, production readiness, or self-hosted bridge support unless the repository implements and documents it.

## Development commands

Run the smallest relevant command first, then the broader suite when appropriate:

```bash
npm --workspace packages/client run test
npm --workspace bridge run test
pytest -q tests
npm test
npm run build
npm run check
```

## Implementation notes

- Home Assistant stores Varco data through `custom_components/varco/storage.py` under the integration storage key.
- Access approval is currently atomic: approve or reject the full manifest.
- Consumer identity is stored by `@varco/client` in browser storage by default.
- Action scope syntax is `domain.service@entity_id`, `domain.*`, or `*@entity_id`.
- Entity scope syntax supports exact entity IDs, `domain.*`, and `*` in policy checks.
- WebRTC is opportunistic and must fall back to relay.

## Safe change checklist

Before reporting completion:

1. Verify the docs still match the code path you changed.
2. Run relevant tests or state exactly what was not run.
3. Check `git status --short` and avoid mixing unrelated existing changes into your summary.
