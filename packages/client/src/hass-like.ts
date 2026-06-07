import type { VarcoClient } from "./types.js";

export function createHassLikeClient(client: VarcoClient) {
  return {
    async callService(domain: string, service: string, serviceData: Record<string, unknown> = {}, target: Record<string, unknown> = {}) {
      await client.callService(domain, service, { ...serviceData, ...(target.entity_id ? { entity_id: target.entity_id as string } : {}) });
    },
    async fetchStates(entityIds: string[]) {
      return client.getStates(entityIds);
    },
    subscribeEntities: client.subscribeEntities,
    unsubscribe: client.unsubscribe,
  };
}
