// Shared types for the Varco Authority panel.

export interface HassConnection {
  sendMessagePromise<T = unknown>(message: { type: string; [key: string]: unknown }): Promise<T>;
}

export interface Hass {
  connection: HassConnection;
  states?: Record<string, { entity_id: string; state: string; attributes?: Record<string, unknown> }>;
  callWS?: <T = unknown>(message: { type: string; [key: string]: unknown }) => Promise<T>;
}

export interface Manifest {
  name?: string;
  version?: string;
  read_entities?: string[];
  subscriptions?: string[];
  history?: string[];
  camera_snapshots?: string[];
  actions?: string[];
  [key: string]: unknown;
}

export interface AccessRequest {
  request_id: string;
  status: string;
  pairing_code: string;
  consumer_pk: string;
  created_at: string;
  manifest: Manifest;
}

export interface Restriction {
  id?: string;
  type: string;
  enabled?: boolean;
  applies_to?: string;
  params?: Record<string, unknown>;
  pin?: string;
  [key: string]: unknown;
}

export interface Grant {
  grant_id: string;
  consumer_pk: string;
  manifest: Manifest;
  request_id?: string;
  revoked?: boolean;
  revoked_at?: string;
  created_at?: string;
  expires_at?: string;
  last_used_at?: string;
  restrictions?: Restriction[];
}

export interface RelayStatus {
  connected?: boolean;
  last_error?: string | null;
  bridge_url?: string;
  last_connected?: string;
}

export interface VarcoInfo {
  authority_id: string;
  relay: RelayStatus;
}

export interface AuditEvent {
  ts: string;
  event: string;
  grant_id?: string | null;
  details?: Record<string, unknown> | null;
}

export interface DashboardEntry {
  title: string;
  url_path: string | null;
  mode: string;
}

export interface ExportEntityScopes {
  read?: boolean;
  subscriptions?: boolean;
  history?: boolean;
  camera_snapshots?: boolean;
}

export interface ExportEntityRef {
  view: string;
  card_type: string;
}

export interface ExportEntity {
  entity_id: string;
  selected: boolean;
  scopes: ExportEntityScopes;
  references?: ExportEntityRef[];
}

export interface ExportWarning {
  path: string;
  message: string;
}

export interface ExportResult {
  entities: ExportEntity[];
  warnings: ExportWarning[];
  brief: string;
  manifest: Manifest;
  dashboard?: { view_title?: string };
}

export interface PanelState {
  loading?: boolean;
  info: VarcoInfo;
  requests: AccessRequest[];
  grants: Grant[];
  audit: AuditEvent[];
}

export type ScopeKey = 'read_entities' | 'subscriptions' | 'history' | 'camera_snapshots' | 'actions';
