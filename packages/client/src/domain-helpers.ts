import type { HassState, VarcoDomainHelpers } from "./types.js";

type HelperClient = {
  getStates(entityIds: string[]): Promise<Record<string, HassState | null>>;
  subscribeEntities(entityIds: string[], cb: (event: any) => void): Promise<string>;
  queryHistory(entityIds: string[], range?: Record<string, unknown>): Promise<any>;
  callService(domain: string, service: string, data?: { entity_id?: string; [key: string]: unknown }): Promise<void>;
};

export function attachDomainHelpers<T extends HelperClient>(client: T): T & VarcoDomainHelpers {
  const service = (domain: string, name: string, entityId: string, data: Record<string, unknown> = {}) => client.callService(domain, name, { entity_id: entityId, ...data });
  return Object.assign(client, {
    entity: {
      async get(entityId: string) { return (await client.getStates([entityId]))[entityId] ?? null; },
      subscribe(entityId: string, cb: (event: any) => void) { return client.subscribeEntities([entityId], cb); },
      history(entityId: string, range: Record<string, unknown> = {}) { return client.queryHistory([entityId], range); },
      call(entityId: string, name: string, data: Record<string, unknown> = {}) {
        const domain = entityId.split(".", 1)[0];
        return service(domain, name, entityId, data);
      },
    },
    light: {
      turnOn: (entityId: string, options: Record<string, unknown> = {}) => service("light", "turn_on", entityId, options),
      turnOff: (entityId: string) => service("light", "turn_off", entityId),
      toggle: (entityId: string) => service("light", "toggle", entityId),
      setBrightness: (entityId: string, brightnessPct: number) => service("light", "turn_on", entityId, { brightness_pct: brightnessPct }),
      setColor: (entityId: string, color: Record<string, unknown>) => service("light", "turn_on", entityId, color),
    },
    switch: {
      turnOn: (entityId: string) => service("switch", "turn_on", entityId),
      turnOff: (entityId: string) => service("switch", "turn_off", entityId),
      toggle: (entityId: string) => service("switch", "toggle", entityId),
    },
    climate: {
      setTemperature: (entityId: string, temperature: number, options: Record<string, unknown> = {}) => service("climate", "set_temperature", entityId, { temperature, ...options }),
      setTemperatureRange: (entityId: string, targetTempLow: number, targetTempHigh: number, options: Record<string, unknown> = {}) => service("climate", "set_temperature", entityId, { target_temp_low: targetTempLow, target_temp_high: targetTempHigh, ...options }),
      setHvacMode: (entityId: string, hvacMode: string) => service("climate", "set_hvac_mode", entityId, { hvac_mode: hvacMode }),
      setPresetMode: (entityId: string, presetMode: string) => service("climate", "set_preset_mode", entityId, { preset_mode: presetMode }),
      setFanMode: (entityId: string, fanMode: string) => service("climate", "set_fan_mode", entityId, { fan_mode: fanMode }),
      setSwingMode: (entityId: string, swingMode: string) => service("climate", "set_swing_mode", entityId, { swing_mode: swingMode }),
      setHumidity: (entityId: string, humidity: number) => service("climate", "set_humidity", entityId, { humidity }),
      turnOn: (entityId: string) => service("climate", "turn_on", entityId),
      turnOff: (entityId: string) => service("climate", "turn_off", entityId),
    },
    cover: {
      open: (entityId: string) => service("cover", "open_cover", entityId),
      close: (entityId: string) => service("cover", "close_cover", entityId),
      stop: (entityId: string) => service("cover", "stop_cover", entityId),
      setPosition: (entityId: string, position: number) => service("cover", "set_cover_position", entityId, { position }),
      openTilt: (entityId: string) => service("cover", "open_cover_tilt", entityId),
      closeTilt: (entityId: string) => service("cover", "close_cover_tilt", entityId),
      stopTilt: (entityId: string) => service("cover", "stop_cover_tilt", entityId),
      setTiltPosition: (entityId: string, tiltPosition: number) => service("cover", "set_cover_tilt_position", entityId, { tilt_position: tiltPosition }),
    },
    fan: {
      turnOn: (entityId: string) => service("fan", "turn_on", entityId),
      turnOff: (entityId: string) => service("fan", "turn_off", entityId),
      toggle: (entityId: string) => service("fan", "toggle", entityId),
      setPercentage: (entityId: string, percentage: number) => service("fan", "set_percentage", entityId, { percentage }),
      setPresetMode: (entityId: string, presetMode: string) => service("fan", "set_preset_mode", entityId, { preset_mode: presetMode }),
      setDirection: (entityId: string, direction: string) => service("fan", "set_direction", entityId, { direction }),
      oscillate: (entityId: string, oscillating: boolean) => service("fan", "oscillate", entityId, { oscillating }),
    },
    lock: {
      lock: (entityId: string) => service("lock", "lock", entityId),
      unlock: (entityId: string) => service("lock", "unlock", entityId),
      open: (entityId: string) => service("lock", "open", entityId),
    },
    mediaPlayer: {
      turnOn: (entityId: string) => service("media_player", "turn_on", entityId),
      turnOff: (entityId: string) => service("media_player", "turn_off", entityId),
      volumeUp: (entityId: string) => service("media_player", "volume_up", entityId),
      volumeDown: (entityId: string) => service("media_player", "volume_down", entityId),
      setVolume: (entityId: string, volumeLevel: number) => service("media_player", "volume_set", entityId, { volume_level: volumeLevel }),
      mute: (entityId: string, muted: boolean) => service("media_player", "volume_mute", entityId, { is_volume_muted: muted }),
      play: (entityId: string) => service("media_player", "media_play", entityId),
      pause: (entityId: string) => service("media_player", "media_pause", entityId),
      stop: (entityId: string) => service("media_player", "media_stop", entityId),
      playPause: (entityId: string) => service("media_player", "media_play_pause", entityId),
      nextTrack: (entityId: string) => service("media_player", "media_next_track", entityId),
      previousTrack: (entityId: string) => service("media_player", "media_previous_track", entityId),
      seek: (entityId: string, seconds: number) => service("media_player", "media_seek", entityId, { seek_position: seconds }),
      selectSource: (entityId: string, source: string) => service("media_player", "select_source", entityId, { source }),
      playMedia: (entityId: string, mediaContentId: string, mediaContentType: string, options: Record<string, unknown> = {}) => service("media_player", "play_media", entityId, { media_content_id: mediaContentId, media_content_type: mediaContentType, ...options }),
    },
    button: { press: (entityId: string) => service("button", "press", entityId) },
    scene: { turnOn: (entityId: string) => service("scene", "turn_on", entityId) },
    number: { setValue: (entityId: string, value: number) => service("number", "set_value", entityId, { value }) },
    select: { selectOption: (entityId: string, option: string) => service("select", "select_option", entityId, { option }) },
  });
}
