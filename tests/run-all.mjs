// Runs every tests/*.test.mjs in its own process and fails if any fails.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const dir = new URL('.', import.meta.url);
let failed = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  const r = spawnSync(process.execPath, [new URL(f, dir).pathname], { encoding: 'utf8' });
  const ok = r.status === 0;
  console.log((ok ? 'ok   ' : 'FAIL ') + f);
  if (!ok) { failed++; console.log((r.stdout + r.stderr).split('\n').slice(-15).join('\n')); }
}
console.log(failed ? `${failed} test file(s) failed` : 'all test files passed');
process.exit(failed ? 1 : 0);
