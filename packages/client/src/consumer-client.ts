import { createVarcoClient } from "./client.js";
import { createLocalHomeAssistantClient } from "./local-client.js";
import type { RelayConsumerOptions, VarcoConsumerClient, VarcoConsumerClientOptions, VarcoManifest } from "./types.js";

const EMPTY_READ_ONLY_MANIFEST: VarcoManifest = {
  name: "Varco consumer",
  version: "0.1.0",
  read_entities: [],
  subscriptions: [],
  history: [],
  camera_snapshots: [],
  actions: [],
};

export function createVarcoConsumerClient(options: VarcoConsumerClientOptions): VarcoConsumerClient {
  if ("hass" in options && options.hass) return createLocalHomeAssistantClient(options.hass);

  const relayOptions = options as RelayConsumerOptions;
  const client = createVarcoClient({ ...relayOptions, manifest: relayOptions.manifest ?? EMPTY_READ_ONLY_MANIFEST });
  return Object.assign(client, { updateHass() {} });
}
