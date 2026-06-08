# Development guide

This guide is for people working on this repository. User-facing Home Assistant setup lives in [`docs/home-assistant.md`](home-assistant.md), and consumer integration lives in [`docs/consumer-integration.md`](consumer-integration.md).

## Repository commands

From the repository root:

```bash
npm test
npm run build
npm run check
pytest -q tests
```

Package-level commands are also available in each workspace:

```bash
npm --workspace bridge run test
npm --workspace packages/client run test
npm --workspace examples/consumer-dashboard run build
```

## Home Assistant development instance

The development Home Assistant instance lives in [`dev/home-assistant/`](../dev/home-assistant/). It is for local Varco integration development and for the remote public showcase target deployed by CI.

It runs Home Assistant Container pinned to `2026.6.1` by default, with:

- this checkout's `custom_components/varco` mounted into `/config/custom_components/varco`;
- Varco configured automatically from YAML;
- WebRTC disabled so startup is deterministic and relay behavior is the baseline;
- synthetic Powerwall-style energy entities;
- synthetic lights, switches, comfort sensors, occupancy sensors, and door sensors;
- a Lovelace dashboard named **Varco Showcase**.

### Run or restart locally

```bash
cd dev/home-assistant
docker compose down
docker compose up -d
```

Check the instance:

```bash
docker compose ps
curl -f http://127.0.0.1:8123/
curl -f http://127.0.0.1:8123/varco
```

Open:

```text
http://127.0.0.1:8123
```

After onboarding, the sidebar should contain:

- **Varco**: the custom integration admin panel, with Authority ID, relay status, requests, and grants.
- **Varco Showcase**: the standard Lovelace dashboard with synthetic entities.
- **Varco Local Hass**: a custom-card dashboard that uses `createVarcoConsumerClient({ hass })` with the Home Assistant frontend session.

The synthetic energy dashboard is available at:

```text
http://127.0.0.1:8123/varco-showcase/energy
```

Runtime Home Assistant storage under `dev/home-assistant/config/.storage/` is local state and must not be committed.

### Varco local automation tools

The development Home Assistant account is intentionally fixed for automation:

```text
HA_URL=http://127.0.0.1:8123
HA_USERNAME=test
HA_PASSWORD=test
```

The helper CLI in `dev/home-assistant/tools/` logs in through the real Home Assistant auth flow, uses the Home Assistant admin WebSocket API for approval/deletion, and uses `@varco/client` for the Varco data plane. It does not write Varco storage directly.

List the local Authority, access requests, and grants:

```bash
npm run dev:ha:list
```

Run the relay end-to-end smoke loop:

```bash
npm run dev:ha:smoke
```

The relay smoke command builds `@varco/client`, creates a new consumer identity, requests access, approves it through `/varco` admin WebSocket commands, connects over the relay, reads `sensor.powerwall_load_w`, queries history, toggles `switch.ev_charger`, and deletes the smoke-test grant.

Build the local Home Assistant custom-card assets:

```bash
npm run dev:ha:local-assets
```

This copies the built `@varco/client` browser bundle and the `Varco Local Hass` custom card into `dev/home-assistant/config/www`, which Home Assistant serves under `/local/`.

Run the local Home Assistant frontend-session browser test:

```bash
npm run dev:ha:local-browser
```

The browser test uses Playwright to log in to Home Assistant, open `/varco-local-hass/hass-first`, verify the visible `Varco Local Hass` custom card, click the local service-call and history buttons, wait for a local `state_delta`, and write a screenshot to `.pi/varco-local-hass-e2e.png`.

Run the local Home Assistant frontend-session smoke loop:

```bash
npm run dev:ha:local-smoke
```

The local smoke command builds `@varco/client`, logs in to the real development Home Assistant instance, creates a `hass`-shaped object from the Home Assistant admin WebSocket API, and verifies `createVarcoConsumerClient({ hass })` without pairing or grants. It reads `sensor.powerwall_load_w`, subscribes to `switch.ev_charger`, calls the local Home Assistant service API, forwards a fresh `hass` object through `updateHass()`, checks the local `state_delta`, and queries recorder history through `history/history_during_period`.

Create and approve a reusable development grant without cleanup:

```bash
npm run dev:ha:pair
```

The pair command stores the development consumer identity in `.pi/varco-dev-consumer.json`, which is ignored by git.

Manual approval/deletion helpers are also available:

```bash
npm run dev:ha:approve -- REQUEST_ID
npm run dev:ha:delete-grant -- GRANT_ID
```

Run the tool unit tests:

```bash
npm run dev:ha:tools:test
```

### Synthetic energy entities

`examples/gazzetta-energy-showcase` expects these entities:

```text
sensor.powerwall_load_w
sensor.powerwall_solar_w
sensor.powerwall_site_w
sensor.powerwall_battery_w
sensor.powerwall_charge
```

The synthetic model updates every 15 seconds. Recorder/history are enabled, so Varco history queries have useful data after the instance has been running for a while.

### Extra synthetic entities

Read/subscribe targets:

```text
sensor.outdoor_temperature
sensor.living_room_temperature
sensor.living_room_humidity
sensor.air_quality_co2
sensor.ev_charge
binary_sensor.front_door
binary_sensor.kitchen_motion
binary_sensor.garage_door
light.kitchen_pendants
light.living_room_lamps
light.studio_desk
light.garden_string_lights
switch.ev_charger
switch.coffee_machine
```

Action scopes that are safe to demo:

```text
light.turn_on@light.kitchen_pendants
light.turn_off@light.kitchen_pendants
light.turn_on@light.living_room_lamps
light.turn_off@light.living_room_lamps
light.turn_on@light.studio_desk
light.turn_off@light.studio_desk
light.turn_on@light.garden_string_lights
light.turn_off@light.garden_string_lights
switch.turn_on@switch.ev_charger
switch.turn_off@switch.ev_charger
switch.turn_on@switch.coffee_machine
switch.turn_off@switch.coffee_machine
```

## Remote Home Assistant showcase

The same development instance can be deployed to a Docker-capable VM or Proxmox LXC for public demos.

Recommended LXC shape:

- Ubuntu 24.04 or Debian 12
- 2 vCPU
- 2 GB RAM
- 16 GB disk
- nesting enabled, so Docker can run inside the LXC
- public IPv6 address routed to the LXC
- optional private IPv4 address plus host port-forward for SSH deploys
- outbound HTTPS/WebSocket access for the Varco bridge

Deploy manually:

```bash
./dev/home-assistant/deploy-to-docker-host.sh root@LXC_IP /opt/varco-ha-showcase
```

The script copies the Home Assistant config plus the local Varco integration, installs Docker if missing, writes `.env` with the integration mount path and HTTP port, then runs `docker compose up -d --force-recreate homeassistant` so the latest custom integration code is loaded on every deploy.

If the Home Assistant port is not public, tunnel it:

```bash
ssh -L 8123:127.0.0.1:8123 USER@SERVER
```

Then browse to:

```text
http://localhost:8123
```

## CI deployment

The GitHub Actions workflow lives at [`.github/workflows/deploy-ha-showcase.yml`](../.github/workflows/deploy-ha-showcase.yml).

Configure these secrets for remote deployment:

```text
HA_SHOWCASE_HOST
HA_SHOWCASE_SSH_KEY
HA_SHOWCASE_USER
HA_SHOWCASE_PORT
HA_SHOWCASE_REMOTE_DIR
HA_SHOWCASE_PUBLIC_URL
HA_SHOWCASE_HTTP_PORT
```

The remote `.storage` directory is intentionally preserved across deploys so the Home Assistant admin user, Varco Authority ID, grants, and recorder history remain stable across code updates. The current Antimatter showcase LXC uses SSH port `2306`, remote directory `/opt/varco-ha-showcase`, and binds Home Assistant to port `80` for Cloudflare-compatible HTTP proxying.

The public hostname `varco-ha.andreabaccega.com` is served by the Cloudflare Worker in [`dev/home-assistant/cloudflare-proxy-worker.js`](../dev/home-assistant/cloudflare-proxy-worker.js) as a custom domain. The worker forwards to the showcase LXC over its routed IPv6 address through `sslip.io`, while Cloudflare publishes proxied A/AAAA records for the public hostname.

The Gazzetta-style public consumer demo is deployed to `https://varco-demo.andreabaccega.com/` as a Cloudflare Worker static-assets deployment named `varco-demo`. After Home Assistant is deployed, CI can run `npm run dev:ha:gazzetta-demo` against `HA_SHOWCASE_PUBLIC_URL`; this fetches the remote Authority ID, creates a read-only Varco request for the energy entities in `examples/gazzetta-energy-showcase`, approves it through the Home Assistant admin WebSocket API, writes the generated Authority and grant bundle into `examples/gazzetta-energy-showcase/src/generated-demo-grant.ts`, rebuilds the dashboard, and deploys only `index.html` plus `main.js` to Cloudflare. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets to enable the Cloudflare deploy step in CI.
