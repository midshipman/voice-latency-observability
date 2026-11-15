// Runs the real-call replay with synthetic speech lengths (short / long / breath pause). Timestamps of turn 1 are rescaled; recorded transcript wait is kept.
import { spawnSync } from 'node:child_process';
let bad=0;
for (const env of [{}, {UTT_SPEAK_MS:'800'}, {UTT_SPEAK_MS:'2000'}, {UTT_SPEAK_MS:'7000'}, {UTT_SPEAK_MS:'12000'}, {UTT_SPEAK_MS:'3200',PAUSE_MS:'300'}, {UTT_SPEAK_MS:'6000',PAUSE_MS:'350'}]) {
  const r = spawnSync('node', [new URL('./replay.test.mjs', import.meta.url).pathname], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const last = r.stdout.trim().split('\n').pop();
  console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + JSON.stringify(env) + ' -> ' + last);
  if (r.status !== 0) { bad++; console.log(r.stdout.split('\n').filter(l => l.startsWith('FAIL')).join('\n')); }
}
console.log((bad ? 'FAILED ' + bad : 'ALL VARIANTS PASSED'));
process.exit(bad ? 1 : 0);
