# @varco/server

Server-side and webhook access for [Varco](https://github.com/vekexasia/varco). It runs a long-lived Varco **Server Consumer** from a developer-supplied private key and exposes it over HTTP through declarative static **Routes** and code **Handlers**.

It is just another Consumer: no Home Assistant token leaves Home Assistant, the bridge stays opaque, and Home Assistant stays the Authority. The trust model is unchanged.

Requires Node 22 or newer (global `WebSocket`).

```ts
import { createVarcoServer } from "@varco/server";

const server = createVarcoServer({
  privateKey: process.env.VARCO_PRIVATE_KEY,   // base64url Ed25519 private key
  authorityId: process.env.VARCO_AUTHORITY_ID,
  bridgeUrl: "wss://varco-bridge.example.com",
  routes: [
    { path: "/lights/on", domain: "light", service: "turn_on", target: { entity_id: "light.kitchen" } },
  ],
  handlers: [
    {
      path: "/webhook",
      handle: (req, client) => {
        if (req.headers["x-secret"] !== process.env.WEBHOOK_SECRET) return { status: 401, body: "unauthorized" };
        return client.callService("scene", "turn_on", { entity_id: req.body.scene });
      },
    },
  ],
});

await server.start();
await server.listen(8080);
```

## No built-in caller authentication

The HTTP endpoint is public. A static Route fires for anyone who can reach its URL. Verify the caller (HMAC, shared secret, etc.) inside a Handler. Use Routes for harmless or idempotent operations, Handlers for anything sensitive.

See the [Server API reference](https://vekexasia.github.io/varco/reference/server-api/) and the [server-side guide](https://vekexasia.github.io/varco/guides/server-and-webhooks/).
