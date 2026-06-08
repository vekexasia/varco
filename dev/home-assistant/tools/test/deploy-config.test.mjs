import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = readFileSync('dev/home-assistant/docker-compose.yml', 'utf8');
const deploy = readFileSync('dev/home-assistant/deploy-to-docker-host.sh', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-ha-showcase.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');

test('Home Assistant compose lets remote deploy bind Cloudflare-compatible port 80', () => {
  assert.match(compose, /\$\{HA_HTTP_PORT:-8123\}:8123/);
});

test('deploy script preserves remote runtime state and force-recreates Home Assistant after syncing code', () => {
  assert.match(deploy, /--exclude '\.storage\/'/);
  assert.match(deploy, /--exclude '\.cache\/'/);
  assert.match(deploy, /HA_HTTP_PORT=\$\{HA_HTTP_PORT:-8123\}/);
  assert.match(deploy, /docker compose up -d --force-recreate homeassistant/);
});

test('showcase workflow can be triggered manually and verifies public URL plus Varco panel', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /HA_SHOWCASE_PUBLIC_URL/);
  assert.match(workflow, /\$BASE\/varco/);
});

test('showcase workflow prepares and deploys the public Gazzetta demo after HA deploy', () => {
  assert.match(workflow, /npm run dev:ha:gazzetta-demo/);
  assert.match(workflow, /wrangler deploy \.pi\/gazzetta-demo-dist --name varco-demo/);
  assert.match(workflow, /varco-demo\.andreabaccega\.com/);
});

test('CI runs the hass-first local Home Assistant e2e smoke test', () => {
  assert.match(ciWorkflow, /npx playwright install --with-deps chromium/);
  assert.match(ciWorkflow, /npm run dev:ha:local-assets/);
  assert.match(ciWorkflow, /docker compose up -d homeassistant/);
  assert.match(ciWorkflow, /npm run dev:ha:local-smoke/);
  assert.match(ciWorkflow, /npm run dev:ha:local-browser/);
});
