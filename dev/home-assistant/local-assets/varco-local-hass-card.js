import { createVarcoConsumerClient } from "/local/varco-client.js";

class VarcoLocalHassCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      entities: ["sensor.powerwall_load_w", "sensor.powerwall_charge", "switch.ev_charger"],
      history_entity: "sensor.powerwall_load_w",
      action_entity: "switch.ev_charger",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.client) this.start();
    else this.client.updateHass(hass);
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  async start() {
    if (!this._hass || this.starting) return;
    this.starting = true;
    this.events = [];
    this.message = "Starting local Home Assistant mode...";
    try {
      this.client = createVarcoConsumerClient({
        hass: this._hass,
        authorityId: "ignored-local-mode-authority",
        bridgeUrl: "ws://ignored-local-mode-bridge",
        manifest: {
          name: "Varco local Home Assistant dashboard",
          version: "dev",
          read_entities: this.config.entities,
          subscriptions: this.config.entities,
          history: [this.config.history_entity],
          camera_snapshots: [],
          actions: [`switch.turn_on@${this.config.action_entity}`, `switch.turn_off@${this.config.action_entity}`],
        },
      });
      this.access = await this.client.requestAccess();
      await this.client.connect();
      const states = await this.client.getStates(this.config.entities);
      this.localStates = states;
      this.subscriptionId = await this.client.subscribeEntities(this.config.entities, (event) => {
        this.events = [event, ...(this.events || [])].slice(0, 5);
        if (event.states) this.localStates = { ...(this.localStates || {}), ...event.states };
        this.render();
      });
      this.message = "Connected through createVarcoConsumerClient({ hass })";
    } catch (err) {
      this.message = err instanceof Error ? err.message : String(err);
    } finally {
      this.starting = false;
      this.render();
    }
  }

  async toggleAction() {
    const entity = this.config.action_entity;
    const state = this._hass?.states?.[entity]?.state;
    const service = state === "on" ? "turn_off" : "turn_on";
    await this.client.callService("switch", service, { entity_id: entity });
    this.message = `Called switch.${service} locally for ${entity}`;
    this.render();
  }

  async loadHistory() {
    const entity = this.config.history_entity;
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    try {
      const history = await this.client.queryHistory([entity], {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      this.historyMessage = `${entity}: ${(history?.[entity] || []).length} history rows from HA websocket`;
    } catch (err) {
      this.historyMessage = err instanceof Error ? err.message : String(err);
    }
    this.render();
  }

  render() {
    const states = this.localStates || Object.fromEntries((this.config?.entities || []).map((entity) => [entity, this._hass?.states?.[entity] || null]));
    this.innerHTML = `
      <ha-card header="Varco local Home Assistant mode">
        <div class="card-content">
          <style>
            .pill { display:inline-block; border-radius:999px; padding:4px 8px; font-size:12px; font-weight:700; background:var(--success-color, #0b8043); color:white; }
            .muted { color: var(--secondary-text-color); }
            code { background: var(--secondary-background-color); padding: 2px 5px; border-radius: 4px; }
            button { margin: 8px 8px 8px 0; padding: 8px 12px; border: 0; border-radius: 6px; background: var(--primary-color); color: var(--text-primary-color); cursor: pointer; font-weight: 600; }
            table { width:100%; border-collapse: collapse; margin-top: 12px; }
            td, th { text-align:left; border-top: 1px solid var(--divider-color); padding: 7px 4px; }
            pre { white-space: pre-wrap; background: var(--secondary-background-color); padding: 8px; border-radius: 8px; max-height: 180px; overflow: auto; }
          </style>
          <p><span class="pill">${this.escape(this.access?.mode || "home-assistant")}</span></p>
          <p>${this.escape(this.message || "Waiting for hass...")}</p>
          <p class="muted">This card passes the explicit Lovelace <code>hass</code> object to <code>createVarcoConsumerClient({ hass })</code>. There is no relay, pairing code, or Varco grant.</p>
          <table>
            <thead><tr><th>Entity</th><th>State from local client</th><th>HA frontend state</th></tr></thead>
            <tbody>${Object.entries(states).map(([entity, state]) => `
              <tr><td><code>${this.escape(entity)}</code></td><td>${this.escape(state?.state ?? "missing")}</td><td>${this.escape(this._hass?.states?.[entity]?.state ?? "missing")}</td></tr>`).join("")}</tbody>
          </table>
          <button id="toggle" ${this.client ? "" : "disabled"}>Toggle ${this.escape(this.config?.action_entity || "switch")}</button>
          <button id="history" ${this.client ? "" : "disabled"}>Query local HA history</button>
          ${this.historyMessage ? `<p>${this.escape(this.historyMessage)}</p>` : ""}
          <h4>Recent local subscription events</h4>
          <pre>${this.escape(JSON.stringify(this.events || [], null, 2))}</pre>
        </div>
      </ha-card>`;
    this.querySelector("#toggle")?.addEventListener("click", () => this.toggleAction());
    this.querySelector("#history")?.addEventListener("click", () => this.loadHistory());
  }

  escape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));
  }
}

customElements.define("varco-local-hass-card", VarcoLocalHassCard);
