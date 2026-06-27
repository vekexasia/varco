import type { VarcoConsumerClient, VarcoManifest, VarcoTransport } from "@varco/client";

export type { VarcoConsumerClient, VarcoManifest };

/** A static path -> single Home Assistant operation mapping with no request-body interpolation. */
export type Route = {
  path: string;
  /** HTTP method; defaults to POST. */
  method?: string;
  domain: string;
  service: string;
  /** Only entity_id targets are supported by Routes; use a Handler for areas/devices. */
  target?: { entity_id?: string | string[] };
  service_data?: Record<string, unknown>;
};

/** Normalized request passed to a Handler. */
export type ServerRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON when the body is JSON, otherwise the raw string. */
  body: unknown;
  /** Raw request body string. */
  rawBody: string;
};

/** What a Handler may return: a full response, or any JSON-serializable value (sent as 200). */
export type HandlerResult =
  | { status?: number; headers?: Record<string, string>; body?: unknown }
  | unknown;

export type Handler = {
  path: string;
  /** HTTP method; defaults to POST. */
  method?: string;
  handle: (req: ServerRequest, client: VarcoConsumerClient) => Promise<HandlerResult> | HandlerResult;
};

export type VarcoServerOptions = {
  /** base64url-encoded Ed25519 private key for the Server Consumer identity. */
  privateKey: string;
  authorityId: string;
  bridgeUrl: string;
  /**
   * Optional manifest. Omitted: the consumer authenticates against an existing grant
   * and reports grant_info. Provided: enables a first-run access_request and surfaces
   * the pairing code for the Owner to approve.
   */
  manifest?: VarcoManifest;
  routes?: Route[];
  handlers?: Handler[];
  /** Per-request timeout waiting for the connection to be ready before returning 503. Default 5000ms. */
  readyTimeoutMs?: number;
  /** Underlying relay request timeout. Default 30000ms. */
  requestTimeoutMs?: number;
  warn?: (message: string) => void;
  /** Internal: inject a transport (tests). Defaults to the relay transport. */
  transport?: VarcoTransport;
};

export type VarcoServer = {
  /** The underlying Server Consumer client. */
  readonly client: VarcoConsumerClient;
  /** Establish the persistent connection. Resolves once authenticated; keeps reconnecting after. */
  start(): Promise<void>;
  /**
   * Run a first-run access_request (requires a manifest). Returns the pairing code
   * the Owner approves in the Varco panel. Pairing is not driven by the runtime.
   */
  requestPairing(): Promise<{ request_id: string; pairing_code: string; status: string }>;
  /** Framework-agnostic request handler. */
  handle(req: ServerRequest): Promise<HttpResponse>;
  /** Start a Node http server on the given port. Returns the http.Server. */
  listen(port: number, hostname?: string): Promise<import("node:http").Server>;
  close(): Promise<void>;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};
