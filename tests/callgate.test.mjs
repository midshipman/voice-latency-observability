import { CallGate } from '../worker/worker.js';
if (!Response.json) Response.json = (o, init={}) => new Response(JSON.stringify(o), { ...init, headers: { 'content-type': 'application/json' } });
let T = 1_000_000_000_000;
const realNow = Date.now; Date.now = () => T;
const store = {};
const state = { storage: { async get(k){ return store[k] ? JSON.parse(JSON.stringify(store[k])) : undefined; }, async put(k,v){ store[k] = JSON.parse(JSON.stringify(v)); } } };
const gate = new CallGate(state, { DAILY_CALL_CAP_MS: 0 });
const req = (p, body) => gate.fetch(new Request('https://gate' + p, body ? { method: 'POST', body: JSON.stringify(body) } : {}));
const j = async (r) => ({ status: r.status, ...(await r.json()) });
let pass = 0, fail = 0;
const chk = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); };

// 1. acquire -> attach -> heartbeat keeps alive past 90s -> release -> inactive, charged
let a = await j(await req('/acquire')); chk('acquire ok', a.ok === true);
await req('/attach', { lease: a.lease });
for (let i = 0; i < 4; i++) { T += 30000; let h = await j(await req('/heartbeat', { lease: a.lease })); if (h.ok !== true) chk('heartbeat ' + i, false); }
chk('heartbeats kept lease alive >90s', (await j(await req('/acquire'))).reason === 'busy');
let u0 = (await j(await req('/state'))).usedMs;
await req('/release', { lease: a.lease });
let st = await j(await req('/state'));
chk('release frees immediately', st.active === false);
chk('release charges attached session', st.usedMs > u0);

// 2. orphan WITH attach: no beats -> expires 90s after last beat, next acquire clears + charges
T += 1000; a = await j(await req('/acquire'));
await req('/attach', { lease: a.lease });
T += 91000; // 91s, no heartbeat
let b = await j(await req('/acquire'));
chk('stale attached lease self-expires ~90s (cleared on next acquire)', b.ok === true);
st = await j(await req('/state'));
chk('orphan charge capped by lease window (<=12min)', st.usedMs <= 12*60*1000 + 1 && st.usedMs > 0);
await req('/release', { lease: b.lease }); // clean

// 3. orphan WITHOUT attach: cleared, zero charge
T += 1000; a = await j(await req('/acquire'));
let u1 = (await j(await req('/state'))).usedMs;
T += 91000;
b = await j(await req('/acquire'));
chk('unattached orphan cleared', b.ok === true);
chk('unattached orphan charges 0', (await j(await req('/state'))).usedMs === u1);
await req('/release', { lease: b.lease }); // clean

// 4. heartbeat rejected for wrong/missing lease
T += 1000; a = await j(await req('/acquire'));
let h = await j(await req('/heartbeat', { lease: 'bogus' }));
chk('heartbeat without attach rejected', h.status === 409);
await req('/attach', { lease: a.lease });
h = await j(await req('/heartbeat', { lease: 'bogus' }));
chk('heartbeat with wrong lease rejected', h.status === 409);
h = await j(await req('/heartbeat', { lease: a.lease }));
chk('heartbeat with right lease accepted', h.ok === true);

// 5. busy: second acquire while active -> 409
chk('active lease blocks second acquire', (await j(await req('/acquire'))).status === 409);
await req('/release', { lease: a.lease }); // clean

// 6. bound lease: stale -> stale_unverified (no auto-evict), force-release needs callSid match
T += 1000; a = await j(await req('/acquire'));
await req('/attach', { lease: a.lease });
await req('/bind', { lease: a.lease, callSid: 'CA-test-1' });
T += 91000;
let r6 = await j(await req('/acquire'));
chk('bound stale lease NOT auto-evicted (stale_unverified)', r6.status === 409 && r6.reason === 'stale_unverified' && r6.callSid === 'CA-test-1');
let fr = await j(await req('/force-release', { callSid: 'CA-wrong' }));
chk('force-release with wrong callSid refused', fr.status === 409);
fr = await j(await req('/force-release', { callSid: 'CA-test-1' }));
chk('force-release with bound callSid works', fr.ok === true);
chk('gate free after verified release', (await j(await req('/state'))).active === false);
let b6 = await j(await req('/acquire'));
chk('reacquire after verified release', b6.ok === true);

Date.now = realNow;
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
