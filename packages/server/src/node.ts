import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { HttpResponse, ServerRequest } from "./types.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalize(req: IncomingMessage, rawBody: string): ServerRequest {
  const url = new URL(req.url ?? "/", "http://localhost");
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(", ");
  }
  let body: unknown = rawBody;
  const contentType = headers["content-type"] ?? "";
  if (rawBody && contentType.includes("application/json")) {
    try { body = JSON.parse(rawBody); } catch { body = rawBody; }
  }
  return {
    method: req.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers,
    body,
    rawBody,
  };
}

/** Start a Node http server that delegates to the framework-agnostic handler. */
export function startNodeServer(
  handle: (req: ServerRequest) => Promise<HttpResponse>,
  port: number,
  hostname?: string,
): Promise<Server> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const rawBody = await readBody(req);
      const response = await handle(normalize(req, rawBody));
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal", message: err instanceof Error ? err.message : String(err) }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => { server.off("error", reject); resolve(server); });
  });
}
