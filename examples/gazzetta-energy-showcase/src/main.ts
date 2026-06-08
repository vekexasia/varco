import { createVarcoClient, type HassState, type StorageLike, type VarcoClient } from "@varco/client";
import {
  BRIDGE_URL,
  COMFORT_ENTITIES,
  createReadOnlyManifest,
  DEFAULT_AUTHORITY_ID,
  DEMO_GRANT_BUNDLE,
  ENERGY_ENTITIES,
  FORCE_RELAY_ONLY,
  HISTORY_ENTITIES,
  LIGHT_ENTITIES,
  READ_ENTITIES,
  SECURITY_ENTITIES,
  UTILITY_ENTITIES,
} from "./config.js";
import { clearShowcaseGrant, loadShowcaseGrant, markShowcaseGrantApproved, savePendingShowcaseGrant, SHOWCASE_GRANT_KEY, type ShowcaseGrantStorage } from "./grant-store.js";

const app = document.getElementById("app")!;
const values = new Map<string, HassState | null>();
const samples: number[] = [];
let client: VarcoClient | null = null;
let lastUpdate = "-";
let transport = FORCE_RELAY_ONLY ? "Cloudflare relay - P2P disabled" : "Cloudflare relay - negotiating P2P";
let transportMode: "relay" | "p2p" = "relay";
let phase: "setup" | "pending" | "live" | "error" = "setup";
let message = "";
const grantStorage = createDemoStorage(window.localStorage);
const historyEntitySet = new Set<string>(HISTORY_ENTITIES);

const css = `
:root{--ink:#211b14;--ink-2:#4a4036;--muted:#817767;--faint:#b7ac99;--line:#d8cfbb;--line-2:#c7bca3;--paper:#f4efe1;--paper-dim:#e7dfcd;--accent:#be5a38;--accent-deep:#934026;--accent-wash:#f3e4d8;--ok:#5f6b4f;--cool:#3a6ea5;--serif-display:'Libre Caslon Display',Georgia,serif;--serif-body:'Newsreader',Georgia,serif;--label-font:'Spline Sans Mono',ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:#d8cfbb;color:var(--ink);font-family:var(--serif-body);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}.page{max-width:1040px;margin:0 auto;min-height:100vh;background:var(--paper);box-shadow:0 18px 70px rgba(33,27,20,.2)}.mast{padding:26px 30px 0}.mast-top{display:flex;justify-content:space-between;font-family:var(--label-font);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);padding-bottom:9px;border-bottom:1px solid var(--ink)}.flag{font-family:var(--serif-display);font-weight:600;font-size:clamp(44px,10vw,74px);line-height:.96;text-align:center;letter-spacing:-.02em;margin:12px 0 14px}.mast-rule{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);font-family:var(--label-font);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);text-align:center}.mast-rule>span:first-child{text-align:left}.mast-rule>span:last-child{text-align:right}.nav{display:flex;justify-content:center;border-bottom:1px solid var(--line)}.nav span{font-family:var(--label-font);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink);font-weight:600;padding:11px 15px;box-shadow:inset 0 -2px 0 var(--accent)}.lead{padding:22px 30px;border-bottom:3px double var(--ink)}.kick{font-family:var(--label-font);font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);font-weight:600}.byline{font-family:var(--label-font);font-size:11px;color:var(--muted);margin-top:4px;letter-spacing:.04em}.headline{font-family:var(--serif-display);font-weight:500;font-size:clamp(28px,5.5vw,42px);line-height:1.12;margin:13px 0 0}.drop{float:left;font-family:var(--serif-display);font-weight:600;color:var(--accent);font-size:3.1em;line-height:.66;padding-right:.07em;margin-top:.03em}.sub{font-style:italic;font-size:clamp(15px,3vw,18px);line-height:1.5;color:var(--ink-2);margin:12px 0 0}.full{padding:0 30px}.grid{display:grid;grid-template-columns:1fr 1fr}.col{padding:0 30px}.col-rule{border-left:1px solid var(--line)}.panel{padding:20px 0;border-bottom:1px solid var(--line)}.kicker{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:8px;border-bottom:2px solid var(--ink);margin-bottom:14px}.kicker>span:first-child{font-family:var(--label-font);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink);font-weight:600}.note{font-family:var(--label-font);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.flow,.stat-grid,.room-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line)}.stat-grid{grid-template-columns:repeat(3,1fr)}.room-grid{grid-template-columns:repeat(2,1fr)}.node,.stat,.room{padding:16px 10px;text-align:center;border-left:1px solid var(--line);border-top:1px solid var(--line)}.node:nth-child(1),.stat:nth-child(1),.room:nth-child(1){border-left:0}.flow .node{border-top:0}.stat:nth-child(-n+3),.room:nth-child(-n+2){border-top:0}.node[data-tone=accent] .nval,.stat[data-tone=accent] .nval{color:var(--accent-deep)}.node[data-tone=ok] .nval,.stat[data-tone=ok] .nval{color:var(--ok)}.node[data-tone=cool] .nval,.stat[data-tone=cool] .nval{color:var(--cool)}.nicon{font-family:var(--label-font);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}.nval{font-family:var(--serif-display);font-size:30px;line-height:1}.nval i{font-family:var(--serif-body);font-style:normal;font-size:13px;color:var(--muted);margin-left:3px}.nlbl{font-family:var(--label-font);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:5px}.line{display:flex;align-items:baseline;gap:8px;padding:10px 0;border-top:1px dotted var(--line)}.line:first-child{border-top:0}.line-name{font-size:15px}.dots{flex:1;border-bottom:1px dotted var(--line);align-self:flex-end;height:0;margin-bottom:6px}.line-val{font-family:var(--serif-display);font-size:23px;white-space:nowrap}.line-val i{font-family:var(--serif-body);font-style:normal;font-size:12px;color:var(--muted);margin-left:2px}.chart{width:100%;height:148px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(190,90,56,.06),rgba(0,0,0,0));display:block}.setup{padding:18px 30px 30px}.box{border:1px solid var(--line-2);background:var(--paper);padding:14px;margin-top:14px}.field{display:grid;gap:5px;margin:10px 0;font-family:var(--label-font);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}input{font:14px var(--label-font);border:1px solid var(--line-2);background:var(--paper-dim);color:var(--ink);padding:10px 11px}button{font-family:var(--label-font);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);background:var(--paper);border:1px solid var(--line-2);border-radius:5px;padding:9px 12px;cursor:pointer;margin-right:8px}button:hover{background:var(--accent-wash);border-color:var(--accent);color:var(--accent-deep)}.status{font-family:var(--label-font);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ok);margin-top:10px}.error{color:var(--accent-deep)}.clickable{cursor:pointer;transition:background .12s}.clickable:hover{background:var(--accent-wash)}.modal{position:fixed;inset:0;z-index:60;background:rgba(33,27,20,.55);backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px;overflow:auto}.modal-card{background:var(--paper);border:1px solid var(--line-2);border-radius:8px;max-width:680px;width:100%;max-height:88vh;display:flex;flex-direction:column;padding:22px 24px 18px;box-shadow:0 30px 80px rgba(40,30,18,.45);position:relative}.modal-body{flex:1 1 auto;overflow:auto;min-height:0}.modal-x{position:absolute;top:8px;right:12px;border:0;background:none;font-size:26px;line-height:1;color:var(--muted);cursor:pointer}.modal-kick{font-family:var(--label-font);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);font-weight:600}.modal-title{font-family:var(--serif-display);font-weight:500;font-size:26px;line-height:1.1;margin:4px 0 14px;color:var(--ink)}.chart-stats{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:11px 0}.chart-stats span{display:flex;flex-direction:column}.chart-stats b{font-family:var(--serif-display);font-size:23px;line-height:1;color:var(--ink);font-weight:600}.chart-stats small{font-family:var(--label-font);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:3px}.history-svg{width:100%;height:auto;display:block;touch-action:none;cursor:crosshair}.psychro{margin-top:14px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(58,110,165,.07),rgba(190,90,56,.04));padding:12px}.psychro-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:8px}.psychro-title{font-family:var(--label-font);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);font-weight:600}.psychro-read{font-family:var(--label-font);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);text-align:right}.psychro svg{width:100%;height:auto;display:block}.psychro-axis{font-family:var(--label-font);font-size:8px;letter-spacing:.06em;text-transform:uppercase;fill:var(--muted)}.psychro-note{display:flex;justify-content:space-between;gap:10px;margin-top:7px;font-family:var(--label-font);font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.foot{text-align:center;font-family:var(--label-font);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);padding:22px 0 30px;border-top:1px solid var(--line);margin:0 30px}@media(max-width:760px){.grid,.flow,.stat-grid,.room-grid{grid-template-columns:1fr 1fr}.col-rule{border-left:0}.mast-rule{grid-template-columns:1fr}.mast-rule>span{text-align:center!important}.col{padding:0 30px}.page{box-shadow:none}}`;

function num(entity: string): number | null {
  const state = values.get(entity)?.state;
  if (state == null || state === "unknown" || state === "unavailable") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

function state(entity: string): string {
  return String(values.get(entity)?.state ?? "-");
}

function attr(entity: string, name: string): unknown {
  return values.get(entity)?.attributes?.[name];
}

function kw(entity: string): string {
  const n = num(entity);
  if (n == null) return "-";
  return Math.abs(n / 1000).toFixed(1);
}

function pct(entity: string): string {
  const n = num(entity);
  return n == null ? "-" : Math.round(n).toString();
}

function temp(entity: string): string {
  const n = num(entity);
  return n == null ? "-" : n.toFixed(1);
}

function ppm(entity: string): string {
  const n = num(entity);
  return n == null ? "-" : n.toFixed(0);
}

function renderChart(): string {
  const max = Math.max(1, ...samples.map(Math.abs));
  const points = samples.map((v, i) => `${(i / Math.max(1, samples.length - 1)) * 100},${74 - (v / max) * 62}`).join(" ");
  return `<svg class="chart" viewBox="0 0 100 148" preserveAspectRatio="none"><line x1="0" y1="74" x2="100" y2="74" stroke="var(--line)" stroke-width="1"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

type PsychroPoint = { key: string; label: string; tempC: number; rh: number; color: string };

function renderPsychrometricChart(): string {
  const points: PsychroPoint[] = [];
  const outsideT = num(COMFORT_ENTITIES.outdoorTemperature);
  const outsideRh = num(COMFORT_ENTITIES.outdoorHumidity);
  if (outsideT != null && outsideRh != null) points.push({ key: "outside", label: "outside", tempC: outsideT, rh: outsideRh, color: "var(--cool)" });
  const insideT = num(COMFORT_ENTITIES.livingRoomTemperature);
  const insideRh = num(COMFORT_ENTITIES.livingRoomHumidity);
  if (insideT != null && insideRh != null) points.push({ key: "inside", label: "inside", tempC: insideT, rh: insideRh, color: "var(--accent)" });
  const climateTarget = Number(attr(COMFORT_ENTITIES.climate, "temperature"));
  const climateRh = insideRh;
  if (Number.isFinite(climateTarget) && climateRh != null) points.push({ key: "climate", label: "climate", tempC: climateTarget, rh: climateRh, color: "var(--ok)" });
  if (points.length === 0) return `<div class="psychro"><div class="psychro-title">Psychrometric chart</div><div class="status">Waiting for temperature and humidity.</div></div>`;
  const W = 430, H = 210, padL = 32, padR = 14, padT = 14, padB = 28;
  const minT = 0, maxT = 40, minW = 0, maxW = 25;
  const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
  const x = (t: number) => padL + ((clamp(t, minT, maxT) - minT) / (maxT - minT)) * (W - padL - padR);
  const y = (w: number) => padT + (1 - (clamp(w, minW, maxW) - minW) / (maxW - minW)) * (H - padT - padB);
  const pointLine = (pts: [number, number][]) => pts.map(([t, w], index) => `${index ? "L" : "M"}${x(t).toFixed(1)} ${y(w).toFixed(1)}`).join(" ");
  const rhCurve = (rh: number) => pointLine(Array.from({ length: 41 }, (_, index) => {
    const t = minT + (index / 40) * (maxT - minT);
    return [t, humidityRatio(t, rh)] as [number, number];
  }));
  const comfort = [[20, 40], [26, 40], [26, 60], [20, 60]].map(([t, rh]) => `${x(t).toFixed(1)},${y(humidityRatio(t, rh)).toFixed(1)}`).join(" ");
  const ticks = [0, 10, 20, 30, 40].map((t) => `<text class="psychro-axis" x="${x(t).toFixed(0)}" y="${H - 7}" text-anchor="middle">${t}C</text>`).join("");
  const wTicks = [5, 10, 15, 20].map((value) => `<text class="psychro-axis" x="${padL - 7}" y="${y(value).toFixed(0)}" text-anchor="end">${value}</text><line x1="${padL}" y1="${y(value).toFixed(1)}" x2="${W - padR}" y2="${y(value).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`).join("");
  const markers = points.map((p) => {
    const w = humidityRatio(p.tempC, p.rh);
    const cx = x(p.tempC), cy = y(w);
    const ly = Math.max(padT + 11, cy - 9);
    return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(H - padB).toFixed(1)}" stroke="${p.color}" stroke-dasharray="3 3" opacity=".6"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="${p.color}" stroke="var(--paper)" stroke-width="2"/><text class="psychro-axis" x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" fill="var(--ink)">${esc(p.label)}</text>`;
  }).join("");
  const legend = points.map((p) => `<span style="color:${p.color}">&#9679; ${esc(p.label)} ${p.tempC.toFixed(1)}C / ${Math.round(p.rh)}% RH</span>`).join("");
  return `<div class="psychro"><div class="psychro-head"><div class="psychro-title">Psychrometric chart</div><div class="psychro-read">${legend}</div></div><svg viewBox="0 0 ${W} ${H}" aria-label="Psychrometric chart"><rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="rgba(244,239,225,.45)" stroke="var(--line)"/><polygon points="${comfort}" fill="var(--ok)" opacity=".16" stroke="var(--ok)" stroke-width="1.2"/><path d="${rhCurve(30)}" fill="none" stroke="var(--line-2)" stroke-width="1"/><path d="${rhCurve(50)}" fill="none" stroke="var(--cool)" stroke-width="1.4"/><path d="${rhCurve(70)}" fill="none" stroke="var(--line-2)" stroke-width="1"/><path d="${rhCurve(90)}" fill="none" stroke="var(--line-2)" stroke-width="1"/>${wTicks}${ticks}<text class="psychro-axis" x="${W - padR}" y="${padT + 10}" text-anchor="end">relative humidity curves</text><text class="psychro-axis" x="${padL + 5}" y="${padT + 13}">humidity ratio g/kg</text>${markers}</svg><div class="psychro-note"><span>Comfort band 20-26C / 40-60% RH</span><span>outside / inside / climate target</span></div></div>`;
}

function humidityRatio(tempC: number, relativeHumidity: number): number {
  const vaporPressure = (Math.max(0, Math.min(100, relativeHumidity)) / 100) * saturationVaporPressure(tempC);
  return 621.98 * vaporPressure / (101.325 - vaporPressure);
}

function saturationVaporPressure(tempC: number): number {
  return 0.61078 * Math.exp((17.2694 * tempC) / (tempC + 237.29));
}

function dewPoint(tempC: number, relativeHumidity: number): number {
  const rh = Math.max(1, Math.min(100, relativeHumidity));
  const gamma = Math.log(rh / 100) + (17.625 * tempC) / (243.04 + tempC);
  return (243.04 * gamma) / (17.625 - gamma);
}

function wetBulb(tempC: number, relativeHumidity: number): number {
  const rh = Math.max(1, Math.min(100, relativeHumidity));
  return tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(tempC + rh) - Math.atan(rh - 1.676331) + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
}

function entityLine(name: string, value: string, unit: string, entity?: string): string {
  const clickable = entity && historyEntitySet.has(entity);
  return `<div class="line${clickable ? " clickable" : ""}"${clickable ? ` data-entity="${entity}"` : ""}><span class="line-name">${esc(name)}</span><span class="dots"></span><span class="line-val">${esc(value)}<i>${esc(unit)}</i></span></div>`;
}

function node(label: string, value: string, unit: string, entity: string, tone = ""): string {
  const clickable = historyEntitySet.has(entity);
  return `<div class="node${clickable ? " clickable" : ""}"${tone ? ` data-tone="${tone}"` : ""}${clickable ? ` data-entity="${entity}"` : ""}><div class="nicon">${esc(label)}</div><div class="nval">${esc(value)}<i>${esc(unit)}</i></div><div class="nlbl">${esc(entityLabel(entity))}</div></div>`;
}

function stat(label: string, value: string, unit: string, entity: string, tone = ""): string {
  const clickable = historyEntitySet.has(entity);
  return `<div class="stat${clickable ? " clickable" : ""}"${tone ? ` data-tone="${tone}"` : ""}${clickable ? ` data-entity="${entity}"` : ""}><div class="nicon">${esc(label)}</div><div class="nval">${esc(value)}<i>${esc(unit)}</i></div><div class="nlbl">${esc(entityLabel(entity))}</div></div>`;
}

function room(label: string, value: string, detail: string, entity: string): string {
  return `<div class="room"><div class="nicon">${esc(label)}</div><div class="nval">${esc(value)}</div><div class="nlbl">${esc(detail || entityLabel(entity))}</div></div>`;
}

function render(): void {
  const now = new Date();
  const day = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const load = kw(ENERGY_ENTITIES.load);
  const solar = kw(ENERGY_ENTITIES.solar);
  const gridW = num(ENERGY_ENTITIES.grid);
  const gridLabel = gridW == null ? "Grid -" : gridW < 0 ? `Export ${(Math.abs(gridW) / 1000).toFixed(1)} kW` : `Import ${(gridW / 1000).toFixed(1)} kW`;
  const headline = solar !== "-" && load !== "-" ? `Solar is producing ${solar} kW while the house is drawing ${load} kW` : "The synthetic home is waiting for live data";
  const first = headline.charAt(0);
  const rest = headline.slice(1);
  const transportBadge = phase === "live" ? (transportMode === "p2p" ? "P2P" : "Relay") : (FORCE_RELAY_ONLY ? "Relay only" : "Relay / P2P");
  app.innerHTML = `<style>${css}</style><div class="page">
    <header class="mast"><div class="mast-top"><span>Varco showcase</span><span>${esc(transportBadge)}</span></div><h1 class="flag">La&nbsp;Casa</h1><div class="mast-rule"><span>${esc(day)}</span><span>${esc(gridLabel)}</span><span>Home edition</span></div><nav class="nav"><span>energy</span><span>comfort</span><span>lights</span><span>security</span></nav></header>
    <section class="lead"><div class="kick">${esc(now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase())} - READ ONLY</div><div class="byline">Varco - updated ${esc(lastUpdate)} - ${esc(transport)}</div><h2 class="headline"><span class="drop">${esc(first)}</span>${esc(rest)}</h2><p class="sub">Gazzetta-style showcase: read-only grant, no Home Assistant token in the browser, relay transport by default.</p></section>
    ${phase !== "live" ? renderSetup() : renderLive()}
    <div class="foot">Varco - read-only grant - encrypted relay transport</div>
  </div>`;
  bind();
}

function renderSetup(): string {
  const saved = loadShowcaseGrant(grantStorage, DEFAULT_AUTHORITY_ID);
  const connectLabel = FORCE_RELAY_ONLY ? "Connect relay-only" : "Connect";
  const streamWord = FORCE_RELAY_ONLY ? "relay-only stream" : "encrypted stream";
  if (DEMO_GRANT_BUNDLE) {
    const text = phase === "error" ? message : `Demo grant embedded. Connecting ${streamWord}...`;
    return `<section class="setup"><div class="box"><div class="kicker"><span>Live demo</span><span class="note">read-only</span></div><button id="connect">${esc(connectLabel)}</button><div class="status${phase === "error" ? " error" : ""}">${esc(text)}</div></div></section>`;
  }
  const savedMessage = saved?.status === "approved"
    ? `Saved grant for this browser. Press Connect to resume the ${streamWord}.`
    : saved?.status === "pending"
      ? `Saved pending request. Pairing code ${saved.pairingCode}. Approve it in the Varco panel, then press Connect.`
      : "Read-only access to: " + READ_ENTITIES.join(", ");
  const clearButton = saved ? `<button id="clearGrant">Forget saved grant</button>` : "";
  return `<section class="setup"><div class="box"><div class="kicker"><span>Pairing</span><span class="note">read-only</span></div><label class="field">Authority ID <input id="authority" value="${esc(DEFAULT_AUTHORITY_ID)}"></label><button id="request">Request read-only grant</button><button id="connect">${esc(connectLabel)}</button>${clearButton}<div class="status${phase === "error" ? " error" : ""}">${esc(message || savedMessage)}</div></div></section>`;
}


function renderLive(): string {
  return `<div class="full">
    <section class="panel"><div class="kicker"><span>Energy flow</span><span class="note">${esc(lastUpdate)}</span></div><div class="flow">
      ${node("solar", kw(ENERGY_ENTITIES.solar), "kW", ENERGY_ENTITIES.solar, "accent")}
      ${node("house", kw(ENERGY_ENTITIES.load), "kW", ENERGY_ENTITIES.load)}
      ${node(gridWording(), gridAbs(), "kW", ENERGY_ENTITIES.grid, "cool")}
      ${node("powerwall", pct(ENERGY_ENTITIES.batteryCharge), "%", ENERGY_ENTITIES.batteryCharge, "ok")}
    </div></section>
  </div>
  <div class="grid"><div class="col"><section class="panel"><div class="kicker"><span>Comfort desk</span><span class="note">climate</span></div><div class="stat-grid">
    ${stat("co2", ppm(COMFORT_ENTITIES.co2), "ppm", COMFORT_ENTITIES.co2, co2Tone())}
    ${room("climate", titleState(COMFORT_ENTITIES.climate), climateDetail(), COMFORT_ENTITIES.climate)}
    ${room("cooling", titleState(COMFORT_ENTITIES.cooling), "generic thermostat actuator", COMFORT_ENTITIES.cooling)}
  </div>${renderPsychrometricChart()}</section></div><div class="col col-rule"><section class="panel"><div class="kicker"><span>Lights bureau</span><span class="note">rooms</span></div><div class="room-grid">
    ${lightRoom("Kitchen", LIGHT_ENTITIES.kitchen)}
    ${lightRoom("Living room", LIGHT_ENTITIES.livingRoom)}
    ${lightRoom("Studio", LIGHT_ENTITIES.studio)}
    ${lightRoom("Garden", LIGHT_ENTITIES.garden)}
  </div></section></div></div>
  <div class="grid"><div class="col"><section class="panel"><div class="kicker"><span>Security beat</span><span class="note">doors and motion</span></div>
    ${entityLine("Front door", binaryWord(SECURITY_ENTITIES.frontDoor, "Open", "Closed"), "", undefined)}
    ${entityLine("Kitchen motion", binaryWord(SECURITY_ENTITIES.kitchenMotion, "Motion", "Quiet"), "", undefined)}
    ${entityLine("Garage door", binaryWord(SECURITY_ENTITIES.garageDoor, "Open", "Closed"), "", undefined)}
  </section></div><div class="col col-rule"><section class="panel"><div class="kicker"><span>Appliances</span><span class="note">utility</span></div>
    ${entityLine("EV charger", titleState(UTILITY_ENTITIES.evCharger), "", undefined)}
    ${entityLine("EV battery", pct(UTILITY_ENTITIES.evCharge), "%", UTILITY_ENTITIES.evCharge)}
    ${entityLine("Coffee machine", titleState(UTILITY_ENTITIES.coffeeMachine), "", undefined)}
    ${renderChart()}
  </section></div></div>`;
}

function lightRoom(name: string, entity: string): string {
  const brightness = Number(attr(entity, "brightness") ?? 0);
  const percent = state(entity) === "on" ? `${Math.round((brightness / 255) * 100)}%` : "off";
  return room(name, percent, state(entity) === "on" ? "lit" : "dark", entity);
}

function gridAbs(): string { const n = num(ENERGY_ENTITIES.grid); return n == null ? "-" : Math.abs(n / 1000).toFixed(1); }
function gridWording(): string { const n = num(ENERGY_ENTITIES.grid); return n == null ? "grid" : n < 0 ? "export" : "import"; }
function climateDetail(): string {
  const action = attr(COMFORT_ENTITIES.climate, "hvac_action") || state(COMFORT_ENTITIES.climate);
  return String(action);
}
function co2Tone(): string { const n = num(COMFORT_ENTITIES.co2); return n != null && n > 900 ? "accent" : "ok"; }
function titleState(entity: string): string { const s = state(entity); return s === "-" ? "-" : s.charAt(0).toUpperCase() + s.slice(1); }
function binaryWord(entity: string, onWord: string, offWord: string): string { return state(entity) === "on" ? onWord : offWord; }

function bind(): void {
  document.getElementById("request")?.addEventListener("click", requestGrant);
  document.getElementById("connect")?.addEventListener("click", connectLive);
  document.getElementById("clearGrant")?.addEventListener("click", clearSavedGrant);
  document.querySelectorAll<HTMLElement>("[data-entity]").forEach((el) => el.addEventListener("click", () => openHistoryChart(el.dataset.entity!)));
}

function authorityId(): string {
  if (DEMO_GRANT_BUNDLE) return DEMO_GRANT_BUNDLE.authorityId;
  return (document.getElementById("authority") as HTMLInputElement | null)?.value.trim() || DEFAULT_AUTHORITY_ID;
}

function makeClient(): VarcoClient {
  client = createVarcoClient({
    authorityId: authorityId(),
    bridgeUrl: BRIDGE_URL,
    manifest: createReadOnlyManifest(),
    webrtc: !FORCE_RELAY_ONLY,
    onTransportStatus: (status) => { transportMode = status.mode; transport = status.mode === "p2p" ? "WebRTC P2P" : status.detail || "Cloudflare relay"; render(); },
    warn: console.warn,
    storage: grantStorage,
  });
  return client;
}

async function requestGrant(): Promise<void> {
  try {
    const c = makeClient();
    const access = await c.requestAccess();
    savePendingShowcaseGrant(grantStorage, {
      authorityId: authorityId(),
      consumerPublicKey: c.consumerPublicKey,
      requestId: access.request_id,
      pairingCode: access.pairing_code,
    });
    phase = "pending";
    message = `Request saved. Pairing code ${access.pairing_code}. Approve it in the Varco panel, then press Connect.`;
  } catch (err) {
    phase = "error";
    message = err instanceof Error ? err.message : String(err);
  }
  render();
}

function clearSavedGrant(): void {
  clearShowcaseGrant(grantStorage);
  message = "Saved grant removed from this browser.";
  phase = "setup";
  render();
}

async function connectLive(): Promise<void> {
  try {
    const c = client || makeClient();
    await c.connect();
    markShowcaseGrantApproved(grantStorage, authorityId());
    const states = await c.getStates(READ_ENTITIES);
    applyStates(states);
    await c.subscribeEntities(READ_ENTITIES, (event) => {
      if (event.states) applyStates(event.states);
    });
    phase = "live";
    message = "";
  } catch (err) {
    phase = "error";
    message = err instanceof Error ? err.message : String(err);
  }
  render();
}

function applyStates(states: Record<string, HassState | null>): void {
  for (const [entity, stateValue] of Object.entries(states)) values.set(entity, stateValue);
  const loadW = num(ENERGY_ENTITIES.load);
  if (loadW != null) samples.push(loadW);
  while (samples.length > 36) samples.shift();
  lastUpdate = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (phase === "live") render();
}

function createDemoStorage(storage: Storage): StorageLike & ShowcaseGrantStorage {
  if (!DEMO_GRANT_BUNDLE) return storage;
  storage.setItem("varco.consumerIdentity.v1", JSON.stringify(DEMO_GRANT_BUNDLE.identity));
  storage.setItem(SHOWCASE_GRANT_KEY, JSON.stringify(DEMO_GRANT_BUNDLE.grant));
  return storage;
}

async function openHistoryChart(entityId: string): Promise<void> {
  const c = client;
  if (!c) return;
  const label = entityLabel(entityId);
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-card"><button class="modal-x" aria-label="Close">&times;</button><div class="modal-kick">Last 24 hours</div><h3 class="modal-title">${esc(label)}</h3><div class="modal-body"><div class="status">Loading history...</div></div></div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.querySelector(".modal-x")?.addEventListener("click", close);
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 3600 * 1000);
    const history = await c.queryHistory([entityId], { start_time: start.toISOString(), end_time: end.toISOString() });
    const points = ((history && history[entityId]) || [])
      .map((point: any) => ({ t: Date.parse(point.t), v: Number(point.v ?? point.state) }))
      .filter((point: { t: number; v: number }) => Number.isFinite(point.t) && Number.isFinite(point.v));
    const body = modal.querySelector(".modal-body") as HTMLElement | null;
    if (body) {
      const unit = String(values.get(entityId)?.attributes?.unit_of_measurement || "");
      body.innerHTML = historyChartSvg(points, start.getTime(), end.getTime(), unit);
      const svg = body.querySelector(".history-svg") as SVGSVGElement | null;
      if (svg && points.length > 1) attachChartScrub(svg, points, start.getTime(), end.getTime(), unit);
    }
  } catch (err) {
    const body = modal.querySelector(".modal-body") as HTMLElement | null;
    if (body) body.innerHTML = `<div class="status error">History unavailable: ${esc(err instanceof Error ? err.message : String(err))}</div>`;
  }
}

function entityLabel(entityId: string): string {
  return String(values.get(entityId)?.attributes?.friendly_name || entityId);
}

function historyChartSvg(points: { t: number; v: number }[], t0: number, t1: number, unit: string): string {
  if (points.length < 2) return '<div class="status">Not enough history for a chart.</div>';
  const W = 640, H = 240, padL = 6, padR = 6, padT = 18, padB = 26;
  const vs = points.map((point) => point.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { max = min + 1; min = min - 1; }
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)} ${y(point.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points[points.length - 1].t).toFixed(1)} ${(H - padB).toFixed(1)} L${x(points[0].t).toFixed(1)} ${(H - padB).toFixed(1)} Z`;
  const current = vs[vs.length - 1];
  const avg = vs.reduce((sum, value) => sum + value, 0) / vs.length;
  const tick = (fraction: number) => { const t = t0 + (t1 - t0) * fraction; const d = new Date(t); return `<text x="${x(t).toFixed(0)}" y="${H - 7}" font-size="9" fill="var(--muted)" text-anchor="${fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}" font-family="var(--label-font)">${hhmm(d)}</text>`; };
  return `<div class="chart-stats"><span><b>${fmt(current)}</b><small>current ${esc(unit)}</small></span><span><b>${fmt(min)}</b><small>min</small></span><span><b>${fmt(avg)}</b><small>average</small></span><span><b>${fmt(max)}</b><small>max</small></span></div><svg class="history-svg" viewBox="0 0 ${W} ${H}"><line x1="${padL}" y1="${y(max).toFixed(1)}" x2="${W - padR}" y2="${y(max).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><line x1="${padL}" y1="${y(min).toFixed(1)}" x2="${W - padR}" y2="${y(min).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><path d="${area}" fill="var(--accent)" opacity="0.12"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${[0, .25, .5, .75, 1].map(tick).join("")}</svg>`;
}

function attachChartScrub(svg: SVGSVGElement, points: { t: number; v: number }[], t0: number, t1: number, unit: string): void {
  const W = 640, H = 240, padL = 6, padR = 6, padT = 18, padB = 26;
  const vs = points.map((point) => point.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { max = min + 1; min = min - 1; }
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const ns = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(ns, "g");
  group.setAttribute("display", "none");
  const line = document.createElementNS(ns, "line");
  line.setAttribute("y1", String(padT)); line.setAttribute("y2", String(H - padB)); line.setAttribute("stroke", "var(--ink)"); line.setAttribute("stroke-width", "1"); line.setAttribute("stroke-dasharray", "3 3");
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("r", "4"); dot.setAttribute("fill", "var(--accent)"); dot.setAttribute("stroke", "var(--paper)"); dot.setAttribute("stroke-width", "1.5");
  const text = document.createElementNS(ns, "text");
  text.setAttribute("font-size", "11"); text.setAttribute("font-family", "var(--label-font)"); text.setAttribute("fill", "var(--ink)"); text.setAttribute("font-weight", "600");
  group.append(line, dot, text); svg.appendChild(group);
  const show = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const fraction = Math.max(0, Math.min(1, ((clientX - rect.left) / rect.width * W - padL) / (W - padL - padR)));
    const t = t0 + fraction * (t1 - t0);
    let nearest = points[0];
    for (const point of points) if (Math.abs(point.t - t) < Math.abs(nearest.t - t)) nearest = point;
    const px = x(nearest.t), py = y(nearest.v);
    line.setAttribute("x1", px.toFixed(1)); line.setAttribute("x2", px.toFixed(1));
    dot.setAttribute("cx", px.toFixed(1)); dot.setAttribute("cy", py.toFixed(1));
    text.textContent = `${hhmm(new Date(nearest.t))} - ${fmt(nearest.v)}${unit ? " " + unit : ""}`;
    const end = px > W / 2;
    text.setAttribute("text-anchor", end ? "end" : "start");
    text.setAttribute("x", (end ? px - 8 : px + 8).toFixed(1));
    text.setAttribute("y", "13");
    group.removeAttribute("display");
  };
  let down = false;
  svg.addEventListener("pointerdown", (event) => { down = true; try { svg.setPointerCapture(event.pointerId); } catch {} show(event.clientX); event.preventDefault(); });
  svg.addEventListener("pointermove", (event) => { if (down || event.pointerType === "mouse") show(event.clientX); });
  svg.addEventListener("pointerup", () => { down = false; });
  svg.addEventListener("pointercancel", () => { down = false; });
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function fmt(value: number): string {
  const abs = Math.abs(value);
  return value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

render();
if (DEMO_GRANT_BUNDLE) void connectLive();
