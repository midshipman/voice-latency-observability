// Synthetic telemetry validation (P3 acceptance cases). Sends simulated rows (no phone calls) to the deployed site at BASE, so it needs network and a login cookie. Its effect on live data and cost is unverified; not part of npm test.
// Usage: VP_COOKIE="vp_sess=..." BASE=https://YOUR-PROJECT.pages.dev node scripts/validate-telemetry.mjs
const BASE = process.env.BASE || "https://YOUR-PROJECT.pages.dev";
const COOKIE = process.env.VP_COOKIE;
if (!COOKIE) { console.error("VP_COOKIE required"); process.exit(2); }
const H = { "content-type": "application/json", cookie: COOKIE };
const sid = "SIM-VAL-" + Date.now().toString(36).toUpperCase();
const t0 = Date.now();
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  [" + detail + "]" : "")); ok ? pass++ : fail++; };
const post = (row) => fetch(BASE + "/telemetry", { method: "POST", headers: H, body: JSON.stringify(row) });
const data = () => fetch(BASE + "/obs/data", { headers: { cookie: COOKIE } }).then(r => r.json());
const rowsFor = (d, turn) => d.telemetry.filter(x => x.callSid === sid && x.turn === turn && !x.nr);
const nrFor = (d) => d.telemetry.filter(x => x.callSid === sid && x.nr);

// case 2+3: inject known values; duplicate POST must merge, not double; late playEnd must merge
const known = { callSid: sid, turn: 1, v: 1, sim: true, speechStartTs: t0, speechEndTs: t0 + 1500, sttRecvTs: t0 + 3200, llmFirstRecvTs: t0 + 3900, llmDoneRecvTs: t0 + 5400, playStartTs: t0 + 5600, ua: "validate-telemetry" };
check("inject turn row", (await post(known)).status === 200);
check("duplicate POST accepted", (await post(known)).status === 200);
let d = await data();
check("duplicate does not double-count", rowsFor(d, 1).length === 1, "rows=" + rowsFor(d, 1).length);
const late = await post({ callSid: sid, turn: 1, v: 1, sim: true, playEndTs: t0 + 30000 + 5600 });
check("late playEnd accepted", late.status === 200);
d = await data();
const r1 = rowsFor(d, 1)[0] || {};
check("late row merged into original turn", rowsFor(d, 1).length === 1 && r1.playEndTs === t0 + 35600, "playEndTs=" + r1.playEndTs);
check("known values intact after merge", r1.sttRecvTs === t0 + 3200 && r1.llmFirstRecvTs === t0 + 3900);

// case 4: nr episode dedupe by nrId
const nrId = "nrval" + Date.now().toString(36);
await post({ callSid: sid, turn: 0, nr: true, nrId, v: 1, sim: true, speechStartTs: t0, speechEndTs: t0 + 900 });
await post({ callSid: sid, turn: 0, nr: true, nrId, v: 1, sim: true, speechStartTs: t0, speechEndTs: t0 + 900 });
d = await data();
check("nr duplicate deduped by nrId", nrFor(d).length === 1, "nr rows=" + nrFor(d).length);

// case 5: bad row rejected + counted
const before = (await data()).teleStats || {};
const bad = await fetch(BASE + "/telemetry", { method: "POST", headers: H, body: JSON.stringify({ turn: 1 }) });
check("bad row -> 400", bad.status === 400);
const after = (await data()).teleStats || {};
const rejBefore = (before.edge_bad_row || 0) + (before.rejectBadRow || 0);
const rejAfter = (after.edge_bad_row || 0) + (after.rejectBadRow || 0);
check("reject counter +1", rejAfter === rejBefore + 1, rejBefore + "->" + rejAfter);

// case 6: health fields present
check("teleStats + build exposed", !!after && typeof after === "object" && typeof (await data()).build === "string");

// case 7: oversized payload -> 413
const big = await fetch(BASE + "/telemetry", { method: "POST", headers: H, body: JSON.stringify({ callSid: sid, turn: 2, ua: "x".repeat(5000) }) });
check("oversize -> 413", big.status === 413, "status=" + big.status);

console.log("\n" + pass + " passed, " + fail + " failed  (sim callSid " + sid + ", rows stay in sim partition)");
process.exit(fail ? 1 : 0);
