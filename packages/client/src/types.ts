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

export type VarcoClient = {
  readonly consumerPublicKey: string;
  readonly transportStatus: VarcoTransportStatus;
  requestAccess(): Promise<AccessResult>;
  connect(): Promise<void>;
  getStates(entityIds: string[]): Promise<Record<string, HassState | null>>;
  subscribeEntities(entityIds: string[], cb: (event: any) => void): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  queryHistory(entityIds: string[], range?: Record<string, unknown>): Promise<any>;
  cameraSnapshot(entityId: string): Promise<{ contentType: string; body: string }>;
  callService(domain: string, service: string, data?: { entity_id?: string; [key: string]: unknown }): Promise<void>;
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
