import { attachDomainHelpers } from "./domain-helpers.js";
import type { HassFrontend, HassState, VarcoConsumerClient, VarcoDomainHelpers } from "./types.js";

export function createLocalHomeAssistantClient(hass: HassFrontend): VarcoConsumerClient {
  let currentHass = hass;
  let nextSubscriptionId = 1;
  const subscriptions = new Map<string, { entityIds: string[]; cb: (event: any) => void; states: Record<string, HassState | null> }>();
  const client: Omit<VarcoConsumerClient, keyof VarcoDomainHelpers> = {
    consumerPublicKey: "local",
    transportStatus: { mode: "home-assistant", detail: "using Home Assistant frontend session" },

    async requestAccess() {
      return { request_id: "local", pairing_code: "", status: "approved", mode: "home-assistant" };
    },

    async claimShare() {
      return this.getGrantInfo();
    },

    async connect() {},

    async getGrantInfo() {
      return {
        grant_id: "local",
        manifest: {
          name: "Local Home Assistant",
          version: "local",
          read_entities: Object.keys(currentHass.states),
          subscriptions: Object.keys(currentHass.states),
          history: [],
          camera_snapshots: [],
          actions: ["*"],
        },
      };
    },

    async getStates(entityIds: string[]) {
      const states: Record<string, HassState | null> = {};
      for (const entityId of entityIds) states[entityId] = currentHass.states[entityId] ?? null;
      return states;
    },

    async subscribeEntities(entityIds: string[], cb: (event: any) => void) {
      const subscriptionId = `local-${nextSubscriptionId++}`;
      const states = snapshotStates(currentHass, entityIds);
      subscriptions.set(subscriptionId, { entityIds: [...entityIds], cb, states });
      cb({ type: "state_snapshot", subscription_id: subscriptionId, states });
      return subscriptionId;
    },

    async unsubscribe(subscriptionId: string) {
      subscriptions.delete(subscriptionId);
    },

    async queryHistory(entityIds: string[], range: Record<string, unknown> = {}) {
      const callWs = currentHass.callWS
        ? (message: Record<string, unknown>) => currentHass.callWS!(message)
        : currentHass.connection?.sendMessagePromise
          ? (message: Record<string, unknown>) => currentHass.connection!.sendMessagePromise!(message)
          : undefined;
      if (!callWs) throw Object.assign(new Error("Local Home Assistant history websocket API is unavailable"), { code: "local-history-unavailable" });
      try {
        return await callWs({
          type: "history/history_during_period",
          entity_ids: entityIds,
          ...range,
          minimal_response: range.minimal_response ?? true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw Object.assign(new Error(`Local Home Assistant history is unavailable: ${message}`), { code: "local-history-unavailable", cause: err });
      }
    },

    async cameraSnapshot() {
      throw Object.assign(new Error("Local camera snapshots are unavailable"), { code: "local-camera-snapshot-unavailable" });
    },

    async callService(domain: string, service: string, data: { entity_id?: string; pin?: string; pins?: Record<string, string>; [key: string]: unknown } = {}) {
      if (!currentHass.callService) throw Object.assign(new Error("Local Home Assistant service API is unavailable"), { code: "local-service-unavailable" });
      const { entity_id, pin: _pin, pins: _pins, ...serviceData } = data;
      await currentHass.callService(domain, service, serviceData, entity_id ? { entity_id } : {});
    },

    async close() {},

    updateHass(nextHass: HassFrontend) {
      currentHass = nextHass;
      for (const [subscriptionId, subscription] of subscriptions) {
        const nextStates = snapshotStates(currentHass, subscription.entityIds);
        const delta: Record<string, HassState | null> = {};
        for (const entityId of subscription.entityIds) {
          if (!sameState(subscription.states[entityId], nextStates[entityId])) delta[entityId] = nextStates[entityId];
        }
        subscription.states = nextStates;
        if (Object.keys(delta).length) subscription.cb({ type: "state_delta", subscription_id: subscriptionId, states: delta });
      }
    },
  };
  return attachDomainHelpers(client);
}

function snapshotStates(hass: HassFrontend, entityIds: string[]): Record<string, HassState | null> {
  const states: Record<string, HassState | null> = {};
  for (const entityId of entityIds) states[entityId] = hass.states[entityId] ?? null;
  return states;
}

function sameState(left: HassState | null, right: HassState | null): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
