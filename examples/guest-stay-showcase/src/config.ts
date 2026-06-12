import type { VarcoManifest } from "@varco/client";
import { DEMO_GRANT_BUNDLE } from "./generated-demo-grant.js";
export { DEMO_GRANT_BUNDLE };
export type { DemoGrantBundle } from "./generated-demo-grant.js";

export const BRIDGE_URL = DEMO_GRANT_BUNDLE?.bridgeUrl || "wss://varco-bridge.andreabaccega.com";
export const DEFAULT_AUTHORITY_ID = DEMO_GRANT_BUNDLE?.authorityId || "3j3rQeFlaFN1KOphZ2E4b7fFWoZSjF1A6KqgsntDhUg";

export const LIGHT_ENTITIES = {
  kitchen: "light.guest_kitchen",
  livingRoom: "light.guest_living_room",
  bedroom: "light.guest_bedroom",
  terrace: "light.guest_terrace",
} as const;

export const COMFORT_ENTITIES = {
  temperature: "sensor.guest_temperature",
  humidity: "sensor.guest_humidity",
  co2: "sensor.guest_co2",
  climate: "climate.guest_suite_climate",
  cooling: "switch.guest_cooling",
} as const;

export const HOUSE_ENTITIES = {
  frontDoor: "binary_sensor.guest_front_door",
  motion: "binary_sensor.guest_motion",
  coffeeMachine: "switch.guest_coffee_machine",
} as const;

export const ENERGY_ENTITIES = {
  load: "sensor.guest_power_load_w",
  solar: "sensor.guest_solar_w",
  batteryCharge: "sensor.guest_battery_charge",
} as const;

export const READ_ENTITIES = [
  ...Object.values(LIGHT_ENTITIES),
  ...Object.values(COMFORT_ENTITIES),
  ...Object.values(HOUSE_ENTITIES),
  ...Object.values(ENERGY_ENTITIES),
];

export const ACTION_SCOPES = [
  ...Object.values(LIGHT_ENTITIES).flatMap((entity) => [`light.turn_on@${entity}`, `light.turn_off@${entity}`]),
  `climate.set_temperature@${COMFORT_ENTITIES.climate}`,
  `switch.turn_on@${COMFORT_ENTITIES.cooling}`,
  `switch.turn_off@${COMFORT_ENTITIES.cooling}`,
  `switch.turn_on@${HOUSE_ENTITIES.coffeeMachine}`,
  `switch.turn_off@${HOUSE_ENTITIES.coffeeMachine}`,
];

export function createGuestStayManifest(): VarcoManifest {
  return {
    name: "Varco Guest Stay",
    icon: "mdi:home-heart",
    version: "0.1.0",
    read_entities: READ_ENTITIES,
    subscriptions: READ_ENTITIES,
    history: [],
    camera_snapshots: [],
    actions: ACTION_SCOPES,
  };
}

export const FORCE_RELAY_ONLY = false;
