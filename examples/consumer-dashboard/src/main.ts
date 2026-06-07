import { createVarcoClient } from "@varco/client";

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
const log = (value: unknown) => { $("log").textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };
const setTransport = (mode: string, detail?: string) => { $("transport").innerHTML = `<b>Transport:</b> ${mode === "p2p" ? "WebRTC peer-to-peer" : "Cloudflare relay"}${detail ? ` <small>(${detail})</small>` : ""}`; };

function client() {
  const entities = $("entities").value.split(",").map((item) => item.trim()).filter(Boolean);
  return createVarcoClient({
    authorityId: $("authority").value.trim(),
    bridgeUrl: $("bridge").value.trim(),
    manifest: {
      name: "Varco demo dashboard",
      icon: "mdi:view-dashboard",
      version: "0.1.0",
      read_entities: entities,
      subscriptions: entities,
      history: entities,
      camera_snapshots: [],
      actions: [],
    },
    warn: console.warn,
    onTransportStatus: (status) => setTransport(status.mode, status.detail),
  });
}

$("pair").onclick = async () => {
  try { log(await client().requestAccess()); } catch (err) { log(String(err)); }
};

$("connect").onclick = async () => {
  try {
    const c = client();
    await c.connect();
    const entities = $("entities").value.split(",").map((item) => item.trim()).filter(Boolean);
    const states = await c.getStates(entities);
    const subscriptionId = await c.subscribeEntities(entities, (event) => log({ states, event }));
    log({ states, subscriptionId });
  } catch (err) { log(String(err)); }
};
