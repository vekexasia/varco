# @varco/client

Browser client for Varco consumers.

Varco lets an external browser app use Home Assistant through a stored grant without receiving a Home Assistant token and without requiring Home Assistant to be publicly reachable.

## Install

```bash
npm install @varco/client
```

## Minimal relay consumer

```ts
import { createVarcoConsumerClient } from "@varco/client";

const client = createVarcoConsumerClient({
  authorityId: "PASTE_AUTHORITY_ID_FROM_HOME_ASSISTANT",
  bridgeUrl: "wss://varco-bridge.andreabaccega.com",
  manifest: {
    name: "My dashboard",
    version: "0.1.0",
    read_entities: ["sensor.temperature"],
    subscriptions: ["sensor.temperature"],
    history: [],
    camera_snapshots: [],
    actions: [],
  },
});

const access = await client.requestAccess();
console.log(access.pairing_code);

await client.connect();
const states = await client.getStates(["sensor.temperature"]);
```

Approve the pairing code in the Home Assistant Varco panel before calling `connect()`.

## Inside Home Assistant

Inside a Home Assistant custom card or panel, pass the frontend `hass` object. This uses the already-authenticated Home Assistant frontend session and does not pair through the relay.

```ts
import { createVarcoConsumerClient } from "@varco/client";

const client = createVarcoConsumerClient({ hass });
const states = await client.getStates(["sensor.temperature"]);
```

Full docs: https://vekexasia.github.io/varco/reference/client-api/
