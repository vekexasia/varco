import { createVarcoClient, type HassState, type VarcoClient } from "@varco/client";
import { BRIDGE_URL, createReadOnlyManifest, DEFAULT_AUTHORITY_ID, ENERGY_ENTITIES, FORCE_RELAY_ONLY, READ_ENTITIES } from "./config.js";
import { clearShowcaseGrant, loadShowcaseGrant, markShowcaseGrantApproved, savePendingShowcaseGrant } from "./grant-store.js";

const app = document.getElementById("app")!;
const values = new Map<string, HassState | null>();
const samples: number[] = [];
let client: VarcoClient | null = null;
let lastUpdate = "—";
let transport = "Cloudflare relay · P2P disabled";
let phase: "setup" | "pending" | "live" | "error" = "setup";
let message = "";
const grantStorage = window.localStorage;

const css = `
:root{--ink:#211b14;--ink-2:#4a4036;--muted:#8a7f70;--faint:#b6ac9c;--line:#d8cfbb;--line-2:#c7bca3;--paper:#f4efe1;--accent:#be5a38;--accent-deep:#9c4327;--accent-wash:#f3e4d8;--ok:#5f6b4f;--cool:#3a6ea5;--paper-dim:#e7dfcd;--serif-display:'Libre Caslon Display',Georgia,serif;--serif-body:'Newsreader',Georgia,serif;--label-font:'Spline Sans Mono',ui-monospace,monospace;}
*{box-sizing:border-box} body{margin:0;background:#d8cfbb;color:var(--ink);font-family:var(--serif-body);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}.page{max-width:980px;margin:0 auto;min-height:100vh;background:var(--paper);box-shadow:0 18px 70px rgba(33,27,20,.2)}.mast{padding:26px 30px 0}.mast-top{display:flex;justify-content:space-between;font-family:var(--label-font);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);padding-bottom:9px;border-bottom:1px solid var(--ink)}.flag{font-family:var(--serif-display);font-weight:600;font-size:clamp(44px,10vw,74px);line-height:.96;text-align:center;letter-spacing:-.02em;margin:12px 0 14px}.mast-rule{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);font-family:var(--label-font);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);text-align:center}.mast-rule>span:first-child{text-align:left}.mast-rule>span:last-child{text-align:right}.nav{display:flex;justify-content:center;border-bottom:1px solid var(--line)}.nav span{font-family:var(--label-font);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink);font-weight:600;padding:11px 15px;box-shadow:inset 0 -2px 0 var(--accent)}.lead{padding:22px 30px;border-bottom:3px double var(--ink)}.kick{font-family:var(--label-font);font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);font-weight:600}.byline{font-family:var(--label-font);font-size:11px;color:var(--muted);margin-top:4px;letter-spacing:.04em}.headline{font-family:var(--serif-display);font-weight:500;font-size:clamp(28px,5.5vw,42px);line-height:1.12;letter-spacing:-.005em;margin:13px 0 0}.drop{float:left;font-family:var(--serif-display);font-weight:600;color:var(--accent);font-size:3.1em;line-height:.66;padding-right:.07em;margin-top:.03em}.sub{font-style:italic;font-size:clamp(15px,3vw,18px);line-height:1.5;color:var(--ink-2);margin:12px 0 0}.full{padding:0 30px}.grid{display:grid;grid-template-columns:1fr 1fr}.col{padding:0 30px}.col-rule{border-left:1px solid var(--line)}.panel{padding:20px 0;border-bottom:1px solid var(--line)}.kicker{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:8px;border-bottom:2px solid var(--ink);margin-bottom:14px}.kicker>span:first-child{font-family:var(--label-font);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink);font-weight:600}.note{font-family:var(--label-font);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.flow{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line)}.node{padding:16px 10px;text-align:center;border-left:1px solid var(--line)}.node:first-child{border-left:0}.node[data-tone=accent] .nval{color:var(--accent-deep)}.node[data-tone=ok] .nval{color:var(--ok)}.node[data-tone=cool] .nval{color:var(--cool)}.nicon{font-size:23px;margin-bottom:6px}.nval{font-family:var(--serif-display);font-size:30px;line-height:1}.nval i{font-family:var(--serif-body);font-style:normal;font-size:13px;color:var(--muted);margin-left:3px}.nlbl{font-family:var(--label-font);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:5px}.line{display:flex;align-items:baseline;gap:8px;padding:10px 0;border-top:1px dotted var(--line)}.line:first-child{border-top:0}.line-name{font-size:15px}.dots{flex:1;border-bottom:1px dotted var(--line);align-self:flex-end;height:0;margin-bottom:6px}.line-val{font-family:var(--serif-display);font-size:23px;white-space:nowrap}.line-val i{font-family:var(--serif-body);font-style:normal;font-size:12px;color:var(--muted);margin-left:2px}.chart{width:100%;height:148px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(190,90,56,.06),rgba(0,0,0,0));display:block}.setup{padding:18px 30px 30px}.box{border:1px solid var(--line-2);background:var(--paper);padding:14px;margin-top:14px}.field{display:grid;gap:5px;margin:10px 0;font-family:var(--label-font);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}input{font:14px var(--label-font);border:1px solid var(--line-2);background:var(--paper-dim);color:var(--ink);padding:10px 11px}button{font-family:var(--label-font);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);background:var(--paper);border:1px solid var(--line-2);border-radius:5px;padding:9px 12px;cursor:pointer;margin-right:8px}button:hover{background:var(--accent-wash);border-color:var(--accent);color:var(--accent-deep)}.status{font-family:var(--label-font);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ok);margin-top:10px}.error{color:var(--accent-deep)}.clickable{cursor:pointer;transition:background .12s}.clickable:hover{background:var(--accent-wash)}.modal{position:fixed;inset:0;z-index:60;background:rgba(33,27,20,.55);backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px;overflow:auto}.modal-card{background:var(--paper);border:1px solid var(--line-2);border-radius:8px;max-width:680px;width:100%;max-height:88vh;display:flex;flex-direction:column;padding:22px 24px 18px;box-shadow:0 30px 80px rgba(40,30,18,.45);position:relative}.modal-body{flex:1 1 auto;overflow:auto;min-height:0}.modal-x{position:absolute;top:8px;right:12px;border:0;background:none;font-size:26px;line-height:1;color:var(--muted);cursor:pointer}.modal-kick{font-family:var(--label-font);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);font-weight:600}.modal-title{font-family:var(--serif-display);font-weight:500;font-size:26px;line-height:1.1;margin:4px 0 14px;color:var(--ink)}.chart-stats{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:11px 0}.chart-stats span{display:flex;flex-direction:column}.chart-stats b{font-family:var(--serif-display);font-size:23px;line-height:1;color:var(--ink);font-weight:600}.chart-stats small{font-family:var(--label-font);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:3px}.history-svg{width:100%;height:auto;display:block;touch-action:none;cursor:crosshair}.foot{text-align:center;font-family:var(--label-font);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);padding:22px 0 30px;border-top:1px solid var(--line);margin:0 30px}@media(max-width:680px){.grid,.flow{grid-template-columns:1fr 1fr}.col-rule{border-left:0}.mast-rule{grid-template-columns:1fr}.mast-rule>span{text-align:center!important}.col{padding:0 30px}.page{box-shadow:none}}`;

function num(entity: string): number | null {
  const state = values.get(entity)?.state;
  if (state == null || state === "unknown" || state === "unavailable") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

function kw(entity: string): string {
  const n = num(entity);
  if (n == null) return "—";
  return Math.abs(n / 1000).toFixed(1);
}

function pct(entity: string): string {
  const n = num(entity);
  return n == null ? "—" : Math.round(n).toString();
}

function kwh(entity: string): string {
  const n = num(entity);
  return n == null ? "—" : n.toFixed(1);
}

function renderChart(): string {
  const max = Math.max(1, ...samples.map(Math.abs));
  const points = samples.map((v, i) => `${(i / Math.max(1, samples.length - 1)) * 100},${74 - (v / max) * 62}`).join(" ");
  return `<svg class="chart" viewBox="0 0 100 148" preserveAspectRatio="none"><line x1="0" y1="74" x2="100" y2="74" stroke="var(--line)" stroke-width="1"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function entityLine(name: string, value: string, unit: string, entity?: string): string {
  return `<div class="line${entity ? " clickable" : ""}"${entity ? ` data-entity="${entity}"` : ""}><span class="line-name">${name}</span><span class="dots"></span><span class="line-val">${value}<i>${unit}</i></span></div>`;
}

function render(): void {
  const now = new Date();
  const day = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const load = kw(ENERGY_ENTITIES.load);
  const solar = kw(ENERGY_ENTITIES.solar);
  const gridW = num(ENERGY_ENTITIES.grid);
  const gridLabel = gridW == null ? "Grid —" : gridW < 0 ? `Export ${(Math.abs(gridW) / 1000).toFixed(1)} kW` : `Import ${(gridW / 1000).toFixed(1)} kW`;
  const batteryW = num(ENERGY_ENTITIES.battery);
    const headline = solar !== "—" && load !== "—" ? `Solar is producing ${solar} kW while the house is drawing ${load} kW` : "Home energy is waiting for live data";
  const first = headline.charAt(0);
  const rest = headline.slice(1);

  app.innerHTML = `<style>${css}</style><div class="page">
    <header class="mast"><div class="mast-top"><span>Varco showcase</span><span>Relay only</span></div><h1 class="flag">La&nbsp;Casa</h1><div class="mast-rule"><span>${day}</span><span>${gridLabel}</span><span>Energy</span></div><nav class="nav"><span>solar live</span></nav></header>
    <section class="lead"><div class="kick">${now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()} · READ ONLY</div><div class="byline">Varco · updated ${lastUpdate} · ${transport}</div><h2 class="headline"><span class="drop">${first}</span>${rest}</h2><p class="sub">Gazzetta-style showcase: read-only grant, no Home Assistant token in the browser, relay transport by default.</p></section>
    ${phase !== "live" ? renderSetup() : renderLive()}
    <div class="foot">Varco · read-only grant · encrypted relay transport</div>
  </div>`;
  bind();
}

function renderSetup(): string {
  const saved = loadShowcaseGrant(grantStorage, DEFAULT_AUTHORITY_ID);
  const savedMessage = saved?.status === "approved"
    ? "Saved grant for this browser. Press Connect to resume the relay-only stream."
    : saved?.status === "pending"
      ? `Saved pending request. Pairing code ${saved.pairingCode}. Approve it in the Varco panel, then press Connect.`
      : "Read-only access to: " + READ_ENTITIES.join(", ");
  const clearButton = saved ? `<button id="clearGrant">Forget saved grant</button>` : "";
  return `<section class="setup"><div class="box"><div class="kicker"><span>Pairing</span><span class="note">read-only</span></div><label class="field">Authority ID <input id="authority" value="${DEFAULT_AUTHORITY_ID}"></label><button id="request">Request read-only grant</button><button id="connect">Connect relay-only</button>${clearButton}<div class="status${phase === "error" ? " error" : ""}">${message || savedMessage}</div></div></section>`;
}

function renderLive(): string {
  return `<div class="full"><section class="panel"><div class="kicker"><span>Energy flow</span><span class="note">${lastUpdate}</span></div><div class="flow"><div class="node clickable" data-entity="${ENERGY_ENTITIES.solar}" data-tone="accent"><div class="nicon">☀</div><div class="nval">${solarVal()}<i>kW</i></div><div class="nlbl">Solar production</div></div><div class="node clickable" data-entity="${ENERGY_ENTITIES.load}"><div class="nicon">⌂</div><div class="nval">${kw(ENERGY_ENTITIES.load)}<i>kW</i></div><div class="nlbl">House load</div></div><div class="node clickable" data-entity="${ENERGY_ENTITIES.grid}" data-tone="cool"><div class="nicon">↔</div><div class="nval">${gridAbs()}<i>kW</i></div><div class="nlbl">${gridWording()}</div></div><div class="node clickable" data-entity="${ENERGY_ENTITIES.batteryCharge}" data-tone="ok"><div class="nicon">▣</div><div class="nval">${pct(ENERGY_ENTITIES.batteryCharge)}<i>%</i></div><div class="nlbl">Powerwall</div></div></div></section></div><div class="grid"><div class="col"><section class="panel"><div class="kicker"><span>Meters</span><span class="note">right now</span></div>${entityLine("Current house load", kw(ENERGY_ENTITIES.load), "kW", ENERGY_ENTITIES.load)}${entityLine("Current solar production", kw(ENERGY_ENTITIES.solar), "kW", ENERGY_ENTITIES.solar)}${entityLine("Battery", batteryWording(), "", ENERGY_ENTITIES.battery)}</section></div><div class="col col-rule"><section class="panel"><div class="kicker"><span>Live line</span><span class="note">latest deltas</span></div>${renderChart()}</section></div></div>`;
}

function solarVal(): string { return kw(ENERGY_ENTITIES.solar); }
function gridAbs(): string { const n = num(ENERGY_ENTITIES.grid); return n == null ? "—" : Math.abs(n / 1000).toFixed(1); }
function gridWording(): string { const n = num(ENERGY_ENTITIES.grid); return n == null ? "Grid" : n < 0 ? "Grid export" : "Grid import"; }
function batteryWording(): string { const n = num(ENERGY_ENTITIES.battery); return n == null ? "—" : n > 50 ? `Discharging ${(n / 1000).toFixed(1)} kW` : n < -50 ? `Charging ${(Math.abs(n) / 1000).toFixed(1)} kW` : "Idle"; }

function bind(): void {
  document.getElementById("request")?.addEventListener("click", requestGrant);
  document.getElementById("connect")?.addEventListener("click", connectLive);
  document.getElementById("clearGrant")?.addEventListener("click", clearSavedGrant);
  document.querySelectorAll<HTMLElement>("[data-entity]").forEach((el) => el.addEventListener("click", () => openHistoryChart(el.dataset.entity!)));
}

function authorityId(): string {
  return (document.getElementById("authority") as HTMLInputElement | null)?.value.trim() || DEFAULT_AUTHORITY_ID;
}

function makeClient(): VarcoClient {
  client = createVarcoClient({
    authorityId: authorityId(),
    bridgeUrl: BRIDGE_URL,
    manifest: createReadOnlyManifest(),
    webrtc: !FORCE_RELAY_ONLY,
    onTransportStatus: (status) => { transport = status.mode === "relay" ? "Cloudflare relay · P2P disabled" : "WebRTC P2P"; render(); },
    warn: console.warn,
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
  for (const [entity, state] of Object.entries(states)) values.set(entity, state);
  const loadW = num(ENERGY_ENTITIES.load);
  if (loadW != null) samples.push(loadW);
  while (samples.length > 36) samples.shift();
  lastUpdate = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (phase === "live") render();
}

async function openHistoryChart(entityId: string): Promise<void> {
  const c = client;
  if (!c) return;
  const label = entityLabel(entityId);
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-card"><button class="modal-x" aria-label="Close">&times;</button><div class="modal-kick">Last 24 hours</div><h3 class="modal-title">${esc(label)}</h3><div class="modal-body"><div class="status">Loading history…</div></div></div>`;
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
    text.textContent = `${hhmm(new Date(nearest.t))} · ${fmt(nearest.v)}${unit ? " " + unit : ""}`;
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
