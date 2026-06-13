#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const expected = (process.argv[2] || process.env.VERSION || '').replace(/^v/, '');
if (!expected) {
  console.error('Usage: node dev/check-release-version.mjs <version-or-vtag>');
  process.exit(2);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const checks = [
  ['@varco/client', 'packages/client/package.json', readJson('packages/client/package.json').version],
  ['@varco/bridge', 'bridge/package.json', readJson('bridge/package.json').version],
  ['Home Assistant integration', 'custom_components/varco/manifest.json', readJson('custom_components/varco/manifest.json').version],
];

let ok = true;
for (const [name, path, version] of checks) {
  if (version !== expected) {
    console.error(`${name} version mismatch in ${path}: expected ${expected}, found ${version}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(`Release versions match ${expected}`);
