#!/usr/bin/env node
// Creates the gitignored generated-demo-grant.ts with a null bundle when missing,
// so fresh clones build without running the demo prep script.
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'generated-demo-grant.ts');
if (!existsSync(target)) {
  writeFileSync(target, `import type { SavedShowcaseGrant } from "./grant-store.js";\n\nexport type DemoGrantBundle = {\n  authorityId: string;\n  bridgeUrl: string;\n  identity: {\n    privateKey: string;\n    publicKey: string;\n  };\n  grant: SavedShowcaseGrant;\n};\n\nexport const DEMO_GRANT_BUNDLE: DemoGrantBundle | null = null;\n`);
}
