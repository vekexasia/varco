# Varco protocol notes

This document describes the implemented Varco MVP at a high level. It is intended for maintainers, consumer developers, and LLM agents that need a compact model of how the pieces fit together.

## Actors

| Actor | Description |
|---|---|
| Owner | The person who owns the Home Assistant instance and approves, rejects, or revokes access. |
| Consumer | External app, dashboard, script, or browser client. It has its own keypair and self-declared manifest. |
| Authority | The Home Assistant custom integration. It approves grants, enforces policy, executes Home Assistant calls, and stores audit data. |
| Bridge | Cloudflare Worker plus Durable Object relay. It routes encrypted envelopes and does not enforce Home Assistant permissions. |

## Repository map

| Path | Role |
|---|---|
| `custom_components/varco/authority.py` | Home Assistant Authority data-plane handlers and policy enforcement. |
| `custom_components/varco/relay.py` | Outbound Authority connection to the bridge and encrypted session handling. |
| `custom_components/varco/policy.py` | Scope matching for entities and actions. |
| `custom_components/varco/storage.py` | Access request, grant, and audit storage. |
| `custom_components/varco/websocket_api.py` | Admin WebSocket API used by the `/varco` panel. |
| `custom_components/varco/frontend/panel.js` | Home Assistant admin panel. |
| `bridge/src/index.ts` | Worker entrypoint, Durable Object room, relay routing, bridge auth, limits. |
| `packages/client/src/client.ts` | Public TypeScript client API. |
| `packages/client/src/transport.ts` | Browser relay transport and encrypted session. |
| `packages/client/src/identity.ts` | Consumer keypair and request signatures. |

## Bridge endpoints

Default bridge origin:

```text
https://varco-bridge.vekexasia.workers.dev
```

Implemented endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /` | Plain text bridge identity response. |
| `GET /health` or `/healthz` | JSON health check. |
| `GET /presence/{authorityId}` | JSON presence check for an Authority room. |
| `WebSocket /authority/{authorityId}` | Home Assistant Authority outbound relay connection. |
| `WebSocket /consumer/{authorityId}` | Consumer relay connection. |

The bridge accepts one active Authority socket per Authority ID. Duplicate Authority connections are closed.

## Pairing and grant flow

1. Home Assistant creates or loads an Authority keypair during config flow.
2. The Authority opens an outbound WebSocket to `/authority/{authorityId}`.
3. The bridge sends a challenge.
4. The Authority signs the challenge with its private key.
5. A consumer connects to `/consumer/{authorityId}`.
6. Consumer and Authority establish an encrypted session through the relay.
7. The consumer sends `access_request` with:
   - `consumer_pk`.
   - `manifest`.
   - `nonce`.
   - signature over the nonce and manifest digest.
8. The Authority verifies the signature, stores a pending request, creates a pairing code, and notifies the owner.
9. The owner approves or rejects the full request in Home Assistant.
10. Approval creates a grant bound to `consumer_pk`.
11. Later sessions authenticate by signing a challenge with the same consumer key.
12. Every data-plane message is checked against the current grant.

## Encryption boundaries

The bridge is not trusted with application plaintext.

Current implemented layers:

- The bridge authenticates the Authority WebSocket with an Ed25519 challenge signature.
- Consumer and Authority establish a secure session over relay using ECDH and AES-GCM.
- The Authority signs the server hello so the consumer can verify it is talking to the intended Authority ID.
- Application messages are encrypted before the bridge relays them.

The bridge can still observe metadata such as:

- Authority ID.
- connection timing.
- session counts.
- message sizes.
- rate-limit events.

The bridge should not see:

- entity state payloads.
- service call data.
- history data.
- camera snapshots.
- manifest contents after secure-session setup.

## Application messages

Messages handled by the Authority:

| Message type | Request fields | Response | Scope checked |
|---|---|---|---|
| `access_request` | `consumer_pk`, `manifest`, `nonce`, `signature` | `access_request_pending` | Signature only; creates pending request. |
| `authenticate` | `consumer_pk`, `nonce`, `signature` | `authenticated` | Active grant for consumer key. |
| `get_states` | `entity_ids` | `states` | `read_entities`. |
| `subscribe_states` | `entity_ids` | `state_snapshot` then `state_delta` events | `subscriptions` plus `read_entities`. |
| `unsubscribe_states` | `subscription_id` | `unsubscribed` | Authenticated session. |
| `history_query` | `entity_ids`, optional range fields | `history_result` | `history`. |
| `camera_snapshot` | `entity_id` | `camera_snapshot` | `camera_snapshots`. |
| `call_service` | `domain`, `service`, `service_data`, `target` | `service_called` | `actions`. |
| `webrtc_offer` | SDP offer | `webrtc_answer` or `webrtc_unavailable` | Active grant. |
| `webrtc_ice` | ICE data | `webrtc_ice_ack` or `webrtc_unavailable` | Active grant. |

Errors use:

```json
{
  "type": "error",
  "request_id": "optional request id",
  "code": "permission_denied",
  "message": "Entity not allowed"
}
```

Known error codes include:

- `bad_signature`
- `not_authorized`
- `not_authenticated`
- `grant_revoked`
- `permission_denied`
- `unknown_message`
- `session_error`

## Scope semantics

Entity scopes are evaluated by `custom_components/varco/policy.py`.

Allowed entity patterns:

```text
sensor.temperature
sensor.*
*
```

Action scopes are evaluated against service calls:

```text
light.turn_on@light.kitchen
light.*
*@light.kitchen
```

The Authority is the only permission-enforcement point. Consumers should request small scopes, but the Authority must continue to reject out-of-scope messages even from a modified or malicious consumer.

## Runtime subscriptions

A grant defines the maximum allowed scope. A runtime subscription defines the current subset of entities the consumer wants to observe.

Flow:

1. Consumer sends `subscribe_states` with entity IDs.
2. Authority validates every entity.
3. Authority stores a runtime subscription for that session.
4. Authority returns a required initial `state_snapshot`.
5. Home Assistant state changes produce `state_delta` events for matching subscriptions.
6. Consumer sends `unsubscribe_states` to remove the runtime subscription.

## WebRTC behavior

WebRTC is opportunistic. Relay transport is the required baseline.

Rules:

- Consumers must work completely over relay.
- WebRTC uses the same application protocol and same Authority enforcement path.
- If WebRTC setup fails, the client falls back to relay.
- Consumers can disable WebRTC with `webrtc: false`.

## Security invariants for maintainers

Do not break these invariants:

1. Never give a Home Assistant long-lived access token to a consumer.
2. Never trust the bridge for permission checks.
3. Never trust the consumer manifest after approval without checking the stored grant.
4. Enforce grant scopes on every data-plane request.
5. Keep revocation authoritative in Home Assistant storage.
6. Do not log Home Assistant state payloads, camera bodies, or history payloads in audit events.
7. Keep relay as a fully working fallback even when WebRTC exists.
