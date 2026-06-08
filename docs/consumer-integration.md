# Consumer integration guide

This guide is for developers building browser consumers for Varco, including external relay consumers and dashboards embedded inside Home Assistant.

A consumer is not a Home Assistant user. It has its own keypair, declares the Home Assistant capabilities it wants, requests owner approval, and then communicates through Varco after Home Assistant approves a grant.

## Install

Inside this repository, `@varco/client` is available as the `packages/client` workspace.

```bash
npm install
npm --workspace packages/client run build
```

Consumer examples depend on it through a local workspace file dependency:

```json
{
  "dependencies": {
    "@varco/client": "file:../../packages/client"
  }
}
```

When the package is published, external apps should install it as a normal npm dependency.

## Unified consumer client

Use `createVarcoConsumerClient()` when the same dashboard or consumer app should run both inside Home Assistant and outside Home Assistant.

Inside a Home Assistant custom card or panel, pass the explicit frontend `hass` object:

```ts
import { createVarcoConsumerClient } from "@varco/client";

const client = createVarcoConsumerClient({ hass });

await client.requestAccess();
await client.connect();
const states = await client.getStates(["sensor.temperature"]);
```

Local Home Assistant mode uses the already-authenticated frontend session. It does not request a Varco grant, does not pair through the relay, and does not enforce the manifest. `requestAccess()` returns an already-approved local result and `connect()` is a no-op. `getStates()` reads from `hass.states`, `callService()` calls `hass.callService()`, and `queryHistory()` calls the Home Assistant websocket command `history/history_during_period`. If Home Assistant rejects the history call, the client throws an error with code `local-history-unavailable`.

Custom cards receive a new `hass` object on each frontend update. Forward it to the client so local subscriptions can emit `state_delta` events:

```ts
client.updateHass(nextHass);
```

Outside Home Assistant, use the same entry point with relay options:

```ts
const client = createVarcoConsumerClient({
  authorityId: "PASTE_AUTHORITY_ID_FROM_HOME_ASSISTANT",
  bridgeUrl: "wss://varco-bridge.vekexasia.workers.dev",
  manifest,
  webrtc: true,
});
```

Mode selection is explicit: if `hass` is passed, local Home Assistant mode wins even when relay options are also present. If `hass` is not passed, the client uses the existing Varco relay path and optional WebRTC upgrade. In relay mode, omitting `manifest` requests an empty read-only manifest.

## Minimal relay client

Use `createVarcoClient()` when you specifically want the low-level Varco relay client.

```ts
import { createVarcoClient } from "@varco/client";

const client = createVarcoClient({
  authorityId: "PASTE_AUTHORITY_ID_FROM_HOME_ASSISTANT",
  bridgeUrl: "wss://varco-bridge.vekexasia.workers.dev",
  manifest: {
    name: "My dashboard",
    icon: "mdi:view-dashboard",
    version: "0.1.0",
    read_entities: ["sensor.temperature"],
    subscriptions: ["sensor.temperature"],
    history: [],
    camera_snapshots: [],
    actions: [],
  },
  warn: console.warn,
  onTransportStatus: (status) => {
    console.log(status.mode, status.detail);
  },
});
```

The relay client stores the consumer identity in `localStorage` by default. Clearing browser storage creates a new consumer identity and requires pairing again.

## Request access

Call `requestAccess()` before the first connection:

```ts
const access = await client.requestAccess();

console.log(access.request_id);
console.log(access.pairing_code);
console.log(access.status);
```

Show the pairing code to the user. The Home Assistant owner must compare it with the code shown in the Varco panel or persistent notification.

A request remains pending until the owner approves or rejects it in Home Assistant.

## Connect after approval

After approval:

```ts
await client.connect();
```

`connect()` authenticates the stored consumer key against the approved grant. If the grant does not exist or has been revoked, the Authority rejects the session.

## Read states

```ts
const states = await client.getStates(["sensor.temperature"]);

console.log(states["sensor.temperature"]?.state);
```

The Authority checks every requested entity against the approved `read_entities` scope.

## Subscribe to live state updates

```ts
const subscriptionId = await client.subscribeEntities(
  ["sensor.temperature"],
  (event) => {
    if (event.type === "state_snapshot") {
      console.log("initial", event.states);
    }

    if (event.type === "state_delta") {
      console.log("delta", event.states);
    }
  },
);

// Later:
await client.unsubscribe(subscriptionId);
```

A subscription returns an initial `state_snapshot` and then `state_delta` events for matching Home Assistant state changes.

The client warns if the same client instance opens a duplicate subscription with the same entity set.

## Query history

```ts
const end = new Date();
const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

const history = await client.queryHistory(["sensor.temperature"], {
  start_time: start.toISOString(),
  end_time: end.toISOString(),
});
```

The Authority checks the request against the approved `history` scope. History payloads are not logged by Varco audit events.

## Request a camera snapshot

```ts
const snapshot = await client.cameraSnapshot("camera.front_door");

const imageUrl = `data:${snapshot.contentType};base64,${snapshot.body}`;
```

The Authority checks the entity against `camera_snapshots`.

## Call a Home Assistant service

```ts
await client.callService("light", "turn_on", {
  entity_id: "light.kitchen",
  brightness_pct: 50,
});
```

The Authority checks the service call against `actions`.

Action scopes use these formats:

```text
light.turn_on@light.kitchen
light.*
*@light.kitchen
```

## Manifest reference

```ts
type VarcoManifest = {
  name: string;
  icon?: string;
  version: string;
  read_entities?: string[];
  readEntities?: string[];
  subscriptions?: string[];
  history?: string[];
  camera_snapshots?: string[];
  cameraSnapshots?: string[];
  actions?: string[];
};
```

Use snake_case fields unless you need compatibility with camelCase callers. The current client and Authority accept both `read_entities`/`readEntities` and `camera_snapshots`/`cameraSnapshots`.

## Scope guidance

Request the smallest manifest that supports your app.

Good read-only dashboard manifest:

```json
{
  "name": "Kitchen display",
  "version": "0.1.0",
  "read_entities": ["sensor.kitchen_temperature", "light.kitchen"],
  "subscriptions": ["sensor.kitchen_temperature", "light.kitchen"],
  "history": [],
  "camera_snapshots": [],
  "actions": []
}
```

Read plus one safe action:

```json
{
  "name": "Kitchen display",
  "version": "0.1.0",
  "read_entities": ["sensor.kitchen_temperature", "light.kitchen"],
  "subscriptions": ["sensor.kitchen_temperature", "light.kitchen"],
  "actions": ["light.turn_on@light.kitchen", "light.turn_off@light.kitchen"]
}
```

Avoid broad scopes unless the owner clearly understands them:

```json
{
  "read_entities": ["*"],
  "actions": ["light.*"]
}
```

## Transport behavior

The client uses relay transport first. If WebRTC is available and enabled, it attempts an opportunistic data-channel upgrade after authentication.

Relay-only mode:

```ts
const client = createVarcoClient({
  // ...
  webrtc: false,
});
```

Use relay-only mode when avoiding peer-to-peer IP candidate exposure matters more than direct transport.

## HA-like adapter

`createHassLikeClient()` provides a small adapter for dashboard code that expects Home Assistant-like helpers:

```ts
import { createHassLikeClient, createVarcoClient } from "@varco/client";

const varco = createVarcoClient(options);
const hassLike = createHassLikeClient(varco);

await hassLike.callService(
  "light",
  "turn_on",
  { brightness_pct: 50 },
  { entity_id: "light.kitchen" },
);

const states = await hassLike.fetchStates(["light.kitchen"]);
```

This adapter does not make the consumer a real Home Assistant frontend session. It only maps a small set of calls to Varco client methods.

## Running the example dashboard

```bash
npm install
npm --workspace packages/client run build
npm --workspace examples/consumer-dashboard run build
```

Serve `examples/consumer-dashboard/dist` with any static file server.

The example asks for:

- Authority ID.
- Bridge WebSocket URL.
- comma-separated entity IDs.

It can request access, connect after approval, load state snapshots, and subscribe to live state updates.
