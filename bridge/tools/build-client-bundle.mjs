import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const bridgeDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(bridgeDir, '..');

execFileSync('npm', ['--workspace', 'packages/client', 'run', 'build'], { cwd: rootDir, stdio: 'inherit' });
const js = readFileSync(resolve(rootDir, 'packages/client/dist/varco-client.js'), 'utf8');
writeFileSync(resolve(bridgeDir, 'src/varco-client-bundle.ts'), `export const VARCO_CLIENT_BUNDLE = ${JSON.stringify(js)};\n`);

const version = JSON.parse(readFileSync(resolve(bridgeDir, 'package.json'), 'utf8')).version ?? 'unknown';
writeFileSync(resolve(bridgeDir, 'src/version.ts'), `export const VERSION = ${JSON.stringify(version)};\n`);
