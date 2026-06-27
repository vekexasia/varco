# Varco

Relay-first access protocol for Home Assistant. Consumers get scoped access without a Home Assistant token, and Home Assistant stays the Authority for consent, grants, policy enforcement, service calls, and audit.

## Language

**Consumer**:
An external app, dashboard, script, or server that holds its own keypair and a self-declared manifest, and requests scoped access through the bridge.
_Avoid_: client, app, integration

**Authority**:
The Home Assistant custom integration. It approves grants, enforces policy and restrictions, executes Home Assistant calls, and stores audit records.

**Bridge**:
The opaque relay. It routes encrypted envelopes and never sees application plaintext or makes permission decisions.

**Owner**:
The person who owns the Home Assistant instance and approves, rejects, revokes, or narrows access in the Varco panel.

**Grant**:
The maximum access boundary the Owner approved for a Consumer, bound to the Consumer public key and stored in Home Assistant. Narrowed at runtime by restrictions.

**Server Consumer**:
A Consumer that runs server-side (not in a browser) from a private key supplied by the developer, holding one persistent authenticated connection. Basis for HTTP webhook and REST use of Varco.
_Avoid_: webhook, bot, service account

**Route**:
A declarative mapping in a Server Consumer from an inbound HTTP path (and method) to a single static Home Assistant operation, with no request-body interpolation. Anything dynamic uses a code handler instead.

**Handler**:
A developer-supplied function that receives a parsed request and the connected Server Consumer client, and performs arbitrary Home Assistant operations. The escape hatch for everything a static Route cannot express.
