import { ConnectionManager } from "./connection.js";
import { createRequestHandler } from "./http.js";
import { startNodeServer } from "./node.js";
import type { VarcoServer, VarcoServerOptions } from "./types.js";

export type {
  Handler,
  HandlerResult,
  HttpResponse,
  Route,
  ServerRequest,
  VarcoConsumerClient,
  VarcoManifest,
  VarcoServer,
  VarcoServerOptions,
} from "./types.js";

export function createVarcoServer(options: VarcoServerOptions): VarcoServer {
  if (!options.privateKey) throw new Error("Varco server requires a private key");
  if (!options.authorityId) throw new Error("Varco server requires an authorityId");
  if (!options.bridgeUrl) throw new Error("Varco server requires a bridgeUrl");

  const conn = new ConnectionManager(options);
  const handle = createRequestHandler(conn, options);

  return {
    get client() { return conn.client; },
    start() { return conn.start(); },
    async requestPairing() {
      if (!options.manifest) throw new Error("Varco server requires a manifest to request pairing");
      return conn.client.requestAccess();
    },
    handle,
    listen(port: number, hostname?: string) { return startNodeServer(handle, port, hostname); },
    close() { return conn.close(); },
  };
}
