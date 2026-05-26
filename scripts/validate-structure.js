const fs = require('fs');
const path = require('path');

const required = [
  'apps/desktop/package.json',
  'apps/desktop/src/main/main.ts',
  'apps/desktop/src/preload/preload.ts',
  'apps/desktop/src/renderer/App.tsx',
  'packages/core/src/models.ts',
  'engines/illustrator/references/engine.json',
  'engines/canva/references/engine.json',
  'claude-skill/CLAUDE.md'
];

let failed = false;
for (const rel of required) {
  const full = path.join(__dirname, '..', rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${rel}`);
    failed = true;
  } else {
    console.log(`PASS: ${rel}`);
  }
}
process.exit(failed ? 1 : 0);
