#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const sources = [
  'custom_components/varco/relay.py',
  'bridge/src/logic.ts',
];
const declaration = /^[ \t]*(?:export[ \t]+)?(?:const[ \t]+)?PROTO_VERSION[ \t]*=[ \t]*(\d+)[ \t]*;?[ \t]*$/gm;

function readProtocolVersion(path) {
  const matches = [...readFileSync(path, 'utf8').matchAll(declaration)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one PROTO_VERSION declaration in ${path}, found ${matches.length}`);
  }
  return Number(matches[0][1]);
}

const versions = sources.map((path) => [path, readProtocolVersion(path)]);
const expected = versions[0][1];
const mismatches = versions.filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error(`PROTO_VERSION mismatch: ${versions.map(([path, version]) => `${path}=${version}`).join(', ')}`);
  process.exit(1);
}

console.log(`PROTO_VERSION matches in ${sources.join(' and ')}: ${expected}`);
