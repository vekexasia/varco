import { createVarcoClient, type HassState, type StorageLike, type VarcoClient } from "@varco/client";
import {
  BRIDGE_URL,
  COMFORT_ENTITIES,
  createGuestStayManifest,
  DEFAULT_AUTHORITY_ID,
  DEMO_GRANT_BUNDLE,
  ENERGY_ENTITIES,
  FORCE_RELAY_ONLY,
  HOUSE_ENTITIES,
  LIGHT_ENTITIES,
  READ_ENTITIES,
} from "./config.js";
import { clearShowcaseGrant, loadShowcaseGrant, markShowcaseGrantApproved, savePendingShowcaseGrant, SHOWCASE_GRANT_KEY, type ShowcaseGrantStorage } from "./grant-store.js";

const app = document.getElementById("app")!;
const values = new Map<string, HassState | null>();
let client: VarcoClient | null = null;
let phase: "setup" | "pending" | "connecting" | "live" | "error" = DEMO_GRANT_BUNDLE ? "connecting" : "setup";
let message = "";
let lastUpdate = "waiting";
let transport = FORCE_RELAY_ONLY ? "Encrypted relay" : "Encrypted relay / P2P";
let busyAction = "";
let selectedTargetTemperature: number | null = null;
const grantStorage = createDemoStorage(window.localStorage);

const LIGHTS = [
  ["Kitchen", LIGHT_ENTITIES.kitchen],
  ["Living room", LIGHT_ENTITIES.livingRoom],
  ["Bedroom", LIGHT_ENTITIES.bedroom],
  ["Terrace", LIGHT_ENTITIES.terrace],
] as const;

const css = `
:root{--ink:#222222;--muted:#6a6a6a;--line:#e6e6e6;--soft:#f7f7f7;--accent:#ff385c;--accent-dark:#d70b48;--green:#008a05;--radius:12px;font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:#fff}
*{box-sizing:border-box}body{margin:0;background:#fff}.nav{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid var(--line)}.nav-inner{max-width:1120px;margin:0 auto;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{display:flex;align-items:center;gap:9px;color:var(--accent);font-weight:800;font-size:19px;letter-spacing:-.02em}.brand svg{width:28px;height:28px;flex:none}.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.06)}.dot{width:8px;height:8px;border-radius:50%;background:var(--green)}.dot.idle{background:#c4c4c4}
.shell{max-width:1120px;margin:0 auto;padding:0 24px 40px}.title-row{padding:22px 0 14px}.title-row h1{font-size:26px;letter-spacing:-.02em;margin:0 0 6px}.title-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;color:var(--ink)}.title-meta .sep::before{content:'\u00b7';margin-right:14px;color:var(--muted)}.title-meta b{font-weight:600}.under{color:var(--muted);text-decoration:underline}
.gallery{display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:190px 190px;gap:8px;border-radius:16px;overflow:hidden}.gallery img{width:100%;height:100%;object-fit:cover;display:block}.gallery .main{grid-row:1/3}
.layout{display:grid;grid-template-columns:1fr 380px;gap:48px;margin-top:30px}.section{padding:26px 0;border-bottom:1px solid var(--line)}.section:first-child{padding-top:0}.section h2{font-size:21px;letter-spacing:-.01em;margin:0 0 4px}.hint{color:var(--muted);font-size:14.5px;line-height:1.5;margin:0 0 18px}
.rooms{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.room{border:1px solid var(--line);border-radius:var(--radius);padding:16px}.room-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.room-name{font-weight:600;font-size:15.5px}.state{font-size:13.5px;color:var(--muted);margin-top:4px}.bulb{font-size:20px}.switches{display:flex;gap:8px;margin-top:14px}
.btn{border:1px solid var(--ink);border-radius:8px;padding:9px 16px;background:#fff;color:var(--ink);font-weight:600;font-size:14px;cursor:pointer;font-family:inherit}.btn:hover{background:var(--soft)}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn.primary:hover{background:var(--accent-dark);border-color:var(--accent-dark)}.btn.ghost{border-color:var(--line);color:var(--ink)}.btn:disabled{cursor:not-allowed;opacity:.45}
.actions{display:grid;gap:0}.action{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 0;border-bottom:1px solid var(--line)}.action:last-child{border-bottom:0}.action b{font-size:15.5px;font-weight:600}.action .state{margin-top:3px}.action-buttons{display:flex;gap:8px;flex:none}
.guide{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.guide-card{border:1px solid var(--line);border-radius:var(--radius);padding:18px}.guide-card h3{margin:0 0 8px;font-size:15.5px}.guide-card p{margin:0;color:var(--muted);font-size:14px;line-height:1.55}
.side{position:sticky;top:86px;align-self:start;display:grid;gap:20px}.panel{border:1px solid var(--line);border-radius:14px;padding:22px;box-shadow:0 6px 20px rgba(0,0,0,.08)}.panel h2{font-size:17px;margin:0 0 14px}.stay-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:14px}.stay-cell{padding:11px 13px;border-bottom:1px solid var(--line)}.stay-cell:nth-child(odd){border-right:1px solid var(--line)}.stay-cell:nth-last-child(-n+2){border-bottom:0}.label{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink)}.value{font-size:14px;color:var(--muted);margin-top:3px}
.comfort{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.metric{border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center}.metric .label{color:var(--muted)}.metric b{display:block;font-size:21px;margin-top:6px;font-weight:700}
.temp-row{display:flex;gap:10px;align-items:center;margin-top:12px}.range{accent-color:var(--accent);flex:1}.temp-actions{display:flex;gap:8px;margin-top:12px}.temp-actions .btn{flex:1}
.status-list{display:grid}.status-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:14.5px}.status-row:last-child{border-bottom:0;padding-bottom:0}.status-row b{font-weight:600}
.setup{max-width:560px;margin:36px auto}.setup .panel h2{font-size:20px}.field{display:grid;gap:6px;margin:14px 0}.field input{border:1px solid var(--line);border-radius:8px;padding:12px;font:inherit}.notice{margin-top:14px;color:var(--muted);font-size:14px;line-height:1.5}.error{color:#c13515}
.progress{height:6px;border-radius:999px;background:var(--soft);overflow:hidden;margin:18px 0 4px;position:relative}.progress::after{content:'';position:absolute;inset:0;width:38%;border-radius:999px;background:var(--accent);animation:slide 1.15s ease-in-out infinite}@keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(290%)}}
.footer{max-width:1120px;margin:0 auto;padding:20px 24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:14px;color:var(--muted);font-size:13px}.trust{font-weight:600;color:var(--ink)}
@media(max-width:920px){.layout{grid-template-columns:1fr}.side{position:static}.gallery{grid-template-columns:1fr;grid-template-rows:240px;border-radius:12px}.gallery img:not(.main){display:none}.rooms,.guide{grid-template-columns:1fr}.title-row h1{font-size:22px}.footer{display:block}.footer div{margin:6px 0}.action{flex-wrap:wrap}.action-buttons{width:100%}.action-buttons .btn{flex:1}}`;

const PHOTOS = [
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=75",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=640&q=70",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=640&q=70",
  "https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=640&q=70",
  "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=640&q=70",
] as const;

const LOGO = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 4 4 14v13h8v-8h8v8h8V14L16 4z" fill="currentColor"/></svg>`;

function render(): void {
  const target = targetTemperature();
  app.innerHTML = `<style>${css}</style>
  <nav class="nav"><div class="nav-inner"><div class="brand">${LOGO}<span>Casa Varco</span></div><span class="pill"><span class="dot ${phase === "live" ? "" : "idle"}"></span>${phase === "live" ? "Access active" : "Guest link"}</span></div></nav>
  <div class="shell">
    <section class="title-row"><h1>Casa Varco · Bright two-bedroom flat with terrace</h1><div class="title-meta"><span><b>★ 4.96</b></span><span class="sep under">214 reviews</span><span class="sep under">Milano, Italy</span><span class="sep">Checkout 11:00 · updated ${esc(lastUpdate)}</span></div></section>
    <section class="gallery"><img class="main" src="${PHOTOS[0]}" alt="Living room"><img src="${PHOTOS[1]}" alt="Bedroom"><img src="${PHOTOS[2]}" alt="Kitchen"><img src="${PHOTOS[3]}" alt="Bathroom"><img src="${PHOTOS[4]}" alt="Terrace">
    </section>
    ${phase === "live" ? liveView(target) : setupView()}
  </div>
  <footer class="footer"><div class="trust">Varco trust boundary: the browser never receives a Home Assistant token.</div><div>${esc(transport)} · host-approved scopes only</div></footer>`;
  bind();
}

function setupView(): string {
  const saved = loadShowcaseGrant(grantStorage, DEFAULT_AUTHORITY_ID);
  if (DEMO_GRANT_BUNDLE) {
    const failed = phase === "error";
    return `<section class="setup"><div class="panel"><h2>${failed ? "Connection problem" : "Opening your guest link"}</h2><p class="hint">A pre-approved demo grant is bundled with this link. No pairing screen needed.</p>${failed ? `<button class="btn primary" id="connect">Retry</button>` : `<div class="progress" role="progressbar" aria-label="Connecting"></div>`}<div class="notice ${failed ? "error" : ""}">${esc(message || "Connecting to Casa Varco...")}</div></div></section>`;
  }
  const savedText = saved?.status === "approved" ? "Saved guest grant found. Press Connect to resume your stay dashboard." : saved?.status === "pending" ? `Pairing code ${saved.pairingCode}. Ask the host to approve it, then press Connect.` : "Fresh clone mode: request a grant from the host, or bundle a pre-approved demo grant for public links.";
  return `<section class="setup"><div class="panel"><h2>Guest link setup</h2><p class="hint">Public demos use a bundled grant. This fallback pairing screen is only for local development.</p><label class="field"><span class="label">Authority ID</span><input id="authority" value="${esc(DEFAULT_AUTHORITY_ID)}"></label><button class="btn primary" id="request">Request host approval</button> <button class="btn ghost" id="connect">Connect</button>${saved ? ` <button class="btn ghost" id="clearGrant">Forget grant</button>` : ""}<div class="notice ${phase === "error" ? "error" : ""}">${esc(message || savedText)}</div></div></section>`;
}

function liveView(target: number): string {
  return `<div class="layout"><div>
    <section class="section"><h2>Room controls</h2><p class="hint">Lights are limited to the rooms your host approved for this stay.</p><div class="rooms">${LIGHTS.map(([name, entity]) => roomControl(name, entity)).join("")}</div></section>
    <section class="section"><h2>Quick actions</h2><p class="hint">Simple scenes built from the same approved light, cooling, and coffee controls.</p><div class="actions">
      <div class="action"><div><b>Arrival glow</b><div class="state">Living room and kitchen on</div></div><div class="action-buttons"><button class="btn primary" data-scene="arrival">Start</button></div></div>
      <div class="action"><div><b>Good night</b><div class="state">Lights off, cooling off</div></div><div class="action-buttons"><button class="btn ghost" data-scene="night">Start</button></div></div>
      <div class="action"><div><b>Morning coffee</b><div class="state">Coffee machine is ${titleState(HOUSE_ENTITIES.coffeeMachine).toLowerCase()}</div></div><div class="action-buttons"><button class="btn ghost" data-switch="${HOUSE_ENTITIES.coffeeMachine}" data-state="on">On</button><button class="btn ghost" data-switch="${HOUSE_ENTITIES.coffeeMachine}" data-state="off">Off</button></div></div>
      <div class="action"><div><b>Unlock front door</b><div class="state">Not available: the host did not grant lock actions.</div></div><div class="action-buttons"><button class="btn ghost" disabled>Not granted</button></div></div>
    </div></section>
    <section class="section"><h2>Stay guide</h2><p class="hint">Everything a guest needs, without Home Assistant jargon.</p><div class="guide"><div class="guide-card"><h3>Wi-Fi</h3><p>Network: Casa Varco Guest<br>Password: ask-your-host</p></div><div class="guide-card"><h3>House notes</h3><p>Quiet hours after 22:00. Checkout is 11:00. Door unlock remains host-managed for safety.</p></div></div></section>
  </div><aside class="side">
    <div class="panel"><h2>Your stay</h2><div class="stay-grid"><div class="stay-cell"><div class="label">Check-in</div><div class="value">Today 15:00</div></div><div class="stay-cell"><div class="label">Checkout</div><div class="value">Tomorrow 11:00</div></div><div class="stay-cell"><div class="label">Access</div><div class="value">${phase === "live" ? "Active" : "Pending"}</div></div><div class="stay-cell"><div class="label">Updated</div><div class="value">${esc(lastUpdate)}</div></div></div><div class="status-list"><div class="status-row"><span>Front door</span><b>${binary(HOUSE_ENTITIES.frontDoor, "Open", "Closed")}</b></div><div class="status-row"><span>Motion near kitchen</span><b>${binary(HOUSE_ENTITIES.motion, "Detected", "Quiet")}</b></div><div class="status-row"><span>Solar right now</span><b>${kw(ENERGY_ENTITIES.solar)} kW</b></div><div class="status-row"><span>Battery</span><b>${round(ENERGY_ENTITIES.batteryCharge)}%</b></div></div></div>
    <div class="panel"><h2>Comfort</h2><div class="comfort"><div class="metric"><span class="label">Room</span><b>${temp(COMFORT_ENTITIES.temperature)}°</b></div><div class="metric"><span class="label">Humidity</span><b>${round(COMFORT_ENTITIES.humidity)}%</b></div><div class="metric"><span class="label">CO2</span><b>${round(COMFORT_ENTITIES.co2)}</b></div></div><p class="hint" style="margin:0">Temperature is constrained to 19-24°C for this stay. Cooling is ${titleState(COMFORT_ENTITIES.cooling).toLowerCase()}.</p><div class="temp-row"><button class="btn ghost" data-temp="${target - 1}" ${target <= 19 ? "disabled" : ""}>−</button><input class="range" id="temp" type="range" min="19" max="24" step="1" value="${target}"><button class="btn ghost" data-temp="${target + 1}" ${target >= 24 ? "disabled" : ""}>+</button></div><div class="temp-actions"><button class="btn primary" id="applyTemp">Set ${target}°C</button></div><div class="temp-actions"><button class="btn ghost" data-switch="${COMFORT_ENTITIES.cooling}" data-state="on" ${state(COMFORT_ENTITIES.cooling) === "on" ? "disabled" : ""}>Cooling on</button><button class="btn ghost" data-switch="${COMFORT_ENTITIES.cooling}" data-state="off" ${state(COMFORT_ENTITIES.cooling) === "off" ? "disabled" : ""}>Cooling off</button></div></div>
  </aside></div>`;
}

function roomControl(name: string, entity: string): string {
  const on = state(entity) === "on";
  return `<div class="room"><div class="room-head"><div><div class="room-name">${esc(name)}</div><div class="state">${titleState(entity)}${brightness(entity)}</div></div><span class="bulb">${on ? "💡" : "○"}</span></div><div class="switches"><button class="btn ${on ? "ghost" : "primary"}" data-light="${entity}" data-state="on" ${on ? "disabled" : ""}>On</button><button class="btn ghost" data-light="${entity}" data-state="off" ${on ? "" : "disabled"}>Off</button></div></div>`;
}

function bind(): void {
  document.getElementById("request")?.addEventListener("click", requestGrant);
  document.getElementById("connect")?.addEventListener("click", connectLive);
  document.getElementById("clearGrant")?.addEventListener("click", () => { clearShowcaseGrant(grantStorage); phase = "setup"; message = "Saved grant removed."; render(); });
  document.querySelectorAll<HTMLElement>("[data-light]").forEach((el) => el.addEventListener("click", () => void setLight(el.dataset.light!, el.dataset.state === "on")));
  document.querySelectorAll<HTMLElement>("[data-switch]").forEach((el) => el.addEventListener("click", () => void setSwitch(el.dataset.switch!, el.dataset.state === "on")));
  document.querySelectorAll<HTMLElement>("[data-temp]").forEach((el) => el.addEventListener("click", () => chooseTemperature(Number(el.dataset.temp))));
  document.getElementById("applyTemp")?.addEventListener("click", () => void setTemperature(targetTemperature()));
  document.querySelectorAll<HTMLElement>("[data-scene]").forEach((el) => el.addEventListener("click", () => void runScene(el.dataset.scene!)));
  document.getElementById("temp")?.addEventListener("input", (event) => chooseTemperature(Number((event.currentTarget as HTMLInputElement).value)));
}

function authorityId(): string { return DEMO_GRANT_BUNDLE?.authorityId || (document.getElementById("authority") as HTMLInputElement | null)?.value.trim() || DEFAULT_AUTHORITY_ID; }

function makeClient(): VarcoClient {
  client = createVarcoClient({
    authorityId: authorityId(), bridgeUrl: BRIDGE_URL, manifest: createGuestStayManifest(), storage: grantStorage,
    webrtc: !FORCE_RELAY_ONLY, reconnect: true, warn: console.warn,
    onTransportStatus: (status) => { transport = status.mode === "p2p" ? "Encrypted peer-to-peer" : status.detail || "Encrypted relay"; render(); },
  });
  return client;
}

async function requestGrant(): Promise<void> {
  try {
    const c = makeClient();
    const access = await c.requestAccess();
    savePendingShowcaseGrant(grantStorage, { authorityId: authorityId(), consumerPublicKey: c.consumerPublicKey, requestId: access.request_id, pairingCode: access.pairing_code });
    phase = "pending"; message = `Pairing code ${access.pairing_code}. Ask the host to approve it, then press Connect.`;
  } catch (err) { phase = "error"; message = errorMessage(err); }
  render();
}

async function connectLive(): Promise<void> {
  phase = "connecting"; message = "Connecting to the host-approved guest grant..."; render();
  try {
    const c = client || makeClient();
    await c.connect();
    markShowcaseGrantApproved(grantStorage, authorityId());
    applyStates(await c.getStates(READ_ENTITIES));
    await c.subscribeEntities(READ_ENTITIES, (event) => { if (event.states) applyStates(event.states as Record<string, HassState | null>); });
    phase = "live"; message = "";
  } catch (err) { phase = "error"; message = errorMessage(err); }
  render();
}

async function setLight(entity: string, on: boolean): Promise<void> { await action(`${entity}:${on}`, async () => { if (on) await client?.light.turnOn(entity); else await client?.light.turnOff(entity); optimisticState(entity, on ? "on" : "off", on ? { brightness: 150 } : {}); }); }
async function setSwitch(entity: string, on: boolean): Promise<void> { await action(`${entity}:${on}`, async () => { if (on) await client?.switch.turnOn(entity); else await client?.switch.turnOff(entity); optimisticState(entity, on ? "on" : "off"); }); }
function chooseTemperature(value: number): void { selectedTargetTemperature = clampTemperature(value); render(); }
async function setTemperature(value: number): Promise<void> { const next = clampTemperature(value); selectedTargetTemperature = next; await action(`temp:${next}`, async () => { await client?.climate.setTemperature(COMFORT_ENTITIES.climate, next); optimisticAttributes(COMFORT_ENTITIES.climate, { temperature: next }); }); }
async function runScene(scene: string): Promise<void> {
  if (scene === "arrival") await action("arrival", async () => { await client?.light.turnOn(LIGHT_ENTITIES.livingRoom); await client?.light.turnOn(LIGHT_ENTITIES.kitchen); });
  if (scene === "night") await action("night", async () => { await Promise.all(Object.values(LIGHT_ENTITIES).map((entity) => client?.light.turnOff(entity))); await client?.switch.turnOff(COMFORT_ENTITIES.cooling); });
}
async function action(name: string, fn: () => Promise<void | unknown>): Promise<void> {
  if (!client || busyAction) return;
  busyAction = name; render();
  try { await fn(); message = ""; }
  catch (err) { phase = "error"; message = errorMessage(err); }
  finally { busyAction = ""; render(); }
}

function optimisticState(entity: string, nextState: string, attributes: Record<string, unknown> = {}): void {
  const current = values.get(entity);
  values.set(entity, { entity_id: entity, state: nextState, attributes: { ...(current?.attributes ?? {}), ...attributes } });
}
function optimisticAttributes(entity: string, attributes: Record<string, unknown>): void {
  const current = values.get(entity);
  values.set(entity, { entity_id: entity, state: current?.state ?? "-", attributes: { ...(current?.attributes ?? {}), ...attributes } });
}
function applyStates(states: Record<string, HassState | null>): void { for (const [entity, value] of Object.entries(states)) values.set(entity, value); lastUpdate = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); if (phase === "live") render(); }
function createDemoStorage(storage: Storage): StorageLike & ShowcaseGrantStorage { if (!DEMO_GRANT_BUNDLE) return storage; storage.setItem("varco.consumerIdentity.v1", JSON.stringify(DEMO_GRANT_BUNDLE.identity)); storage.setItem(SHOWCASE_GRANT_KEY, JSON.stringify(DEMO_GRANT_BUNDLE.grant)); return storage; }
function state(entity: string): string { return String(values.get(entity)?.state ?? "-"); }
function num(entity: string): number | null { const value = Number(values.get(entity)?.state); return Number.isFinite(value) ? value : null; }
function round(entity: string): string { const value = num(entity); return value == null ? "-" : String(Math.round(value)); }
function temp(entity: string): string { const value = num(entity); return value == null ? "-" : value.toFixed(1); }
function kw(entity: string): string { const value = num(entity); return value == null ? "-" : Math.abs(value / 1000).toFixed(1); }
function titleState(entity: string): string { const value = state(entity); return value === "-" ? "-" : value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " "); }
function binary(entity: string, onWord: string, offWord: string): string { return state(entity) === "on" ? onWord : offWord; }
function brightness(entity: string): string { const raw = Number(values.get(entity)?.attributes?.brightness); return state(entity) === "on" && Number.isFinite(raw) ? ` · ${Math.round(raw / 255 * 100)}%` : ""; }
function targetTemperature(): number { const value = selectedTargetTemperature ?? Number(values.get(COMFORT_ENTITIES.climate)?.attributes?.temperature); return Number.isFinite(value) ? clampTemperature(value) : 21; }
function clampTemperature(value: number): number { return Math.max(19, Math.min(24, Math.round(value))); }
function errorMessage(err: unknown): string { return err instanceof Error ? err.message : String(err); }
function esc(value: string): string { return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!); }

render();
if (DEMO_GRANT_BUNDLE) void connectLive();
