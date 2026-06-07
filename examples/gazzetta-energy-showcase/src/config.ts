import type { VarcoManifest } from "@varco/client";
import { DEMO_GRANT_BUNDLE } from "./generated-demo-grant.js";
export { DEMO_GRANT_BUNDLE };
export type { DemoGrantBundle } from "./generated-demo-grant.js";

export const BRIDGE_URL = DEMO_GRANT_BUNDLE?.bridgeUrl || "wss://varco-bridge.vekexasia.workers.dev";
export const DEFAULT_AUTHORITY_ID = DEMO_GRANT_BUNDLE?.authorityId || "3j3rQeFlaFN1KOphZ2E4b7fFWoZSjF1A6KqgsntDhUg";

export const ENERGY_ENTITIES = {
  load: "sensor.powerwall_load_w",
  solar: "sensor.powerwall_solar_w",
  grid: "sensor.powerwall_site_w",
  battery: "sensor.powerwall_battery_w",
  batteryCharge: "sensor.powerwall_charge"
} as const;

export const READ_ENTITIES = Object.values(ENERGY_ENTITIES);

export function createReadOnlyManifest(): VarcoManifest {
  return {
    name: "Varco Gazzetta Energy",
    icon: "mdi:solar-power",
    version: "0.1.0",
    read_entities: READ_ENTITIES,
    subscriptions: READ_ENTITIES,
    history: READ_ENTITIES,
    camera_snapshots: [],
    actions: [],
  };
}

export const FORCE_RELAY_ONLY = true;
