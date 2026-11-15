import { sessionOk } from './_lib.js';
// Persists round/interval-level browser network samples next to the matching Relay session
// (numbers only; no audio, no content, no secrets). Uses the existing /event channel and only
// attaches to a session that already exists with the same callSid, so it can never create a call row.
// It never touches the call gate, Twilio, or audio.
const num = (v, hi = 1e7) => (typeof v === "number" && isFinite(v) && v >= 0 && v < hi) ? Math.round(v * 10) / 10 : null;
const cnt = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9) ? v : null;
export async function onRequestPost({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const raw = await request.text();
  if (raw.length > 2000) return new Response("too large", { status: 413 });
  let t; try { t = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const id = (v) => String(v || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  const sessId = id(t && t.sessId), callSid = id(t && t.callSid);
  if (!sessId || !callSid) return new Response("bad ids", { status: 400 });
  const stub = env.METRICS.get(env.METRICS.idFromName("metrics-v1"));
  const list = await (await stub.fetch("https://m/sessions")).json().catch(() => null);
  const s0 = list && (list.sessions || []).find((x) => x.id === sessId);
  if (!s0 || s0.callSid !== callSid) return new Response("unknown session", { status: 404 });
  if ((s0.events || []).filter((e) => e.event === "browser_net").length >= 400) return new Response("limit", { status: 429 });
  const event = { event: "browser_net", callSid, ts: new Date().toISOString(), contentLogged: false,
    browserTs: num(t.browserTs, 4e12), inCallMs: num(t.inCallMs),
    edgeN: cnt(t.edgeN), edgeMinMs: num(t.edgeMinMs), edgeMedMs: num(t.edgeMedMs), edgeErr: cnt(t.edgeErr),
    cfTcpRttMs: num(t.cfTcpRttMs), busRttMs: num(t.busRttMs),
    clkOffsetMs: (typeof t.clkOffsetMs === "number" && isFinite(t.clkOffsetMs) && Math.abs(t.clkOffsetMs) < 6e5) ? Math.round(t.clkOffsetMs) : null,
    clkCalibrated: false,
    mediaRttMs: num(t.mediaRttMs), mediaRttN: cnt(t.mediaRttN),
    upJitterMs: num(t.upJitterMs), upLoss: num(t.upLoss, 1.0001), downJitterMs: num(t.downJitterMs), downLost: cnt(t.downLost),
    downJitterBufMs: num(t.downJitterBufMs), sentPackets: cnt(t.sentPackets) };
  await stub.fetch("https://m/event", { method: "POST", body: JSON.stringify({ sessId, event }) });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export async function onRequest() { return new Response("method not allowed", { status: 405 }); }
