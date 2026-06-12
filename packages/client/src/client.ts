import { loadIdentitySync, loadOrCreateIdentity, randomId, signAccessRequest, signAuthenticate } from "./identity.js";
import type { ConsumerIdentity } from "./identity.js";
import { attachDomainHelpers } from "./domain-helpers.js";
import { RelayTransport } from "./transport.js";
import type { HassState, VarcoClient, VarcoClientOptions, VarcoTransport, VarcoTransportStatus } from "./types.js";

function assertManifest(manifest: VarcoClientOptions["manifest"]): void {
  if (!manifest || typeof manifest.name !== "string" || !manifest.name) throw new Error("Varco manifest requires a non-empty name");
  if (manifest.read_entities && manifest.readEntities) throw new Error("Varco manifest must not set both read_entities and readEntities");
  if (manifest.camera_snapshots && manifest.cameraSnapshots) throw new Error("Varco manifest must not set both camera_snapshots and cameraSnapshots");
}

export function createVarcoClient(options: VarcoClientOptions): VarcoClient {
  assertManifest(options.manifest);
  let identity: ConsumerIdentity | null = loadIdentitySync(options.storage);
  const identityPromise = identity ? Promise.resolve(identity) : loadOrCreateIdentity(options.storage).then((resolved) => { identity = resolved; return resolved; });
  const createRelay = (): VarcoTransport => options.transport ?? new RelayTransport(options.bridgeUrl, options.authorityId);
  let relayTransport: VarcoTransport = createRelay();
  let activeTransport: VarcoTransport = relayTransport;
  let transportStatus: VarcoTransportStatus = { mode: "relay", detail: "connected via relay" };
  let closedByUser = false;
  let reconnecting = false;
  const subscriptions = new Map<string, { entityIds: string[]; cb: (event: any) => void; currentId: string }>();
  const callbacks = new Map<string, (event: any) => void>();
  const attachEvents = (transport: VarcoTransport) => transport.onEvent?.((event) => {
    if ((event.type === "state_snapshot" || event.type === "state_delta") && event.subscription_id) callbacks.get(event.subscription_id)?.(event);
  });
  const setStatus = (status: VarcoTransportStatus) => {
    transportStatus = status;
    options.onTransportStatus?.(status);
  };

  const establish = async () => {
    const id = await identityPromise;
    const nonce = randomId(12);
    const binding = (await (relayTransport as { channelBinding?: () => Promise<string> }).channelBinding?.()) ?? "";
    await relayTransport.request({
      type: "authenticate",
      consumer_pk: id.publicKey,
      nonce,
      signature: await signAuthenticate(id, nonce, binding),
    });
    setStatus({ mode: "relay", detail: "relay authenticated" });
    if (options.webrtc !== false) {
      const p2p = await tryWebRtcUpgrade(relayTransport, setStatus);
      if (p2p) {
        activeTransport = p2p;
        attachEvents(activeTransport);
        activeTransport.onClose?.(scheduleReconnect);
        setStatus({ mode: "p2p", detail: "WebRTC data channel connected" });
      }
    }
    // No silent fallback on a signaling-only bridge: relay data is rejected
    // there, so surface the failure instead of leaving a dead relay transport.
    if (activeTransport === relayTransport && transportStatus.detail !== undefined && isSignalingOnlyError(transportStatus.detail)) {
      throw new Error(transportStatus.detail);
    }
  };

  const scheduleReconnect = () => {
    if (!options.reconnect || closedByUser || reconnecting) return;
    reconnecting = true;
    let attempt = 0;
    const tryOnce = async () => {
      if (closedByUser) { reconnecting = false; return; }
      attempt += 1;
      setStatus({ mode: "relay", detail: `reconnecting (attempt ${attempt})` });
      try {
        await relayTransport.close?.();
        relayTransport = createRelay();
        activeTransport = relayTransport;
        attachEvents(relayTransport);
        relayTransport.onClose?.(scheduleReconnect);
        await establish();
        for (const record of subscriptions.values()) {
          const response = await activeTransport.request({ type: "subscribe_states", entity_ids: record.entityIds });
          callbacks.delete(record.currentId);
          record.currentId = response.subscription_id;
          callbacks.set(record.currentId, record.cb);
          record.cb(response);
        }
        reconnecting = false;
        setStatus({ ...transportStatus, detail: transportStatus.detail ?? "reconnected" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isSignalingOnlyError(message)) {
          reconnecting = false;
          setStatus({ mode: "relay", detail: message });
          return;
        }
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)) * (0.5 + Math.random() * 0.5);
        setTimeout(() => { void tryOnce(); }, delay);
      }
    };
    void tryOnce();
  };

  attachEvents(relayTransport);
  relayTransport.onClose?.(scheduleReconnect);

  return attachDomainHelpers({
    get consumerPublicKey() { return identity?.publicKey ?? ""; },
    get transportStatus() { return transportStatus; },

    async requestAccess() {
      const id = await identityPromise;
      const nonce = randomId(12);
      const response = await relayTransport.request({
        type: "access_request",
        consumer_pk: id.publicKey,
        manifest: options.manifest,
        nonce,
        signature: await signAccessRequest(id, nonce, options.manifest),
      });
      return { request_id: response.access_request_id, pairing_code: response.pairing_code, status: response.status };
    },

    async connect() {
      await establish();
    },

    async getStates(entityIds: string[]) {
      const response = await activeTransport.request({ type: "get_states", entity_ids: entityIds });
      return response.states as Record<string, HassState | null>;
    },

    async subscribeEntities(entityIds: string[], cb: (event: any) => void) {
      const key = [...entityIds].sort().join("\0");
      const existing = [...subscriptions.values()].some((record) => [...record.entityIds].sort().join("\0") === key);
      if (existing) options.warn?.(`Duplicate Varco subscription for ${entityIds.join(", ")}`);
      const response = await activeTransport.request({ type: "subscribe_states", entity_ids: entityIds });
      const subscriptionId = response.subscription_id as string;
      subscriptions.set(subscriptionId, { entityIds: [...entityIds], cb, currentId: subscriptionId });
      callbacks.set(subscriptionId, cb);
      cb(response);
      return subscriptionId;
    },

    async unsubscribe(subscriptionId: string) {
      const record = subscriptions.get(subscriptionId);
      await activeTransport.request({ type: "unsubscribe_states", subscription_id: record?.currentId ?? subscriptionId });
      if (record) callbacks.delete(record.currentId);
      subscriptions.delete(subscriptionId);
      callbacks.delete(subscriptionId);
    },

    async queryHistory(entityIds: string[], range: Record<string, unknown> = {}) {
      if (entityIds.length > 10) {
        options.warn?.(`Varco history_query with ${entityIds.length} entities exceeds the Authority limit of 10 and will be rejected`);
      }
      const start = typeof range.start_time === "string" ? Date.parse(range.start_time) : NaN;
      const end = typeof range.end_time === "string" ? Date.parse(range.end_time) : Date.now();
      if (Number.isFinite(start) && end - start > 30 * 24 * 60 * 60 * 1000) {
        options.warn?.("Varco history_query range exceeds 30 days; the Authority will clamp it");
      }
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
      closedByUser = true;
      await activeTransport.close?.();
      if (activeTransport !== relayTransport) await relayTransport.close?.();
    },
  });
}

class DataChannelTransport implements VarcoTransport {
  private pending = new Map<string, { resolve: (value: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private eventHandler: ((event: any) => void) | null = null;

  constructor(private pc: RTCPeerConnection, private channel: RTCDataChannel, private requestTimeoutMs = 30_000) {
    this.channel.addEventListener("message", (event) => {
      try {
        this.handleMessage(String(event.data));
      } catch (err) {
        this.failPending(err instanceof Error ? err : new Error(String(err)));
      }
    });
    this.channel.addEventListener("close", () => this.failPending(new Error("Varco transport closed")));
    this.channel.addEventListener("error", () => this.failPending(new Error("Varco data channel error")));
  }

  onEvent(handler: (event: any) => void): void { this.eventHandler = handler; }

  async request(message: Record<string, unknown>): Promise<any> {
    const requestId = (message.request_id as string | undefined) ?? randomId(8);
    const withId = { ...message, request_id: requestId };
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Varco request timed out: ${String(message.type)}`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
    });
    this.channel.send(JSON.stringify(withId));
    return response;
  }

  async close(): Promise<void> {
    this.channel.close();
    this.pc.close();
    this.failPending(new Error("Varco transport closed"));
  }

  private failPending(err: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  private handleMessage(data: string): void {
    const payload = JSON.parse(data);
    const requestId = payload.request_id;
    if (requestId && this.pending.has(requestId)) {
      const pending = this.pending.get(requestId)!;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      if (payload.type === "error") pending.reject(Object.assign(new Error(payload.message), { code: payload.code }));
      else pending.resolve(payload);
      return;
    }
    this.eventHandler?.(payload);
  }
}

function isSignalingOnlyError(message: string): boolean {
  return message.includes("signaling-only");
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
    const detail = err instanceof Error ? err.message : "WebRTC failed";
    setStatus({ mode: "relay", detail });
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
