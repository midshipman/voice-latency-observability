// Durable Object host for the voice latency observability app.
// The Pages project (pages/) binds CallGate, MetricsStore and LiveBus from this
// Worker through `script_name` in pages/wrangler.toml. This Worker serves no
// application routes: HTTP requests to it get a 404.
//
// - CallGate: single active call gate + per-call lease with heartbeats
// - MetricsStore: per-call event and telemetry storage (timings and event
//   metadata only: no audio, no transcript text)
// - LiveBus: replay buffer + fan-out of live events to the observability page

export default {
  async fetch() {
    return new Response("not found", { status: 404 });
  },
};

const CONTENT_LOG = false;
const CONTENT_FIELDS = ["prompt", "reply", "text", "utteranceUntilInterrupt", "raw"];
function scrubEvent(e) {
  if (!e || typeof e !== "object") return e;
  if (CONTENT_LOG) return e;
  const c = { ...e };
  if (c.event === "turn" && typeof c.prompt === "string") c.promptChars = c.prompt.length;
  for (const f of CONTENT_FIELDS) delete c[f];
  c.contentLogged = false;
  return c;
}

// ---------- ConversationRelay WebSocket session ----------
// ---------- Global call gate (Durable Object, free-plan SQLite backend) ----------
// Enforces: single active call globally + cumulative daily call-time cap.
// Both bounds fail closed; free-plan DO limits (100k req/day) are far above test use.
const LEASE_LAZY_MS = 12 * 60 * 1000; // upper bound for orphan charge accounting
// Lease liveness (fix approved 2026-10-21): an attached relay session
// heartbeats every HEARTBEAT_MS; the lease stays valid STALE_MS past the last
// heartbeat. A session that dies without releasing blocks new calls for at
// most STALE_MS instead of the old fixed 12-min window; a normal end releases
// immediately, so no healthy call ever waits.
const HEARTBEAT_MS = 30 * 1000;
const STALE_MS = 3 * HEARTBEAT_MS;

export class CallGate {
  constructor(state, env) {
    this.state = state;
    // Daily cumulative cap: 0 disables it (user decision 2026-10-21: removed
    // the daily 10-min cap for prototype testing; per-call timeout, idle
    // cleanup, single-call lock and auth stay in place).
    this.maxDayMs = Number(env.DAILY_CALL_CAP_MS || 10 * 60 * 1000);
  }
  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    let data = (await this.state.storage.get("gate")) || { holder: null, until: 0, acquiredAt: 0, lastBeat: 0, day: today, usedMs: 0 };
    if (data.day !== today) data = { holder: null, until: 0, acquiredAt: 0, lastBeat: 0, day: today, usedMs: 0 };
    if (url.pathname === "/acquire") {
      // Orphaned lease: fail closed with up to the lazy-expiry charge ONLY when a
      // relay session actually attached (real call died badly). A lease from a
      // TwiML fetch that never became a call used no telephony: charge 0.
      // Always persist the clearing so a stale holder cannot wedge the gate.
      if (data.holder && data.until <= now) {
        // Stale lease. Safety rule (2026-10-21): a bound callSid means a real
        // call once used this lease - never evict on missing heartbeats alone
        // (they can fail while the call is live). The worker verifies the
        // actual Twilio call status first, then uses /force-release.
        if (data.callSid) {
          return Response.json({ ok: false, reason: "stale_unverified", callSid: data.callSid }, { status: 409 });
        }
        if (data.attached) data.usedMs += Math.min(LEASE_LAZY_MS, Math.max(0, data.until - data.acquiredAt));
        data.holder = null; data.until = 0; data.acquiredAt = 0; data.lastBeat = 0; data.attached = false;
        await this.state.storage.put("gate", data);
      }
      if (data.holder && data.until > now) return Response.json({ ok: false, reason: "busy" }, { status: 409 });
      if (this.maxDayMs > 0 && data.usedMs >= this.maxDayMs) return Response.json({ ok: false, reason: "daily_cap", usedMs: data.usedMs, maxDayMs: this.maxDayMs }, { status: 429 });
      const lease = crypto.randomUUID();
      data.holder = lease; data.acquiredAt = now; data.lastBeat = 0; data.callSid = null;
      data.until = now + STALE_MS; // refreshed by /attach then by heartbeats
      await this.state.storage.put("gate", data);
      return Response.json({ ok: true, lease });
    }
    if (url.pathname === "/state") {
      return Response.json({ day: data.day, usedMs: data.usedMs, maxDayMs: this.maxDayMs,
        lastBeat: data.lastBeat || 0, callSid: data.callSid || null,
        active: !!(data.holder && data.until > now) });
    }
    if (url.pathname === "/attach" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (data.holder && data.holder === body.lease) {
        data.attached = true; data.lastBeat = now; data.until = now + STALE_MS;
        await this.state.storage.put("gate", data);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/bind" && request.method === "POST") {
      // Called by the relay session once the setup message supplies callSid.
      const body = await request.json().catch(() => ({}));
      if (data.holder && data.holder === body.lease && typeof body.callSid === "string") {
        data.callSid = body.callSid;
        await this.state.storage.put("gate", data);
        return Response.json({ ok: true });
      }
      return Response.json({ ok: false }, { status: 409 });
    }
    if (url.pathname === "/force-release" && request.method === "POST") {
      // Reachable only through worker routes that validated the caller
      // (Twilio-signed /call-status, or /voice after REST verification).
      // Bound to the stored callSid so it can never clear an unrelated call.
      const body = await request.json().catch(() => ({}));
      if (data.holder && typeof body.callSid === "string" && data.callSid === body.callSid) {
        if (data.attached) data.usedMs += Math.min(LEASE_LAZY_MS, Math.max(0, now - data.acquiredAt));
        data.holder = null; data.until = 0; data.acquiredAt = 0; data.lastBeat = 0; data.attached = false; data.callSid = null; data.callSid = null;
        await this.state.storage.put("gate", data);
        return Response.json({ ok: true, usedMs: data.usedMs });
      }
      return Response.json({ ok: false }, { status: 409 });
    }
    if (url.pathname === "/release" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (data.holder && data.holder === body.lease) {
        // Server-side accounting: from gate acquire (= TwiML request, i.e. call
        // start) to WS-session end, so pre-WS setup time is inside the budget.
        // No attachment = the call never connected: nothing was used.
        if (data.attached) data.usedMs += Math.min(LEASE_LAZY_MS, Math.max(0, now - data.acquiredAt));
        data.holder = null; data.until = 0; data.acquiredAt = 0; data.lastBeat = 0; data.attached = false; data.callSid = null;
        await this.state.storage.put("gate", data);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/heartbeat" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (data.holder && data.holder === body.lease && data.attached) {
        data.lastBeat = now; data.until = now + STALE_MS;
        await this.state.storage.put("gate", data);
        return Response.json({ ok: true });
      }
      return Response.json({ ok: false, reason: "no_lease" }, { status: 409 });
    }
    return new Response("not found", { status: 404 });
  }
}

// ---------- Live event bus (Durable Object, hibernation WebSocket fan-out) ----------
// Relay sessions publish stage events keyed by callSid; the browser call page
// subscribes for the real-time pipeline visualization. No content is published.

// Per-call telemetry ledger (additive): browser stamps tseq (1..n per call, one per send attempt) + self-reported reject/network-fail counters.
// Pure function so it can be tested; returns the updated map (newest 30 calls kept, 1000 seqs per call).
export function recordLedger(map, t, serverRejected) {
  const id = (v) => String(v || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  const n = (v, hi) => (Number.isInteger(v) && v >= 0 && v <= hi) ? v : null;
  const callSid = id(t && t.callSid); const tseq = n(t && t.tseq, 1e6);
  if (!callSid || !tseq || tseq < 1) return map;
  const bs = id(t.browserSessionId) || "";
  const key = callSid + "/" + bs;
  const e = map[key] || (map[key] = { callSid, bs, seqs: [], dup: 0, rejServer: 0, max: 0, trej: 0, tnet: 0, final: false, first: Date.now(), last: 0 });
  if (e.seqs.includes(tseq)) e.dup++; else if (e.seqs.length < 1000) e.seqs.push(tseq);
  if (serverRejected) e.rejServer++;
  e.max = Math.max(e.max, tseq);
  const rj = n(t.trej, 1e6), nt = n(t.tnet, 1e6);
  if (rj != null) e.trej = Math.max(e.trej, rj); if (nt != null) e.tnet = Math.max(e.tnet, nt);
  if (t.tfinal === true) e.final = true;
  e.last = Date.now();
  const keys = Object.keys(map); if (keys.length > 30) keys.sort((a, b) => map[a].last - map[b].last).slice(0, keys.length - 30).forEach((k) => delete map[k]);
  return map;
}
export class LiveBus {
  constructor(state, env) { this.state = state; this.buf = new Map(); }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/pubs" && request.method === "POST") { // v5y: batch of publishes in one DO call
      let arr = []; try { arr = JSON.parse(await request.text()); } catch {}
      for (const o of Array.isArray(arr) ? arr : []) this.publish(JSON.stringify(o));
      return Response.json({ ok: true, n: Array.isArray(arr) ? arr.length : 0 });
    }
    if (url.pathname === "/pub" && request.method === "POST") {
      this.publish(await request.text());
      return Response.json({ ok: true });
    }
    if (url.pathname === "/sub") {
      const callSid = url.searchParams.get("callSid") || "";
      if (!callSid) return new Response("missing callSid", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ callSid });
      const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;
      for (const b of (this.buf.get(callSid) || [])) { try { const o = JSON.parse(b); if (!(o.pseq > after)) continue; o.replay = true; pair[1].send(JSON.stringify(o)); } catch {} }
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("not found", { status: 404 });
  }
  publish(body) {
    let callSid = null;
    try { callSid = JSON.parse(body).callSid || null; } catch {}
    if (callSid) { const l = this.buf.get(callSid) || []; l.push(body); if (l.length > 400) l.shift(); this.buf.set(callSid, l); if (this.buf.size > 12) this.buf.delete(this.buf.keys().next().value); }
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.callSid === callSid) { try { ws.send(body); } catch {} }
    }
  }
  async webSocketMessage(ws, message) {
    // clock-sync ping: browser measures WS round-trip; the stamped pong lets the
    // page estimate its offset from the platform clock (min-RTT sample, declared
    // approximation assuming symmetric paths - used for display only).
    try {
      const m = JSON.parse(String(message));
      if (m && m.type === "ping" && typeof m.c === "number") {
        ws.send(JSON.stringify({ type: "pong", c: m.c, s: Date.now() }));
      }
    } catch {}
  }
  async webSocketClose(ws) { /* hibernation handles cleanup */ }
  async webSocketError(ws, error) { /* hibernation handles cleanup */ }
}

// ---------- Metrics store (Durable Object, free-plan SQLite backend) ----------
// Keeps the last 50 Relay sessions with their full event timelines for /obs.
export const WORKER_BUILD = "en-1.0.0";

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
export class MetricsStore {
  constructor(state, env) { this.state = state; this.env = env; }
  // v5y: one storage key per session ("s:<id>") plus an id index ("sidx", newest first).
  // The old single "sessions" value grew past the 2 MiB per-value limit (real call
  // CA53b17..., 2026-11-03): put() then threw, every later /event and /finish was dropped
  // silently. Legacy value is migrated once and deleted.
  async migrate() {
    const legacy = await this.state.storage.get("sessions");
    if (!legacy) return;
    const idx = (await this.state.storage.get("sidx")) || [];
    for (const s of legacy) { await this.state.storage.put("s:" + s.id, s); if (!idx.includes(s.id)) idx.push(s.id); }
    await this.state.storage.put("sidx", idx.slice(0, 50));
    await this.state.storage.delete("sessions");
  }
  async loadOne(id) { const s = await this.state.storage.get("s:" + id); if (s) s.events = (s.events || []).map(scrubEvent); return s; }
  async loadAll() {
    await this.migrate();
    const idx = (await this.state.storage.get("sidx")) || [];
    const out = [];
    for (const id of idx) { const s = await this.loadOne(id); if (s) out.push(s); }
    return out;
  }
  async saveOne(s) {
    const idx = (await this.state.storage.get("sidx")) || [];
    if (!idx.includes(s.id)) {
      idx.unshift(s.id);
      for (const old of idx.splice(50)) await this.state.storage.delete("s:" + old);
      await this.state.storage.put("sidx", idx);
    }
    await this.state.storage.put("s:" + s.id, s);
  }
  async countFail(kind, err) {
    try { const st = (await this.state.storage.get("teleStats")) || {}; st[kind] = (st[kind] || 0) + 1; st.lastStoreError = String(err).slice(0, 160); await this.state.storage.put("teleStats", st); } catch {}
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/sdk-event' && request.method === 'POST') {
      const row = sdkRow(await request.json().catch(()=>null));
      if (!row) return new Response('bad sdk event',{status:400});
      const events = await this.state.storage.get('sdkEvents') || [];
      if (!events.some(e => e.callSid===row.callSid && e.browserSessionId===row.browserSessionId && e.eventSeq===row.eventSeq)) events.push(row);
      await this.state.storage.put('sdkEvents', events.slice(-5000));
      return Response.json({ok:true});
    }
    if (url.pathname === "/event" && request.method === "POST") {
      const { sessId, event } = await request.json();
      try {
        await this.migrate();
        let s0 = await this.loadOne(sessId);
        if (!s0) s0 = { id: sessId, start: event.ts, callSid: null, events: [] };
        if (event.event === "setup" && event.callSid) s0.callSid = event.callSid;
        s0.events.push(event);
        await this.saveOne(s0);
        return Response.json({ ok: true });
      } catch (err) { await this.countFail("eventStoreFail", err); return new Response("store_failed", { status: 500 }); }
    }
    if (url.pathname === "/events" && request.method === "POST") { // v5y: batch of events (+ optional end record) in one DO call
      try {
        const { sessId, events, end } = await request.json();
        await this.migrate();
        let s0 = await this.loadOne(sessId);
        if (!s0 && !(events && events.length)) return Response.json({ ok: true });
        if (!s0) s0 = { id: sessId, start: events[0].ts, callSid: null, events: [] };
        for (const event of events || []) { if (event.event === "setup" && event.callSid) s0.callSid = event.callSid; s0.events.push(event); }
        if (end) s0.end = end;
        await this.saveOne(s0);
        return Response.json({ ok: true });
      } catch (err) { await this.countFail("eventStoreFail", err); return new Response("store_failed", { status: 500 }); }
    }
    if (url.pathname === "/finish" && request.method === "POST") {
      const { sessId, end } = await request.json();
      try {
        await this.migrate();
        const s0 = await this.loadOne(sessId);
        if (s0) { s0.end = end; await this.saveOne(s0); }
        return Response.json({ ok: true });
      } catch (err) { await this.countFail("eventStoreFail", err); return new Response("store_failed", { status: 500 }); }
    }
    if (url.pathname === "/eval/begin" && request.method === "POST") {
      // Atomic rate guard: one eval run per 60s globally (DO is single-threaded).
      const now = Date.now();
      const last = (await this.state.storage.get("evalBegin")) || 0;
      if (now - last < 60000) return new Response("rate_limited", { status: 429 });
      await this.state.storage.put("evalBegin", now);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/eval" && request.method === "POST") {
      const { run } = await request.json();
      const evals = (await this.state.storage.get("evals")) || [];
      evals.unshift(run);
      await this.state.storage.put("evals", evals.slice(0, 20));
      return Response.json({ ok: true });
    }
    if (url.pathname === "/telemetry/edge-reject" && request.method === "POST") {
      // Pages edge counts its own rejects here (metadata-only reason codes).
      const b = await request.json().catch(() => null);
      const reason = (b && typeof b.reason === "string" ? b.reason : "unknown").replace(/[^a-z_]/g, "").slice(0, 20) || "unknown";
      const st = (await this.state.storage.get("teleStats")) || {};
      st["edge_" + reason] = (st["edge_" + reason] || 0) + 1;
      await this.state.storage.put("teleStats", st);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/telemetry" && request.method === "POST") {
      // Browser-side per-turn timing metadata (numbers + flags + short ids/UA only, no content).
      const num = (v, hi) => (typeof v === "number" && isFinite(v) && v >= 0 && v < (hi || 4e12)) ? Math.round(v) : null;
      const st = (await this.state.storage.get("teleStats")) || {};
      const t = await request.json().catch(() => null);
      if (!t || typeof t !== "object") {
        st.rejectBadJson = (st.rejectBadJson || 0) + 1;
        await this.state.storage.put("teleStats", st);
        return new Response("bad json", { status: 400 });
      }
      const row = {
        v: num(t.v, 100),
        callSid: String(t.callSid || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64),
        turn: Math.min(500, Math.max(0, Math.floor(Number(t.turn) || 0))), sim: !!t.sim,
        speechStartTs: num(t.speechStartTs), speechEndTs: num(t.speechEndTs), sttRecvTs: num(t.sttRecvTs),
        nr: !!t.nr,
        nrId: String(t.nrId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || null,
        lateAfterNr: t.lateAfterNr ? true : null,
        failedSends: num(t.failedSends, 1e6),
        llmFirstRecvTs: num(t.llmFirstRecvTs), llmDoneRecvTs: num(t.llmDoneRecvTs),
        playStartTs: num(t.playStartTs), playEndTs: num(t.playEndTs), playEpisodes: num(t.playEpisodes, 100), playEndClear: !!t.playEndClear, playAssocCandidate: !!t.playAssocCandidate,
        speechSharedWithPrev: !!t.speechSharedWithPrev, speechUnassociated: !!t.speechUnassociated,
        interrupted: !!t.interrupted,
        residual: !!t.residual,
        orphanPlayEnd: !!t.orphanPlayEnd,
        stalled: !!t.stalled,
        stallLastEventTs: num(t.stallLastEventTs),
        ua: String(t.ua || "").slice(0, 120),
        srvSpeakerOffTs: num(t.srvSpeakerOffTs), srvSttDoneTs: num(t.srvSttDoneTs),
        srvLlmFirstTs: num(t.srvLlmFirstTs), srvTokensPlayedTs: num(t.srvTokensPlayedTs),
        clkOffsetMs: typeof t.clkOffsetMs === 'number' && isFinite(t.clkOffsetMs) && Math.abs(t.clkOffsetMs) < 6e5 ? Math.round(t.clkOffsetMs) : null,
        clkRttMs: num(t.clkRttMs, 1e6),
        rtcRttMs: num(t.rtcRttMs, 1e6), rtcJitterMs: num(t.rtcJitterMs, 1e6),
        rtcLostPkts: num(t.rtcLostPkts, 1e9), rtcMosX100: num(t.rtcMosX100, 1e6),
        rtcCodec: String(t.rtcCodec || '').replace(/[^A-Za-z0-9/-]/g, '').slice(0, 24) || null,
        browserSessionId: String(t.browserSessionId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0,64) || null,
        pageBuild: String(t.pageBuild || '').slice(0,64) || null,
        recvAt: new Date().toISOString(),
      };
      if (!row.callSid || (!row.turn && !row.nr)) {
        st.rejectBadRow = (st.rejectBadRow || 0) + 1;
        await this.state.storage.put("teleStats", st);
        try { const lg = recordLedger((await this.state.storage.get("teleLedger")) || {}, t, true); await this.state.storage.put("teleLedger", lg); } catch {}
        return new Response("bad row", { status: 400 });
      }
      const tl = (await this.state.storage.get("telemetry")) || [];
      // turn rows: one row per (callSid, turn), latest write merges non-null fields
      // nr rows: one row per (callSid, nrId); nr without nrId (legacy client) always appends
      let i = -1, outcome = "appended";
      if (row.nr && row.nrId) {
        i = tl.findIndex(x => x.nr && x.callSid === row.callSid && x.nrId === row.nrId);
        if (i >= 0) outcome = "nrDeduped";
      } else if (!row.nr) {
        i = tl.findIndex(x => x.callSid === row.callSid && x.turn === row.turn && !x.nr && (!row.browserSessionId || !x.browserSessionId || x.browserSessionId === row.browserSessionId));
        if (i >= 0) outcome = "merged";
      } else outcome = "nrAppended";
      if (i >= 0) {
        const merged = { ...tl[i] };
        for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined) merged[k] = v;
        if (row.playEndClear) delete merged.playEndTs; // explicit field clear: a newer playback episode supersedes the old pair
        tl[i] = merged;
      } else tl.push(row);
      st.accepted = (st.accepted || 0) + 1;
      st[outcome] = (st[outcome] || 0) + 1;
      try { const lg = recordLedger((await this.state.storage.get("teleLedger")) || {}, t, false); await this.state.storage.put("teleLedger", lg); } catch {}
      await this.state.storage.put("telemetry", tl.slice(-600));
      await this.state.storage.put("teleStats", st);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/sessions") {
      const list = await this.loadAll();
      const evals = (await this.state.storage.get("evals")) || [];
      const telemetry = (await this.state.storage.get("telemetry")) || [];
      const teleStats = (await this.state.storage.get("teleStats")) || {};
      return Response.json({ sessions: list, evals, telemetry, teleStats, teleLedger: (await this.state.storage.get('teleLedger')) || {}, sdkEvents: (await this.state.storage.get('sdkEvents')) || [], build: WORKER_BUILD });
    }
    return new Response("not found", { status: 404 });
  }
}
