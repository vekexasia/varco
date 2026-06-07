import type { VarcoManifest } from "@varco/client";

export const BRIDGE_URL = "wss://varco-bridge.vekexasia.workers.dev";
export const DEFAULT_AUTHORITY_ID = "CiYmYZOIgwInwvoMdvewziE5QvY3FLdfqs-bjo3WXFA";

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
