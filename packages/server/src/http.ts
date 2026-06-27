import type { ConnectionManager } from "./connection.js";
import type { Handler, HandlerResult, HttpResponse, Route, ServerRequest, VarcoServerOptions } from "./types.js";

const JSON_HEADERS = { "content-type": "application/json" };

function json(status: number, body: unknown): HttpResponse {
  return { status, headers: { ...JSON_HEADERS }, body: JSON.stringify(body) };
}

function methodOf(route: { method?: string }): string {
  return (route.method ?? "POST").toUpperCase();
}

/** Map a denial/failure thrown by the client to an HTTP status. */
function errorStatus(err: unknown): number {
  const code = (err as { code?: string } | null)?.code;
  if (code === "permission_denied" || code === "pin_required" || code === "invalid_pin") return 403;
  if (code === "not_found") return 404;
  return 502;
}

export function createRequestHandler(conn: ConnectionManager, options: VarcoServerOptions) {
  const readyTimeoutMs = options.readyTimeoutMs ?? 5_000;
  const routes = new Map<string, Route>();
  for (const route of options.routes ?? []) routes.set(`${methodOf(route)} ${route.path}`, route);
  const handlers = new Map<string, Handler>();
  for (const handler of options.handlers ?? []) handlers.set(`${methodOf(handler)} ${handler.path}`, handler);

  return async function handle(req: ServerRequest): Promise<HttpResponse> {
    const method = req.method.toUpperCase();
    const key = `${method} ${req.path}`;
    const route = routes.get(key);
    const handler = handlers.get(key);
    if (!route && !handler) return json(404, { error: "not_found" });

    const ready = await conn.ensureReady(readyTimeoutMs);
    if (!ready) return json(503, { error: "unavailable", message: "Varco connection not ready" });

    if (route) {
      try {
        const data: Record<string, unknown> = { ...(route.service_data ?? {}), ...(route.target?.entity_id ? { entity_id: route.target.entity_id } : {}) };
        await conn.client.callService(route.domain, route.service, data);
        return json(200, { ok: true });
      } catch (err) {
        return json(errorStatus(err), { error: "service_failed", message: err instanceof Error ? err.message : String(err) });
      }
    }

    try {
      const result = await handler!.handle(req, conn.client);
      return shapeHandlerResult(result);
    } catch (err) {
      return json(errorStatus(err), { error: "handler_failed", message: err instanceof Error ? err.message : String(err) });
    }
  };
}

function shapeHandlerResult(result: HandlerResult): HttpResponse {
  if (result && typeof result === "object" && ("status" in result || "body" in result || "headers" in result)) {
    const r = result as { status?: number; headers?: Record<string, string>; body?: unknown };
    const status = r.status ?? 200;
    const headers = { ...JSON_HEADERS, ...(r.headers ?? {}) };
    const isString = typeof r.body === "string";
    if (isString && !r.headers?.["content-type"]) headers["content-type"] = "text/plain; charset=utf-8";
    const body = r.body === undefined ? "" : isString ? (r.body as string) : JSON.stringify(r.body);
    return { status, headers, body };
  }
  return json(200, result === undefined ? { ok: true } : result);
}
