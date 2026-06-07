#!/usr/bin/env node
import { createHomeAssistantAdmin, deleteGrant, listVarco, pairVarcoConsumer, runVarcoSmoke } from './lib/varco-dev.mjs';

const command = process.argv[2] || 'help';
const arg = process.argv[3];

try {
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
  } else if (command === 'list') {
    const admin = await createHomeAssistantAdmin();
    try {
      const state = await listVarco(admin);
      printList(state);
    } finally {
      admin.close();
    }
  } else if (command === 'approve') {
    if (!arg) throw new Error('approve requires a request_id');
    const admin = await createHomeAssistantAdmin();
    try {
      console.log(JSON.stringify(await admin.command('varco/approve_request', { request_id: arg }), null, 2));
    } finally {
      admin.close();
    }
  } else if (command === 'pair') {
    console.log(JSON.stringify(await pairVarcoConsumer(), null, 2));
  } else if (command === 'delete-grant') {
    if (!arg) throw new Error('delete-grant requires a grant_id');
    const admin = await createHomeAssistantAdmin();
    try {
      console.log(JSON.stringify(await deleteGrant(admin, arg), null, 2));
    } finally {
      admin.close();
    }
  } else if (command === 'smoke') {
    await runVarcoSmoke();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`Usage: node dev/home-assistant/tools/ha-varco.mjs COMMAND

Commands:
  list                    Show Varco authority, relay, access requests, and grants
  approve REQUEST_ID      Approve a pending Varco request through Home Assistant
  pair                    Create, approve, connect, and leave a reusable development grant
  delete-grant GRANT_ID   Delete a Varco grant through Home Assistant
  smoke                   Request, approve, connect, verify data plane, and delete the test grant

Defaults for the development Home Assistant instance:
  HA_URL=http://127.0.0.1:8123
  HA_USERNAME=test
  HA_PASSWORD=test
  VARCO_BRIDGE_URL=wss://varco-bridge.vekexasia.workers.dev
`);
}

function printList(state) {
  console.log(`Authority: ${state.info.authority_id}`);
  console.log(`Relay: ${state.info.relay?.connected ? 'connected' : 'disconnected'}`);
  console.log(`Access requests: ${state.requests.length}`);
  for (const request of state.requests) {
    console.log(`- ${request.request_id} ${request.manifest?.name || 'Unknown'} ${request.pairing_code} ${request.status}`);
  }
  console.log(`Grants: ${state.grants.length}`);
  for (const grant of state.grants) {
    console.log(`- ${grant.grant_id} ${grant.manifest?.name || 'Unknown'} ${grant.revoked ? 'revoked' : 'active'}`);
  }
}
