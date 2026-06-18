import type { HassState, VarcoClient, VarcoManifest } from "./types.js";

export type ShareControl = {
  kind: "button" | "range" | "select" | "toggle";
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
  on?: boolean;
};

export type ShareCard = {
  entityId: string;
  domain: string;
  title: string;
  state: string;
  displayValue: string;
  attributes: Record<string, unknown>;
  controls: ShareControl[];
  sourceTitle?: string;
  sourceType?: string;
};

export type ShareAction = {
  domain: string;
  service: string;
  entityId: string;
  data?: Record<string, unknown>;
};

export type PinPrompt = (message: string) => string | null | undefined;

const CONTROL_LABELS: Record<string, string> = {
  turn_on: "Turn on",
  turn_off: "Turn off",
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

// 24x24 SVG path data per service; buttons render the icon with the label kept as aria-label/title.
const CONTROL_ICONS: Record<string, string> = {
  open_cover: "M7 14l5-5 5 5z",
  close_cover: "M7 10l5 5 5-5z",
  stop_cover: "M7 7h10v10H7z",
  lock: "M12 2a4 4 0 0 0-4 4v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4zm-2 7V6a2 2 0 0 1 4 0v3z",
  unlock: "M16 9V6a4 4 0 0 0-8 0h2a2 2 0 0 1 4 0v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z",
  open: "M16 9V6a4 4 0 0 0-8 0h2a2 2 0 0 1 4 0v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z",
};

const DOMAIN_SERVICES: Record<string, string[]> = {
  light: ["turn_on", "turn_off"],
  switch: ["turn_on", "turn_off"],
  cover: ["open_cover", "stop_cover", "close_cover", "set_cover_position"],
  lock: ["unlock", "lock", "open"],
  climate: ["turn_on", "turn_off", "set_temperature", "set_hvac_mode", "set_fan_mode", "set_preset_mode"],
};

const TOGGLE_DOMAINS = new Set(["light", "switch"]);

export function buildShareCards(manifest: VarcoManifest, states: Record<string, HassState | null | undefined>): ShareCard[] {
  const allowed = orderedEntities(manifest);
  const sources = dashboardSources(manifest, new Set(allowed));
  const entityIds = sources.length ? [...sources.map((source) => source.entityId), ...allowed.filter((entityId) => !sources.some((source) => source.entityId === entityId))] : allowed;
  return entityIds.map((entityId) => buildShareCard(entityId, states[entityId], manifest, sources.find((source) => source.entityId === entityId))).filter((card): card is ShareCard => Boolean(card));
}

export function buildShareCard(entityId: string, state: HassState | null | undefined, manifest: VarcoManifest, source?: { title?: string; type?: string }): ShareCard | null {
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
    sourceTitle: source?.title,
    sourceType: source?.type,
  };
}

export function renderShareCards(cards: ShareCard[]): string {
  if (!cards.some((card) => card.sourceTitle)) return `<div class="varco-share-cards">${cards.map(renderShareCard).join("")}</div>`;
  const groups: string[] = [];
  let currentTitle = "";
  for (const card of cards) {
    const title = card.sourceTitle || "Other";
    if (title !== currentTitle) {
      currentTitle = title;
      groups.push(`<section class="varco-card-group" data-title="${esc(title)}"><h2>${esc(title)}</h2><div class="varco-share-cards">${renderShareCard(card)}`);
    } else groups[groups.length - 1] += renderShareCard(card);
  }
  return groups.map((group) => `${group}</div></section>`).join("");
}

export async function callShareAction(client: Pick<VarcoClient, "callService">, action: ShareAction, promptPin: PinPrompt = defaultPinPrompt): Promise<void> {
  const data = { entity_id: action.entityId, ...(action.data ?? {}) };
  try {
    await client.callService(action.domain, action.service, data);
  } catch (err) {
    if (!isPinDenial(err)) throw err;
    const pin = promptPin("Enter PIN");
    if (!pin) throw err;
    await client.callService(action.domain, action.service, { ...data, pin });
  }
}

const INACTIVE_STATES = new Set(["off", "closed", "locked", "unavailable", "unknown", "idle", "standby", "none", ""]);

export function renderShareCard(card: ShareCard): string {
  const controls = card.controls.map(renderControl).join("");
  const active = !INACTIVE_STATES.has(card.state.toLowerCase());
  return `<section class="varco-card" data-entity="${esc(card.entityId)}" data-domain="${esc(card.domain)}" data-active="${active}"><div class="varco-card__head"><span class="varco-card__dot"></span><h2 class="varco-card__title">${esc(card.title)}</h2>${card.controls.length ? "" : `<span class="varco-card__state">${esc(card.displayValue)}</span>`}</div>${controls ? `<div class="varco-card__controls">${controls}</div>` : ""}</section>`;
}

function renderControl(control: ShareControl): string {
  const base = `data-entity="${esc(control.entityId)}" data-domain="${esc(control.domain)}" data-service="${esc(control.service)}"`;
  if (control.kind === "range") return `<label class="varco-ctl varco-ctl--range"><span class="varco-ctl__label">${esc(control.label)}</span><span class="varco-ctl__row"><input type="range" ${base} data-value-key="${esc(control.valueKey ?? "value")}" min="${esc(control.min ?? 0)}" max="${esc(control.max ?? 100)}" step="${esc(control.step ?? 1)}" value="${esc(control.value ?? 0)}"><output class="varco-ctl__value">${esc(control.value ?? 0)}</output></span></label>`;
  if (control.kind === "select") return `<label class="varco-ctl varco-ctl--select"><span class="varco-ctl__label">${esc(control.label)}</span><select ${base} data-value-key="${esc(control.valueKey ?? "value")}">${(control.options ?? []).map((option) => `<option value="${esc(option)}"${option === control.value ? " selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
  if (control.kind === "toggle") return `<label class="varco-ctl varco-ctl--toggle"><input type="checkbox" role="switch" data-toggle data-entity="${esc(control.entityId)}" data-domain="${esc(control.domain)}"${control.on ? " checked" : ""}></label>`;
  const icon = CONTROL_ICONS[control.service];
  if (icon) return `<button type="button" class="varco-ctl varco-ctl--btn varco-ctl--icon" ${base} aria-label="${esc(control.label)}" title="${esc(control.label)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="${esc(icon)}"/></svg></button>`;
  return `<button type="button" class="varco-ctl varco-ctl--btn" ${base}>${esc(control.label)}</button>`;
}

function defaultPinPrompt(message: string): string | null {
  return globalThis.prompt?.(message) ?? null;
}

function isPinDenial(err: unknown): boolean {
  const error = err as { code?: unknown; message?: unknown };
  return error?.code === "permission_denied" && /\b(pin_required|invalid_pin)\b/.test(String(error.message ?? ""));
}

function dashboardSources(manifest: VarcoManifest, allowed: Set<string>): Array<{ entityId: string; title?: string; type?: string }> {
  const out: Array<{ entityId: string; title?: string; type?: string }> = [];
  for (const card of manifest.dashboard?.cards ?? []) {
    for (const entityId of card.entities ?? []) {
      if (isEntityId(entityId) && allowed.has(entityId) && !out.some((source) => source.entityId === entityId)) out.push({ entityId, title: card.title, type: card.type });
    }
  }
  return out;
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
  const allowed = services.filter((service) => actionAllowed(manifest, domain, service, entityId));
  if (TOGGLE_DOMAINS.has(domain) && allowed.includes("turn_on") && allowed.includes("turn_off")) {
    const on = !INACTIVE_STATES.has(String(state?.state ?? "").toLowerCase());
    const rest = allowed.filter((service) => service !== "turn_on" && service !== "turn_off");
    return [{ kind: "toggle", label: "", domain, service: "turn_on", entityId, on }, ...rest.map((service) => controlForService(entityId, domain, service, state)).filter((control): control is ShareControl => Boolean(control))];
  }
  return allowed.map((service) => controlForService(entityId, domain, service, state)).filter((control): control is ShareControl => Boolean(control));
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
  return scopes.has(`${domain}.${service}@${entityId}`) || scopes.has(`${domain}.*@${entityId}`) || scopes.has(`*@${entityId}`) || scopes.has(`${domain}.*`) || scopes.has("*");
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
