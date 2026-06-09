export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type VarcoManifest = {
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

export type HassState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
};

export type VarcoTransport = {
  request(message: Record<string, unknown>): Promise<any>;
  close?(): void | Promise<void>;
  onEvent?(handler: (event: any) => void): void;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export type VarcoTransportStatus = {
  mode: "relay" | "p2p";
  detail?: string;
};

export type VarcoConsumerTransportStatus = {
  mode: "relay" | "p2p" | "home-assistant";
  detail?: string;
};

export type VarcoClientOptions = {
  authorityId: string;
  bridgeUrl: string;
  manifest: VarcoManifest;
  storage?: StorageLike;
  transport?: VarcoTransport;
  warn?: (message: string) => void;
  webrtc?: boolean;
  onTransportStatus?: (status: VarcoTransportStatus) => void;
};

export type AccessResult = { request_id: string; pairing_code: string; status: string; mode?: "home-assistant" };

export type VarcoDomainHelpers = {
  entity: {
    get(entityId: string): Promise<HassState | null>;
    subscribe(entityId: string, cb: (event: any) => void): Promise<string>;
    history(entityId: string, range?: Record<string, unknown>): Promise<any>;
    call(entityId: string, service: string, data?: Record<string, unknown>): Promise<void>;
  };
  light: {
    turnOn(entityId: string, options?: Record<string, unknown>): Promise<void>;
    turnOff(entityId: string): Promise<void>;
    toggle(entityId: string): Promise<void>;
    setBrightness(entityId: string, brightnessPct: number): Promise<void>;
    setColor(entityId: string, color: Record<string, unknown>): Promise<void>;
  };
  switch: { turnOn(entityId: string): Promise<void>; turnOff(entityId: string): Promise<void>; toggle(entityId: string): Promise<void>; };
  climate: {
    setTemperature(entityId: string, temperature: number, options?: Record<string, unknown>): Promise<void>;
    setTemperatureRange(entityId: string, targetTempLow: number, targetTempHigh: number, options?: Record<string, unknown>): Promise<void>;
    setHvacMode(entityId: string, hvacMode: string): Promise<void>;
    setPresetMode(entityId: string, presetMode: string): Promise<void>;
    setFanMode(entityId: string, fanMode: string): Promise<void>;
    setSwingMode(entityId: string, swingMode: string): Promise<void>;
    setHumidity(entityId: string, humidity: number): Promise<void>;
    turnOn(entityId: string): Promise<void>;
    turnOff(entityId: string): Promise<void>;
  };
  cover: {
    open(entityId: string): Promise<void>;
    close(entityId: string): Promise<void>;
    stop(entityId: string): Promise<void>;
    setPosition(entityId: string, position: number): Promise<void>;
    openTilt(entityId: string): Promise<void>;
    closeTilt(entityId: string): Promise<void>;
    stopTilt(entityId: string): Promise<void>;
    setTiltPosition(entityId: string, tiltPosition: number): Promise<void>;
  };
  fan: {
    turnOn(entityId: string): Promise<void>;
    turnOff(entityId: string): Promise<void>;
    toggle(entityId: string): Promise<void>;
    setPercentage(entityId: string, percentage: number): Promise<void>;
    setPresetMode(entityId: string, presetMode: string): Promise<void>;
    setDirection(entityId: string, direction: string): Promise<void>;
    oscillate(entityId: string, oscillating: boolean): Promise<void>;
  };
  lock: { lock(entityId: string): Promise<void>; unlock(entityId: string): Promise<void>; open(entityId: string): Promise<void>; };
  mediaPlayer: {
    turnOn(entityId: string): Promise<void>;
    turnOff(entityId: string): Promise<void>;
    volumeUp(entityId: string): Promise<void>;
    volumeDown(entityId: string): Promise<void>;
    setVolume(entityId: string, volumeLevel: number): Promise<void>;
    mute(entityId: string, muted: boolean): Promise<void>;
    play(entityId: string): Promise<void>;
    pause(entityId: string): Promise<void>;
    stop(entityId: string): Promise<void>;
    playPause(entityId: string): Promise<void>;
    nextTrack(entityId: string): Promise<void>;
    previousTrack(entityId: string): Promise<void>;
    seek(entityId: string, seconds: number): Promise<void>;
    selectSource(entityId: string, source: string): Promise<void>;
    playMedia(entityId: string, mediaContentId: string, mediaContentType: string, options?: Record<string, unknown>): Promise<void>;
  };
  button: { press(entityId: string): Promise<void>; };
  scene: { turnOn(entityId: string): Promise<void>; };
  number: { setValue(entityId: string, value: number): Promise<void>; };
  select: { selectOption(entityId: string, option: string): Promise<void>; };
};

export type VarcoClient = VarcoDomainHelpers & {
  readonly consumerPublicKey: string;
  readonly transportStatus: VarcoTransportStatus;
  requestAccess(): Promise<AccessResult>;
  connect(): Promise<void>;
  getStates(entityIds: string[]): Promise<Record<string, HassState | null>>;
  subscribeEntities(entityIds: string[], cb: (event: any) => void): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  queryHistory(entityIds: string[], range?: Record<string, unknown>): Promise<any>;
  cameraSnapshot(entityId: string): Promise<{ contentType: string; body: string }>;
  callService(domain: string, service: string, data?: { entity_id?: string; pin?: string; pins?: Record<string, string>; [key: string]: unknown }): Promise<void>;
  close(): Promise<void>;
};

export type HassFrontend = {
  states: Record<string, HassState>;
  callService?: (domain: string, service: string, serviceData?: Record<string, unknown>, target?: Record<string, unknown>) => Promise<unknown> | unknown;
  callWS?: (message: Record<string, unknown>) => Promise<unknown>;
  connection?: {
    sendMessagePromise?: (message: Record<string, unknown>) => Promise<unknown>;
  };
};

export type LocalHomeAssistantOptions = {
  hass: HassFrontend;
};

export type RelayConsumerOptions = Omit<VarcoClientOptions, "manifest"> & {
  manifest?: VarcoManifest;
};

export type VarcoConsumerClientOptions = LocalHomeAssistantOptions | (RelayConsumerOptions & { hass?: HassFrontend });

export type VarcoConsumerClient = Omit<VarcoClient, "transportStatus"> & {
  readonly transportStatus: VarcoConsumerTransportStatus;
  updateHass(nextHass: HassFrontend): void;
};
