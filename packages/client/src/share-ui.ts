import type { HassState, VarcoManifest } from "./types.js";

export type ShareControl = {
  kind: "button" | "range" | "select";
  label: string;
  domain: string;
  service: string;
  entityId: string;
  valueKey?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number | string;
  options?: string[];
};

export type ShareCard = {
  entityId: string;
  domain: string;
  title: string;
  state: string;
  displayValue: string;
  attributes: Record<string, unknown>;
  controls: ShareControl[];
};

const CONTROL_LABELS: Record<string, string> = {
  turn_on: "Turn on",
  turn_off: "Turn off",
  toggle: "Toggle",
  open_cover: "Open",
  close_cover: "Close",
  stop_cover: "Stop",
  set_cover_position: "Set position",
  lock: "Lock",
  unlock: "Unlock",
  open: "Open",
  set_temperature: "Set temperature",
  set_hvac_mode: "HVAC mode",
  set_fan_mode: "Fan mode",
  set_preset_mode: "Preset",
};

const DOMAIN_SERVICES: Record<string, string[]> = {
  light: ["turn_on", "turn_off", "toggle"],
  switch: ["turn_on", "turn_off", "toggle"],
  cover: ["open_cover", "stop_cover", "close_cover", "set_cover_position"],
  lock: ["unlock", "lock", "open"],
  climate: ["turn_on", "turn_off", "set_temperature", "set_hvac_mode", "set_fan_mode", "set_preset_mode"],
};

export function buildShareCards(manifest: VarcoManifest, states: Record<string, HassState | null | undefined>): ShareCard[] {
  const entityIds = orderedEntities(manifest);
  return entityIds.map((entityId) => buildShareCard(entityId, states[entityId], manifest)).filter((card): card is ShareCard => Boolean(card));
}

export function buildShareCard(entityId: string, state: HassState | null | undefined, manifest: VarcoManifest): ShareCard | null {
  const domain = entityId.split(".", 1)[0] || "entity";
  const attrs = state?.attributes ?? {};
  const title = typeof attrs.friendly_name === "string" ? attrs.friendly_name : entityId;
  const controls = controlsForEntity(entityId, domain, state, manifest);
  return {
    entityId,
    domain,
    title,
    state: String(state?.state ?? "unknown"),
    displayValue: displayValue(state),
    attributes: cardAttributes(domain, attrs),
    controls,
  };
}

export function renderShareCards(cards: ShareCard[]): string {
  return `<div class="varco-share-cards">${cards.map(renderShareCard).join("")}</div>`;
}

const INACTIVE_STATES = new Set(["off", "closed", "locked", "unavailable", "unknown", "idle", "standby", "none", ""]);

export function renderShareCard(card: ShareCard): string {
  const controls = card.controls.map(renderControl).join("");
  const active = !INACTIVE_STATES.has(card.state.toLowerCase());
  return `<section class="varco-card" data-entity="${esc(card.entityId)}" data-domain="${esc(card.domain)}" data-active="${active}"><div class="varco-card__head"><span class="varco-card__dot"></span><h2 class="varco-card__title">${esc(card.title)}</h2><span class="varco-card__state">${esc(card.displayValue)}</span></div>${controls ? `<div class="varco-card__controls">${controls}</div>` : ""}</section>`;
}

function renderControl(control: ShareControl): string {
  const base = `data-entity="${esc(control.entityId)}" data-domain="${esc(control.domain)}" data-service="${esc(control.service)}"`;
  if (control.kind === "range") return `<label class="varco-ctl varco-ctl--range"><span class="varco-ctl__label">${esc(control.label)}</span><span class="varco-ctl__row"><input type="range" ${base} data-value-key="${esc(control.valueKey ?? "value")}" min="${esc(control.min ?? 0)}" max="${esc(control.max ?? 100)}" step="${esc(control.step ?? 1)}" value="${esc(control.value ?? 0)}"><output class="varco-ctl__value">${esc(control.value ?? 0)}</output></span></label>`;
  if (control.kind === "select") return `<label class="varco-ctl varco-ctl--select"><span class="varco-ctl__label">${esc(control.label)}</span><select ${base} data-value-key="${esc(control.valueKey ?? "value")}">${(control.options ?? []).map((option) => `<option value="${esc(option)}"${option === control.value ? " selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
  return `<button type="button" class="varco-ctl varco-ctl--btn" ${base}>${esc(control.label)}</button>`;
}

function orderedEntities(manifest: VarcoManifest): string[] {
  const out: string[] = [];
  for (const list of [manifest.read_entities, manifest.subscriptions, manifest.history, manifest.camera_snapshots]) {
    for (const value of list ?? []) if (isEntityId(value) && !out.includes(value)) out.push(value);
  }
  for (const scope of manifest.actions ?? []) {
    const entityId = scope.split("@")[1];
    if (isEntityId(entityId) && !out.includes(entityId)) out.push(entityId);
  }
  return out;
}

function controlsForEntity(entityId: string, domain: string, state: HassState | null | undefined, manifest: VarcoManifest): ShareControl[] {
  const services = DOMAIN_SERVICES[domain] ?? [];
  return services.filter((service) => actionAllowed(manifest, domain, service, entityId)).map((service) => controlForService(entityId, domain, service, state)).filter((control): control is ShareControl => Boolean(control));
}

function controlForService(entityId: string, domain: string, service: string, state: HassState | null | undefined): ShareControl | null {
  const attrs = state?.attributes ?? {};
  if (domain === "cover" && service === "set_cover_position") return { kind: "range", label: CONTROL_LABELS[service], domain, service, entityId, valueKey: "position", min: 0, max: 100, step: 1, value: numeric(attrs.current_position, 0) };
  if (domain === "climate" && service === "set_temperature") return { kind: "range", label: CONTROL_LABELS[service], domain, service, entityId, valueKey: "temperature", min: numeric(attrs.min_temp, 5), max: numeric(attrs.max_temp, 35), step: numeric(attrs.target_temp_step, 0.5), value: numeric(attrs.temperature, numeric(attrs.current_temperature, 20)) };
  if (domain === "climate" && service === "set_hvac_mode") return selectControl(entityId, domain, service, "hvac_mode", attrs.hvac_modes, attrs.hvac_mode);
  if (domain === "climate" && service === "set_fan_mode") return selectControl(entityId, domain, service, "fan_mode", attrs.fan_modes, attrs.fan_mode);
  if (domain === "climate" && service === "set_preset_mode") return selectControl(entityId, domain, service, "preset_mode", attrs.preset_modes, attrs.preset_mode);
  return { kind: "button", label: CONTROL_LABELS[service] ?? service.replace(/_/g, " "), domain, service, entityId };
}

function selectControl(entityId: string, domain: string, service: string, valueKey: string, rawOptions: unknown, value: unknown): ShareControl | null {
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) return null;
  const options = rawOptions.map(String);
  return { kind: "select", label: CONTROL_LABELS[service] ?? valueKey, domain, service, entityId, valueKey, options, value: typeof value === "string" ? value : options[0] };
}

function actionAllowed(manifest: VarcoManifest, domain: string, service: string, entityId: string): boolean {
  const scopes = new Set(manifest.actions ?? []);
  return scopes.has(`${domain}.${service}@${entityId}`) || scopes.has(`*@${entityId}`) || scopes.has(`${domain}.*`) || scopes.has("*");
}

function displayValue(state: HassState | null | undefined): string {
  if (!state) return "Unavailable";
  const unit = state.attributes.unit_of_measurement;
  return `${state.state}${typeof unit === "string" && unit ? ` ${unit}` : ""}`;
}

function cardAttributes(domain: string, attrs: Record<string, unknown>): Record<string, unknown> {
  if (domain === "light" && typeof attrs.brightness === "number") return { brightnessPct: Math.round(attrs.brightness / 255 * 100) };
  return {};
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isEntityId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z_]+\.[a-zA-Z0-9_]+$/.test(value);
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
