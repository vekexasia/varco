import type { VarcoManifest } from "./types.js";

export type ManifestPart = {
  read_entities?: string[];
  subscriptions?: string[];
  history?: string[];
  camera_snapshots?: string[];
  actions?: string[];
};

export type ManifestBuilderOptions = {
  name: string;
  icon?: string;
  version?: string;
  entities?: ManifestPart[];
};

export function createManifest(options: ManifestBuilderOptions): VarcoManifest {
  const manifest: VarcoManifest = {
    name: options.name,
    ...(options.icon ? { icon: options.icon } : {}),
    version: options.version ?? "0.1.0",
    read_entities: [],
    subscriptions: [],
    history: [],
    camera_snapshots: [],
    actions: [],
  };
  for (const part of options.entities ?? []) {
    appendUnique(manifest.read_entities!, part.read_entities ?? []);
    appendUnique(manifest.subscriptions!, part.subscriptions ?? []);
    appendUnique(manifest.history!, part.history ?? []);
    appendUnique(manifest.camera_snapshots!, part.camera_snapshots ?? []);
    appendUnique(manifest.actions!, part.actions ?? []);
  }
  return manifest;
}

export function readEntity(entityId: string, options: { subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return entityPart(entityId, [], { subscribe: options.subscribe ?? false, history: options.history });
}

export function cameraEntity(entityId: string, options: { snapshot?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return entityPart(entityId, [], { subscribe: options.subscribe ?? false, history: options.history, cameraSnapshot: options.snapshot ?? true });
}

export function lightControl(entityId: string, options: { onOff?: boolean; brightness?: boolean; color?: boolean; toggle?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  const actions = ["turn_on", "turn_off"];
  if (options.toggle) actions.push("toggle");
  return servicePart("light", entityId, actions, options);
}

export function switchControl(entityId: string, options: { toggle?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("switch", entityId, ["turn_on", "turn_off", ...(options.toggle ? ["toggle"] : [])], options);
}

export function climateControl(entityId: string, options: { temperature?: boolean; hvacMode?: boolean; presetMode?: boolean; fanMode?: boolean; swingMode?: boolean; humidity?: boolean; onOff?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("climate", entityId, [
    ...(options.temperature ? ["set_temperature"] : []),
    ...(options.hvacMode ? ["set_hvac_mode"] : []),
    ...(options.presetMode ? ["set_preset_mode"] : []),
    ...(options.fanMode ? ["set_fan_mode"] : []),
    ...(options.swingMode ? ["set_swing_mode"] : []),
    ...(options.humidity ? ["set_humidity"] : []),
    ...(options.onOff ? ["turn_on", "turn_off"] : []),
  ], options);
}

export function coverControl(entityId: string, options: { position?: boolean; tilt?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("cover", entityId, [
    "open_cover", "close_cover", "stop_cover",
    ...(options.position ? ["set_cover_position"] : []),
    ...(options.tilt ? ["open_cover_tilt", "close_cover_tilt", "stop_cover_tilt", "set_cover_tilt_position"] : []),
  ], options);
}

export function fanControl(entityId: string, options: { percentage?: boolean; presetMode?: boolean; direction?: boolean; oscillate?: boolean; toggle?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("fan", entityId, [
    "turn_on", "turn_off",
    ...(options.toggle ? ["toggle"] : []),
    ...(options.percentage ? ["set_percentage"] : []),
    ...(options.presetMode ? ["set_preset_mode"] : []),
    ...(options.direction ? ["set_direction"] : []),
    ...(options.oscillate ? ["oscillate"] : []),
  ], options);
}

export function lockControl(entityId: string, options: { unlock?: boolean; open?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("lock", entityId, ["lock", ...(options.unlock ? ["unlock"] : []), ...(options.open ? ["open"] : [])], options);
}

export function mediaPlayerControl(entityId: string, options: { power?: boolean; volume?: boolean; playback?: boolean; source?: boolean; playMedia?: boolean; subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("media_player", entityId, [
    ...(options.power ? ["turn_on", "turn_off"] : []),
    ...(options.volume ? ["volume_up", "volume_down", "volume_set", "volume_mute"] : []),
    ...(options.playback ? ["media_play", "media_pause", "media_stop", "media_play_pause", "media_next_track", "media_previous_track", "media_seek"] : []),
    ...(options.source ? ["select_source"] : []),
    ...(options.playMedia ? ["play_media"] : []),
  ], options);
}

export function buttonControl(entityId: string, options: { subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("button", entityId, ["press"], options);
}

export function sceneControl(entityId: string, options: { subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("scene", entityId, ["turn_on"], options);
}

export function numberControl(entityId: string, options: { subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("number", entityId, ["set_value"], options);
}

export function selectControl(entityId: string, options: { subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return servicePart("select", entityId, ["select_option"], options);
}

function servicePart(domain: string, entityId: string, services: string[], options: { subscribe?: boolean; history?: boolean } = {}): ManifestPart {
  return entityPart(entityId, services.map((service) => `${domain}.${service}@${entityId}`), { subscribe: options.subscribe ?? true, history: options.history });
}

function entityPart(entityId: string, actions: string[], options: { subscribe?: boolean; history?: boolean; cameraSnapshot?: boolean } = {}): ManifestPart {
  return {
    read_entities: [entityId],
    subscriptions: options.subscribe ? [entityId] : [],
    history: options.history ? [entityId] : [],
    camera_snapshots: options.cameraSnapshot ? [entityId] : [],
    actions,
  };
}

function appendUnique(target: string[], values: string[]): void {
  for (const value of values) if (!target.includes(value)) target.push(value);
}
