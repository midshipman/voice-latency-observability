import { sessionOk } from './_lib.js';
function sdkRow(t) {
  const e = t && t.sdkEvent;
  const allowed = ['connect_requested','media_requested','media_resolved','media_failed','track_attach_start','track_attached','track_attach_failed','call_accepted','call_disconnected','outbound_sample'];
  if (!e || !allowed.includes(e.event)) return null;
  const id = v => String(v || '').replace(/[^A-Za-z0-9-]/g,'').slice(0,64);
  const n = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 4e12 ? v : null;
  const row = { event:e.event, callSid:id(e.callSid), browserSessionId:id(e.browserSessionId), eventSeq:n(e.eventSeq), browserTs:n(e.browserTs), browserMonoMs:n(e.browserMonoMs), clockDomain:'browser', sim:!!t.sim, pageBuild:String(t.pageBuild || '').slice(0,64) };
  if (!row.callSid || !row.browserSessionId || !Number.isInteger(row.eventSeq) || row.eventSeq < 1 || row.browserTs == null || row.browserMonoMs == null) return null;
  for (const key of ['sdkStatsTs','sampleWindowMs','packetsSent','bytesSent','totalPacketsSent','totalBytesSent','audioTrackCount']) row[key] = n(e[key]);
  return row;
}
const num = (v, hi) => (typeof v === "number" && isFinite(v) && v >= 0 && v < (hi || 4e12)) ? Math.round(v) : null;
async function edgeReject(env, reason) {
  try {
    const stub = env.METRICS.get(env.METRICS.idFromName("metrics-v1"));
    await stub.fetch("https://m/telemetry/edge-reject", { method: "POST", body: JSON.stringify({ reason }) });
  } catch {}
}
export async function onRequestPost({ request, env }) {
  if (!(await sessionOk(request, env))) { await edgeReject(env, "forbidden"); return new Response("forbidden", { status: 403 }); }
  const raw = await request.text();
  if (raw.length > 4000) { await edgeReject(env, "too_large"); return new Response("too large", { status: 413 }); }
  let t; try { t = JSON.parse(raw); } catch { await edgeReject(env, "bad_json"); return new Response("bad json", { status: 400 }); }
  if (!t || typeof t !== "object") { await edgeReject(env, "bad_json"); return new Response("bad json", { status: 400 }); }
  if (t.sdkEvent) {
    const row = sdkRow(t);
    if (!row) return new Response('bad sdk event', {status:400});
    const stub = env.METRICS.get(env.METRICS.idFromName('metrics-v1'));
    const res = await stub.fetch('https://m/sdk-event', {method:'POST',body:JSON.stringify({sdkEvent:row,sim:row.sim,pageBuild:row.pageBuild})});
    return new Response(await res.text(), {status:res.status,headers:{'content-type':'application/json'}});
  }
  // metadata-only schema: numbers + flags + short ids/UA; anything else is dropped here
  const row = {
    v: num(t.v, 100),
    browserSessionId: String(t.browserSessionId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0,64) || undefined,
    pageBuild: String(t.pageBuild || '').slice(0,64) || undefined,
    callSid: String(t.callSid || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64),
    turn: Math.min(500, Math.max(0, Math.floor(Number(t.turn) || 0))),
    sim: !!t.sim,
    speechStartTs: num(t.speechStartTs), speechEndTs: num(t.speechEndTs), sttRecvTs: num(t.sttRecvTs),
    nr: !!t.nr,
    nrId: String(t.nrId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || undefined,
    lateAfterNr: t.lateAfterNr ? true : undefined,
    failedSends: num(t.failedSends, 1e6),
    llmFirstRecvTs: num(t.llmFirstRecvTs), llmDoneRecvTs: num(t.llmDoneRecvTs),
    playStartTs: num(t.playStartTs), playEndTs: num(t.playEndTs), playEpisodes: num(t.playEpisodes, 100), playEndClear: t.playEndClear ? true : undefined, playAssocCandidate: t.playAssocCandidate ? true : undefined,
    speechSharedWithPrev: t.speechSharedWithPrev ? true : undefined, speechUnassociated: t.speechUnassociated ? true : undefined,
    interrupted: !!t.interrupted,
    residual: !!t.residual,
    orphanPlayEnd: !!t.orphanPlayEnd,
    stalled: !!t.stalled,
    stallLastEventTs: num(t.stallLastEventTs),
    // fine-grained attribution fields (obs2): server-clock stamps relayed by the
    // browser, clock-sync estimate (signed!), and Voice SDK network samples
    srvSpeakerOffTs: num(t.srvSpeakerOffTs), srvSttDoneTs: num(t.srvSttDoneTs),
    srvLlmFirstTs: num(t.srvLlmFirstTs), srvTokensPlayedTs: num(t.srvTokensPlayedTs),
    clkOffsetMs: (typeof t.clkOffsetMs === "number" && isFinite(t.clkOffsetMs) && Math.abs(t.clkOffsetMs) < 6e5) ? Math.round(t.clkOffsetMs) : null,
    clkRttMs: num(t.clkRttMs, 1e6),
    rtcRttMs: num(t.rtcRttMs, 1e6), rtcJitterMs: num(t.rtcJitterMs, 1e6),
    rtcLostPkts: num(t.rtcLostPkts, 1e9), rtcMosX100: num(t.rtcMosX100, 1e6),
    rtcCodec: String(t.rtcCodec || "").replace(/[^A-Za-z0-9/-]/g, "").slice(0, 24) || undefined,
    ua: String(t.ua || "").slice(0, 120),
    tseq: Number.isInteger(t.tseq) && t.tseq >= 1 && t.tseq <= 1e6 ? t.tseq : undefined,
    trej: Number.isInteger(t.trej) && t.trej >= 0 && t.trej <= 1e6 ? t.trej : undefined,
    tnet: Number.isInteger(t.tnet) && t.tnet >= 0 && t.tnet <= 1e6 ? t.tnet : undefined,
    tfinal: t.tfinal === true ? true : undefined,
  };
  if (!row.callSid || (!row.turn && !row.nr)) { await edgeReject(env, "bad_row"); return new Response("bad row", { status: 400 }); }
  const metricsStub = env.METRICS.get(env.METRICS.idFromName("metrics-v1"));
  const r = await metricsStub.fetch("https://m/telemetry", { method: "POST", body: JSON.stringify(row) });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}
export async function onRequest() { return new Response("method not allowed", { status: 405 }); }
