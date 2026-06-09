import { loadOrCreateIdentity, randomId, signAccessRequest, signAuthenticate } from "./identity.js";
import { attachDomainHelpers } from "./domain-helpers.js";
import { MemoryStorage } from "./memory-storage.js";
import { RelayTransport } from "./transport.js";
import type { HassState, VarcoClient, VarcoClientOptions, VarcoTransport, VarcoTransportStatus } from "./types.js";

export function createVarcoClient(options: VarcoClientOptions): VarcoClient {
  const storage = options.storage ?? (globalThis.localStorage ?? new MemoryStorage());
  const identity = loadOrCreateIdentity(storage);
  const relayTransport: VarcoTransport = options.transport ?? new RelayTransport(options.bridgeUrl, options.authorityId);
  let activeTransport: VarcoTransport = relayTransport;
  let transportStatus: VarcoTransportStatus = { mode: "relay", detail: "connected via relay" };
  const subscriptionKeys = new Map<string, string>();
  const callbacks = new Map<string, (event: any) => void>();
  const attachEvents = (transport: VarcoTransport) => transport.onEvent?.((event) => {
    if ((event.type === "state_snapshot" || event.type === "state_delta") && event.subscription_id) callbacks.get(event.subscription_id)?.(event);
  });
  const setStatus = (status: VarcoTransportStatus) => {
    transportStatus = status;
    options.onTransportStatus?.(status);
  };
  attachEvents(relayTransport);

  return attachDomainHelpers({
    get consumerPublicKey() { return identity.publicKey; },
    get transportStatus() { return transportStatus; },

    async requestAccess() {
      const nonce = randomId(12);
      const response = await relayTransport.request({
        type: "access_request",
        consumer_pk: identity.publicKey,
        manifest: options.manifest,
        nonce,
        signature: signAccessRequest(identity, nonce, options.manifest),
      });
      return { request_id: response.request_id, pairing_code: response.pairing_code, status: response.status };
    },

    async connect() {
      const nonce = randomId(12);
      await relayTransport.request({
        type: "authenticate",
        consumer_pk: identity.publicKey,
        nonce,
        signature: signAuthenticate(identity, nonce),
      });
      setStatus({ mode: "relay", detail: "relay authenticated" });
      if (options.webrtc !== false) {
        const p2p = await tryWebRtcUpgrade(relayTransport, setStatus);
        if (p2p) {
          activeTransport = p2p;
          attachEvents(activeTransport);
          setStatus({ mode: "p2p", detail: "WebRTC data channel connected" });
        }
      }
    },

    async getStates(entityIds: string[]) {
      const response = await activeTransport.request({ type: "get_states", entity_ids: entityIds });
      return response.states as Record<string, HassState | null>;
    },

    async subscribeEntities(entityIds: string[], cb: (event: any) => void) {
      const key = [...entityIds].sort().join("\0");
      if ([...subscriptionKeys.values()].includes(key)) options.warn?.(`Duplicate Varco subscription for ${entityIds.join(", ")}`);
      const response = await activeTransport.request({ type: "subscribe_states", entity_ids: entityIds });
      subscriptionKeys.set(response.subscription_id, key);
      callbacks.set(response.subscription_id, cb);
      cb(response);
      return response.subscription_id as string;
    },

    async unsubscribe(subscriptionId: string) {
      await activeTransport.request({ type: "unsubscribe_states", subscription_id: subscriptionId });
      subscriptionKeys.delete(subscriptionId);
      callbacks.delete(subscriptionId);
    },

    async queryHistory(entityIds: string[], range: Record<string, unknown> = {}) {
      const response = await activeTransport.request({ type: "history_query", entity_ids: entityIds, ...range });
      return response.history;
    },

    async cameraSnapshot(entityId: string) {
      const response = await activeTransport.request({ type: "camera_snapshot", entity_id: entityId });
      return { contentType: response.content_type, body: response.body };
    },

    async callService(domain: string, service: string, data: { entity_id?: string; pin?: string; pins?: Record<string, string>; [key: string]: unknown } = {}) {
      const { entity_id, pin, pins, ...service_data } = data;
      await activeTransport.request({
        type: "call_service",
        domain,
        service,
        service_data,
        target: entity_id ? { entity_id } : {},
        ...(pin ? { pin } : {}),
        ...(pins ? { pins } : {}),
      });
    },

    async close() {
      await activeTransport.close?.();
      if (activeTransport !== relayTransport) await relayTransport.close?.();
    },
  });
}

class DataChannelTransport implements VarcoTransport {
  private pending = new Map<string, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private eventHandler: ((event: any) => void) | null = null;

  constructor(private pc: RTCPeerConnection, private channel: RTCDataChannel) {
    this.channel.addEventListener("message", (event) => this.handleMessage(String(event.data)));
  }

  onEvent(handler: (event: any) => void): void { this.eventHandler = handler; }

  async request(message: Record<string, unknown>): Promise<any> {
    const requestId = (message.request_id as string | undefined) ?? randomId(8);
    const withId = { ...message, request_id: requestId };
    const response = new Promise((resolve, reject) => this.pending.set(requestId, { resolve, reject }));
    this.channel.send(JSON.stringify(withId));
    return response;
  }

  async close(): Promise<void> {
    this.channel.close();
    this.pc.close();
  }

  private handleMessage(data: string): void {
    const payload = JSON.parse(data);
    const requestId = payload.request_id;
    if (requestId && this.pending.has(requestId)) {
      const pending = this.pending.get(requestId)!;
      this.pending.delete(requestId);
      if (payload.type === "error") pending.reject(Object.assign(new Error(payload.message), { code: payload.code }));
      else pending.resolve(payload);
      return;
    }
    this.eventHandler?.(payload);
  }
}

async function tryWebRtcUpgrade(relayTransport: VarcoTransport, setStatus: (status: VarcoTransportStatus) => void): Promise<VarcoTransport | null> {
  const Peer = globalThis.RTCPeerConnection;
  if (!Peer) {
    setStatus({ mode: "relay", detail: "WebRTC unavailable in this browser" });
    return null;
  }
  const pc = new Peer({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const channel = pc.createDataChannel("varco", { ordered: true });
  try {
    const opened = waitForDataChannelOpen(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);
    const local = pc.localDescription ?? offer;
    const answer = await relayTransport.request({ type: "webrtc_offer", sdp: local.sdp, sdp_type: local.type });
    if (answer.type !== "webrtc_answer") {
      setStatus({ mode: "relay", detail: answer.reason || "Authority kept relay fallback" });
      pc.close();
      return null;
    }
    await pc.setRemoteDescription({ type: answer.sdp_type ?? "answer", sdp: answer.sdp });
    await opened;
    return new DataChannelTransport(pc, channel);
  } catch (err) {
    setStatus({ mode: "relay", detail: err instanceof Error ? err.message : "WebRTC failed" });
    pc.close();
    return null;
  }
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 5000);
  });
}

function waitForDataChannelOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebRTC data channel timeout")), 10_000);
    channel.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
