# Server-side and webhook access is just another Consumer

## Context

Developers want to drive Home Assistant from webhooks (an external tool POSTs a URL, Varco runs an HA operation) and from plain HTTP/REST backends that cannot run the browser client. The obvious shape — a hosted "webhook gateway" that authenticates callers and proxies into HA — would put a new trusted component between the internet and Home Assistant.

## Decision

We ship `@varco/server` (`packages/server/`): a thin wrapper that runs the existing `@varco/client` as a long-lived **Server Consumer** from a developer-supplied private key, and exposes HTTP via declarative static **Routes** and code **Handlers**. It is a normal Varco Consumer that happens to run server-side and own its own HTTP endpoint.

Consequences of treating it as just-another-Consumer:

- No Home Assistant token leaves HA; the bridge stays opaque; HA stays the Authority. The trust model is unchanged.
- The private key lives on the developer's server (their risk, their grant, Owner-revocable). The package never reads env or disk — the key is passed in as a string.
- **No built-in caller authentication.** The webhook endpoint is public; verifying the caller (HMAC, shared secret, etc.) is the developer's job inside a Handler, because every webhook source signs differently. This is deliberate and surprising, so it is recorded here: a static Route with no caller check will fire for anyone who can reach the URL. Guidance is "Routes for harmless/idempotent ops, Handlers for anything sensitive."

## Considered options

- **Hosted webhook gateway** — rejected: reintroduces a trusted middlebox and a caller-auth framework, and would need inbound access or a service that holds keys for many users.
- **Built-in REST proxy + built-in HMAC verification** — rejected: a fixed `POST /call_service` with no caller auth is a remote-control-your-house endpoint by default, and per-vendor signature verification is a framework nobody asked for. Handlers cover REST and auth in a few lines, under developer control.
