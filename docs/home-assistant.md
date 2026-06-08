# Home Assistant integration

This guide is for the Home Assistant owner who wants to make a small, controlled part of Home Assistant available to an external Varco consumer.

Varco does not give the consumer a Home Assistant token. Home Assistant remains the Authority: it approves access, stores grants, validates every request, and executes Home Assistant operations locally.

## Requirements

- A Home Assistant installation where you can install a custom integration.
- Outbound HTTPS/WebSocket access from Home Assistant to the bridge.
- The `custom_components/varco` directory from this repository.

The integration declares this Python requirement in `custom_components/varco/manifest.json`:

- `cryptography>=42.0.0`
- `aiortc>=1.9.0` (WebRTC peer connection for opportunistic P2P transport)

Home Assistant installs declared custom integration requirements during setup, including `aiortc`. WebRTC support is opportunistic: if `aiortc` fails to import at runtime, Varco logs a warning and keeps relay transport working.

## Install manually

1. Copy the integration into your Home Assistant config directory:

   ```text
   config/custom_components/varco
   ```

   The final path should contain files such as:

   ```text
   config/custom_components/varco/manifest.json
   config/custom_components/varco/__init__.py
   config/custom_components/varco/frontend/panel.js
   ```

2. Restart Home Assistant.
3. Open **Settings -> Devices & services -> Add integration**.
4. Search for **Varco** and add it.
5. Keep the default bridge unless you operate a different bridge:

   ```text
   wss://varco-bridge.vekexasia.workers.dev
   ```

6. Submit the config flow.

Only one Varco Authority can be configured in a Home Assistant instance.

## Find the Authority ID

After setup, open the **Varco** sidebar panel or browse directly to:

```text
/varco
```

The panel shows:

- **Authority ID**: the public identifier that consumers need.
- **Relay** status: whether Home Assistant is connected to the bridge.
- pending access requests.
- existing grants.

Copy the Authority ID exactly. It is the stable public key/fingerprint for this Home Assistant Authority. If the Authority key changes, consumers must pair again.

## Pair a consumer

1. Paste the Authority ID into the consumer app.
2. The consumer sends an access request with a self-declared manifest.
3. Home Assistant creates a persistent notification and shows the request in the Varco panel.
4. Compare the pairing code shown by the consumer with the pairing code shown in Home Assistant.
5. Review the requested permissions.
6. Click **Approve** or **Reject**.

In the current MVP, approval is atomic: the owner approves or rejects the whole manifest. The panel does not trim individual scopes. If a consumer asks for too much, reject it and have the consumer request a smaller manifest.

## Export a dashboard brief for a coding agent

The Varco panel can turn an existing Lovelace dashboard or single view into a local agent brief zip. This is a bootstrap helper only: it creates a manifest blueprint, not a grant, and no Home Assistant token leaves Home Assistant.

1. Open `/varco`.
2. In **Dashboard brief export**, choose a Lovelace dashboard.
3. Optionally choose a single view instead of the whole dashboard.
4. Review the harvested entities grouped by the referencing view/card and uncheck anything the consumer should not use.
5. Click **Download agent brief zip**.

The zip contains:

- `brief.md`: a self-contained instruction brief for a coding agent, including the manifest, entity catalog, unresolved dashboard warnings, and a ready-to-run `@varco/client` bootstrap with the current Authority ID and bridge URL.
- `manifest.json`: the canonical read-only manifest blueprint.

The export harvests `entity:` and `entities:` references into `read_entities` and `subscriptions`, `history-graph` entities into `history`, and camera entities from picture/camera cards into `camera_snapshots`. It does not emit `actions`; the brief tells the coding agent to ask which entities need write or history elevation before changing the manifest.

The entity catalog includes static metadata and a trimmed point-in-time state snapshot. The downloaded zip may contain real state values, so treat it as private. Dynamic cards such as custom cards, `auto-entities`, templates, and area/tile/weather cards are listed as warnings instead of being silently resolved or dropped.

## Revoke or delete a grant
Open `/varco` and review the grant card. The card shows the consumer name, version, consumer key, grant ID, original request, creation date, status, and approved scopes.

Use **Revoke access** to keep the grant record but disable it. Revocation marks the grant as revoked inside Home Assistant. Active sessions for that consumer are marked closed and subsequent messages are rejected by the Authority.

Use **Delete grant record** to remove the stored grant from the panel. Deleting an active grant also closes active sessions and future authentication fails because no grant exists.

## Service fallback

Varco also exposes Home Assistant services:

```yaml
service: varco.approve_request
data:
  request_id: "REQUEST_ID"
```

```yaml
service: varco.reject_request
data:
  request_id: "REQUEST_ID"
```

```yaml
service: varco.revoke_grant
data:
  grant_id: "GRANT_ID"
```

```yaml
service: varco.delete_grant
data:
  grant_id: "GRANT_ID"
```

Use the panel for normal operation. Use services for automation, scripts, or recovery.

## What the consumer can request

The consumer manifest may ask for:

- `read_entities`: entity state snapshots.
- `subscriptions`: live state updates.
- `history`: recorder history queries.
- `camera_snapshots`: camera snapshot retrieval.
- `actions`: Home Assistant service calls.

The Authority validates every request against the approved manifest. The bridge and consumer are not trusted for permission checks.

## Scope examples

Read and subscription scopes can name exact entities:

```json
{
  "read_entities": ["sensor.temperature"],
  "subscriptions": ["sensor.temperature"]
}
```

They can also use domain wildcards supported by the current implementation:

```json
{
  "read_entities": ["sensor.*"],
  "subscriptions": ["sensor.*"]
}
```

Action scopes use one of these forms:

```text
light.turn_on@light.kitchen
light.*
*@cover.awning
```

Meaning:

- `light.turn_on@light.kitchen`: allow only one service on one entity.
- `light.*`: allow any service in the `light` domain.
- `*@cover.awning`: allow any service targeting one entity.

## Privacy and audit behavior

Varco stores access requests, grants, and a bounded audit log in Home Assistant storage.

Audit events include events such as:

- access request received.
- request approved or rejected.
- consumer connected.
- grant revoked.
- service call executed.
- permission error.
- relevant session errors.

Audit events intentionally avoid logging sensitive Home Assistant state payloads, camera images, and history payloads.

## Troubleshooting

### The Varco panel does not appear

- Confirm the integration directory is at `config/custom_components/varco`.
- Restart Home Assistant after copying the integration.
- Confirm the integration was added from **Settings -> Devices & services**.

### Relay is disconnected

- Confirm Home Assistant can make outbound WebSocket connections.
- Confirm the configured bridge URL starts with `wss://`.
- Confirm no second Home Assistant instance is using the same Authority ID. The bridge rejects duplicate active authorities for the same ID.
- Check Home Assistant logs for `Varco relay disconnected`.

### Consumer says the Authority is offline

- Confirm the Varco panel says the relay is connected.
- Confirm the consumer Authority ID exactly matches the panel value.
- Check bridge presence in a browser:

  ```text
  https://varco-bridge.vekexasia.workers.dev/presence/AUTHORITY_ID
  ```

### WebRTC does not connect

WebRTC is opportunistic. Relay transport is the required baseline. If WebRTC setup fails, the client should continue over relay.

Consumer developers can force relay-only mode with:

```ts
createVarcoClient({
  // ...
  webrtc: false,
});
```
