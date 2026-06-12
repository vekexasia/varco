import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = readFileSync('dev/home-assistant/docker-compose.yml', 'utf8');
const deploy = readFileSync('dev/home-assistant/deploy-to-docker-host.sh', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-ha-showcase.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const manifest = JSON.parse(readFileSync('custom_components/varco/manifest.json', 'utf8'));

test('Home Assistant compose lets remote deploy bind Cloudflare-compatible port 80', () => {
  assert.match(compose, /\$\{HA_HTTP_PORT:-8123\}:8123/);
});

test('deploy script preserves remote runtime state, force-recreates Home Assistant, and prunes unused Docker resources', () => {
  assert.match(deploy, /--exclude '\.storage\/'/);
  assert.match(deploy, /--exclude '\.cache\/'/);
  assert.doesNotMatch(deploy, /--exclude 'www\/'/);
  assert.match(deploy, /HA_HTTP_PORT=\$\{HA_HTTP_PORT:-8123\}/);
  assert.match(deploy, /docker compose up -d --force-recreate --remove-orphans homeassistant/);
  assert.match(deploy, /docker system prune -af/);
  assert.doesNotMatch(deploy, /--volumes/);
});

test('Varco declares aiortc so deployed Home Assistant can accept WebRTC offers', () => {
  assert.ok(manifest.requirements.includes('aiortc>=1.9.0'));
});

test('showcase workflow can be triggered manually and verifies public URL plus Varco panel', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /HA_SHOWCASE_PUBLIC_URL/);
  assert.match(workflow, /npm run dev:ha:local-assets/);
  assert.match(workflow, /\$BASE\/varco/);
  assert.match(workflow, /\$BASE\/varco-local-hass\/hass-first/);
  assert.match(workflow, /\$BASE\/local\/varco-client\.js/);
  assert.match(workflow, /\$BASE\/local\/varco-local-hass-card\.js/);
  assert.match(workflow, /npm run dev:ha:local-browser/);
});

test('showcase workflow prepares and deploys the public Gazzetta demo after HA deploy', () => {
  assert.match(workflow, /npm run dev:ha:gazzetta-demo/);
  assert.match(workflow, /wrangler deploy \.pi\/gazzetta-demo-dist --name varco-demo/);
  assert.match(workflow, /varco-demo\.andreabaccega\.com/);
});

test('showcase workflow prepares and deploys the public guest stay demo after HA deploy', () => {
  assert.match(workflow, /examples\/guest-stay-showcase\/\*\*/);
  assert.match(workflow, /npm run dev:ha:guest-stay-demo/);
  assert.match(workflow, /\.pi\/guest-stay-demo-dist/);
  assert.match(workflow, /wrangler deploy \.pi\/guest-stay-demo-dist --name varco-guest-demo/);
  assert.match(workflow, /varco-guest-demo\.andreabaccega\.com/);
});

test('CI runs the hass-first local Home Assistant e2e smoke test', () => {
  assert.match(ciWorkflow, /npx playwright install --with-deps chromium/);
  assert.match(ciWorkflow, /npm run dev:ha:local-assets/);
  assert.match(ciWorkflow, /\.pi\/ci-ha-config/);
  assert.match(ciWorkflow, /"done": \["user", "core_config", "analytics", "integration"\]/);
  assert.match(ciWorkflow, /--name varco-ci-ha/);
  assert.match(ciWorkflow, /npm run dev:ha:local-smoke/);
  assert.match(ciWorkflow, /npm run dev:ha:local-browser/);
});
