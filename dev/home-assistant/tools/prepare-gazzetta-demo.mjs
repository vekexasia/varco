#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createHomeAssistantAdmin, approveRequest, DEFAULT_BRIDGE_URL } from './lib/varco-dev.mjs';

const IDENTITY_KEY = 'varco.consumerIdentity.v1';
const outputPath = process.argv[2] || 'examples/gazzetta-energy-showcase/src/generated-demo-grant.ts';

class ObjectStorage {
  constructor() {
    this.data = {};
  }

  getItem(key) {
    return this.data[key] ?? null;
  }

  setItem(key, value) {
    this.data[key] = value;
  }

  removeItem(key) {
    delete this.data[key];
  }
}

const { createVarcoClient } = await import('../../../packages/client/dist/index.js');
const { createReadOnlyManifest, READ_ENTITIES } = await import('../../../examples/gazzetta-energy-showcase/dist/config.js');

const admin = await createHomeAssistantAdmin();
const bridgeUrl = process.env.VARCO_BRIDGE_URL || DEFAULT_BRIDGE_URL;
const storage = new ObjectStorage();
let client;

try {
  const info = await admin.command('varco/info');
  const authorityId = info.authority_id;
  client = createVarcoClient({
    authorityId,
    bridgeUrl,
    manifest: createReadOnlyManifest(),
    webrtc: false,
    storage,
  });

  const access = await client.requestAccess();
  const grant = await approveRequest(admin, access.request_id);
  await client.connect();
  const states = await client.getStates(READ_ENTITIES);
  for (const entityId of READ_ENTITIES) {
    const state = states[entityId];
    if (!state || state.state === 'unknown' || state.state === 'unavailable') throw new Error(`${entityId} returned ${state?.state || 'missing'}`);
  }

  const identity = JSON.parse(storage.getItem(IDENTITY_KEY));
  const bundle = {
    authorityId,
    bridgeUrl,
    identity,
    grant: {
      authorityId,
      consumerPublicKey: client.consumerPublicKey,
      requestId: access.request_id,
      pairingCode: access.pairing_code,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    },
  };

  writeFileSync(outputPath, generatedSource(bundle));
  console.log(`Prepared Gazzetta demo grant ${grant.grant_id || access.request_id} for Authority ${authorityId}`);
} finally {
  await client?.close?.();
  admin.close?.();
}

function generatedSource(bundle) {
  return `import type { SavedShowcaseGrant } from "./grant-store.js";\n\nexport type DemoGrantBundle = {\n  authorityId: string;\n  bridgeUrl: string;\n  identity: {\n    privateKey: string;\n    publicKey: string;\n  };\n  grant: SavedShowcaseGrant;\n};\n\nexport const DEMO_GRANT_BUNDLE: DemoGrantBundle | null = ${JSON.stringify(bundle, null, 2)};\n`;
}
