import type { VarcoManifest } from "@varco/client";
import { DEMO_GRANT_BUNDLE } from "./generated-demo-grant.js";
export { DEMO_GRANT_BUNDLE };
export type { DemoGrantBundle } from "./generated-demo-grant.js";

export const BRIDGE_URL = DEMO_GRANT_BUNDLE?.bridgeUrl || "wss://varco-bridge.andreabaccega.com";
export const DEFAULT_AUTHORITY_ID = DEMO_GRANT_BUNDLE?.authorityId || "3j3rQeFlaFN1KOphZ2E4b7fFWoZSjF1A6KqgsntDhUg";

export const ENERGY_ENTITIES = {
  load: "sensor.powerwall_load_w",
  solar: "sensor.powerwall_solar_w",
  grid: "sensor.powerwall_site_w",
  battery: "sensor.powerwall_battery_w",
  batteryCharge: "sensor.powerwall_charge",
} as const;

export const COMFORT_ENTITIES = {
  outdoorTemperature: "sensor.outdoor_temperature",
  outdoorHumidity: "sensor.outdoor_humidity",
  livingRoomTemperature: "sensor.living_room_temperature",
  livingRoomHumidity: "sensor.living_room_humidity",
  co2: "sensor.air_quality_co2",
  climate: "climate.living_room_climate",
  cooling: "switch.living_room_cooling",
} as const;

export const LIGHT_ENTITIES = {
  kitchen: "light.kitchen_pendants",
  livingRoom: "light.living_room_lamps",
  studio: "light.studio_desk",
  garden: "light.garden_string_lights",
} as const;

export const SECURITY_ENTITIES = {
  frontDoor: "binary_sensor.front_door",
  kitchenMotion: "binary_sensor.kitchen_motion",
  garageDoor: "binary_sensor.garage_door",
} as const;

export const UTILITY_ENTITIES = {
  evCharger: "switch.ev_charger",
  evCharge: "sensor.ev_charge",
  coffeeMachine: "switch.coffee_machine",
} as const;

export const READ_ENTITIES = [
  ...Object.values(ENERGY_ENTITIES),
  ...Object.values(COMFORT_ENTITIES),
  ...Object.values(LIGHT_ENTITIES),
  ...Object.values(SECURITY_ENTITIES),
  ...Object.values(UTILITY_ENTITIES),
];

export const HISTORY_ENTITIES = [
  ENERGY_ENTITIES.load,
  ENERGY_ENTITIES.solar,
  ENERGY_ENTITIES.grid,
  ENERGY_ENTITIES.battery,
  COMFORT_ENTITIES.outdoorTemperature,
  COMFORT_ENTITIES.outdoorHumidity,
  COMFORT_ENTITIES.livingRoomTemperature,
  COMFORT_ENTITIES.livingRoomHumidity,
  COMFORT_ENTITIES.co2,
  UTILITY_ENTITIES.evCharge,
];

export const HISTORY_LINK_ENTITIES = [
  ...HISTORY_ENTITIES,
  ENERGY_ENTITIES.batteryCharge,
];

export function createReadOnlyManifest(): VarcoManifest {
  return {
    name: "Varco Gazzetta Home",
    icon: "mdi:newspaper-variant-outline",
    version: "0.2.0",
    read_entities: READ_ENTITIES,
    subscriptions: READ_ENTITIES,
    history: HISTORY_ENTITIES,
    camera_snapshots: [],
    actions: [],
  };
}

export const FORCE_RELAY_ONLY = false;
