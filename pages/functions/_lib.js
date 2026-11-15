// Shared library for Pages Functions (ported from the original single-Worker prototype).
export const RELAY_LANG = "en-US";
export const MAX_CALL_MS = 10 * 60 * 1000;

export async function mintAccessToken(env, identity) {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${env.TWILIO_API_KEY_SID}-${now}`,
    iss: env.TWILIO_API_KEY_SID,
    sub: env.TWILIO_ACCOUNT_SID,
    exp: now + 3600,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: env.TWILIO_TWIML_APP_SID },
      },
    },
  };
  const b64 = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const data = `${b64(header)}.${b64(payload)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.TWILIO_API_KEY_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${data}.${sigB64}`;
}


export async function validTwilioSignature(request, authToken) {
  const sig = request.headers.get("X-Twilio-Signature");
  if (!sig) return false;
  const url = new URL(request.url);
  let data = url.origin + url.pathname;
  // Twilio spec: full URL (query string included if any), then sorted POST form params name+value.
  const params = [];
  for (const [k, v] of url.searchParams.entries()) params.push([k, v]);
  const ct = request.headers.get("content-type") || "";
  if (request.method === "POST" && ct.includes("application/x-www-form-urlencoded")) {
    const form = await request.clone().formData();
    for (const [k, v] of form.entries()) params.push([k, String(v)]);
  }
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [k, v] of params) data += k + v;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(raw))) === sig;
}


export function conversationRelayTwiML(host, wsToken, lease, partialPrompts = true) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Connect><ConversationRelay url="wss://${host}/ws?tk=${encodeURIComponent(wsToken)}&amp;lease=${encodeURIComponent(lease || "")}"
  language="${RELAY_LANG}" transcriptionProvider="Deepgram" speechModel="nova-3-general"
  ttsProvider="ElevenLabs" events="speaker-events tokens-played config-updated" partialPrompts="${partialPrompts === false ? 'false' : 'true'}"
  interruptible="speech" welcomeGreeting="Hello, this is the voice prototype. Go ahead." />
</Connect></Response>`;
}

// Polite in-call reject (no Relay session is started). The reason selects an
// accurate message instead of one misleading catch-all.
export function rejectTwiML(reason) {
  const msg = reason === "daily_cap"
    ? "The test time for today is used up. Please come back tomorrow."
    : reason === "busy"
      ? "A call is already in progress. Please try again later."
      : "Testing is not open yet. Please try again later.";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="en-US">${msg}</Say><Hangup/></Response>`;
}

// Model labeling: what actually serves a call. STT/TTS come from the
// ConversationRelay TwiML below (Deepgram nova-3-general / ElevenLabs).
// The ElevenLabs model and voice are NOT specified in the TwiML, so the
// provider default serves — labeled as such, never guessed.
export function modelsInfo(env) {
  return {
    stt: "Deepgram nova-3-general",
    llm: String(env.LLM_MODEL || "not set"),
    tts: "ElevenLabs",
    ttsVoice: "not explicitly configured · provider default (voice ID not recorded)",
    ttsModel: "not configurable in ConversationRelay · provider default",
  };
}


// Conversation history for the LLM. A user line is recorded the moment its final
// transcript arrives (call order). A reply is inserted right after its own user
// line when (and only if) it completed, so out-of-order completion and cancelled
// turns (empty reply) no longer leave empty assistant messages or misordered lines.
export function historyAddUser(history, text) { const m = { role: "user", content: String(text || "") }; history.push(m); return m; }
export function historyAddReply(history, userMsg, reply) {
  if (!reply) return false;
  const i = history.indexOf(userMsg);
  const a = { role: "assistant", content: reply };
  if (i < 0) history.push(a); else history.splice(i + 1, 0, a);
  return true;
}

export async function* streamLLM(env, history, prompt, model, observe = () => {}) {
  const payload = {
    stream: true,
    messages: [{ role: "system", content: env.SYSTEM_PROMPT }, ...history, { role: "user", content: prompt }],
  };
  observe('llm_request_start'); // immediately before invoking the owned API boundary
  const res = await env.AI.run(model || env.LLM_MODEL, payload);
  observe('llm_response_stream_received'); // stream handle, not first text/audio
  const reader = res.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      if (t === "data: [DONE]") return;
      try { const d = JSON.parse(t.slice(5)); const c = d.response ?? d.choices?.[0]?.delta?.content;
        if (typeof c === "string" && c) yield c;
        else if (c) yield { nonStringChunk: true, kind: typeof c }; } catch {}
    }
  }
  } finally { try { await reader.cancel(); } catch {} } // consumer stopped early (turn cancelled): release the model stream
}


export const EVAL_SET_VERSION = "v1";
export const EVAL_PROMPTS = [
  { id: "greet",   q: "Hello, tell me about yourself" },
  { id: "time",    q: "What time is it now?" },
  { id: "math",    q: "What is 17 plus 28?" },
  { id: "open",    q: "Tell me about the history of the Berlin Wall" },
  { id: "unclear", q: "What should I do about that thing?" },
  { id: "weather", q: "How is the weather in Berlin today?" },
];


export const CONTENT_LOG = false;
export const CONTENT_FIELDS = ["prompt", "reply", "text", "utteranceUntilInterrupt", "raw"];
export function scrubEvent(e) {
  if (!e || typeof e !== "object") return e;
  if (CONTENT_LOG) return e;
  const c = { ...e };
  if (c.event === "turn" && typeof c.prompt === "string") c.promptChars = c.prompt.length;
  for (const f of CONTENT_FIELDS) delete c[f];
  c.contentLogged = false;
  return c;
}


// Twilio error messages carry the code only inside the description text
// ("... code: 64107, type: config ..."). Per the official error table, these
// codes end the session; 64107/64111/64112 do not; 64106 depends.
const RELAY_ENDS_SESSION = new Set([64101, 64102, 64103, 64104, 64105, 64108, 64109, 64110]);
const RELAY_KEEPS_SESSION = new Set([64107, 64111, 64112]);
export function classifyRelayError(description) {
  const m = /\b(64\d{3})\b/.exec(String(description || ""));
  const code = m ? Number(m[1]) : null;
  const endsSession = code == null ? null : RELAY_ENDS_SESSION.has(code) ? true : RELAY_KEEPS_SESSION.has(code) ? false : null;
  return { code, endsSession };
}
// Scalar-only snapshot of an info/configUpdated payload: key -> short scalar,
// no free text. Keys come from Twilio; values longer than 40 chars are dropped.
export function configSnapshot(v) {
  const out = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue;
    if (typeof x === "boolean" || typeof x === "number") out[k] = x;
    else if (typeof x === "string" && x.length <= 40) out[k] = x;
    else if (x && typeof x === "object") out[k] = Array.isArray(x) ? "array" : "object";
  }
  return out;
}

export function handleRelaySession(ws, env, ctx, gateStub, metricsStub, liveStub, lease, netInfo) {
  ws.accept();
  const MODELS = modelsInfo(env);
  // v5y: the /ws invocation is ONE Workers invocation; the free plan allows 1,000 subrequests to internal services (DO calls) per invocation
  // (developers.cloudflare.com/workers/platform/limits, "Subrequests"). Until v5x every rec() and every pub() was its own DO call, so a ~90-150 s
  // call hit the cap: later records, live events, finish and gate release all failed silently. Now: batched, counted, budget-guarded.
  const SUB_SOFT = Number(env && env.SUB_SOFT) || 600, SUB_HARD = Number(env && env.SUB_HARD) || 900; // hard leaves ~100 calls for finish/release/call_end (env override: tests only)
  let pubDue = 0, subCount = 0, subDropped = 0, subBy = { gateAttach: 0, gateBind: 0, gateRelease: 0, metricsBatch: 0, livePubs: 0 }, recBy = {}, pubBy = {}, agg = { chunkEventsSkipped: 0, partialsSkipped: 0 }, recBuf = [], recTimer = null, pubBuf = [], pubTimer = null, subDegraded = false;
  const att = (subCount++, subBy.gateAttach++, gateStub.fetch("https://gate/attach", { method: "POST", body: JSON.stringify({ lease }) })
    .catch((e) => console.error("gate attach error", String(e))));
  if (ctx && ctx.waitUntil) ctx.waitUntil(att);
  let lastActivity = Date.now();
  const idleTimer = setInterval(() => {
    if (sess.over) return;
    if (Date.now() - lastActivity > 120000) {
      rec({ event: "ws_idle_timeout", callSid: sess.callSid, turns: sess.turn,
            idleMs: Date.now() - lastActivity });
      finish();
      try { ws.close(1000, "idle"); } catch {}
    }
  }, 30000);
  const sess = { id: crypto.randomUUID(), callSid: null, callStart: Date.now(), turn: 0, history: [], metrics: [], over: false,
    pendingSpeakerOff: null, tokensPlayedFirst: null, relaySessionId: null, relaySeq: 0, partials: 0, pubSeq: 0, pubFailed: 0 };
  const relayTag = () => ({ source: "relay-realtime", evidence: "E2", clockDomain: "server", relaySeq: ++sess.relaySeq, sessionId: sess.relaySessionId || undefined });
  const flushPartials = () => {
    const pa = sess.pAgg; if (!pa) return; sess.pAgg = null;
    rec({ event: "partial_summary", callSid: sess.callSid, source: "relay-realtime", evidence: "E2", clockDomain: "server", sessionId: sess.relaySessionId || undefined, association: "call_only", count: pa.n, firstSeq: pa.firstSeq, lastSeq: pa.lastSeq, firstRelaySeq: pa.firstRelaySeq, lastRelaySeq: pa.lastRelaySeq,
      firstReceivedAt: pa.firstAt, lastReceivedAt: pa.lastAt, minChars: pa.minChars, maxChars: pa.maxChars, lastChars: pa.lastChars });
  };
  const finish = () => {
    if (sess.over) return;
    sess.over = true; clearTimeout(capTimer); clearInterval(idleTimer);
    subCount++; subBy.gateRelease++;
    flushPartials();
    const rel = gateStub.fetch("https://gate/release", { method: "POST", body: JSON.stringify({ lease }) })
      .catch((e) => console.error("gate release error", String(e)));
    pub({ type: "call_end", turns: sess.turn, ms: Date.now() - sess.callStart }, true);
    flushPub();
    // last metrics batch carries the end record: one call instead of event + finish
    const fin = flushRec({ ts: new Date().toISOString(), callDurationMs: Date.now() - sess.callStart, turns: sess.turn,
      subrequests: subCount + 1, subrequestDropped: subDropped, subrequestDegraded: subDegraded,
      subrequestsByPurpose: { ...subBy, metricsBatch: subBy.metricsBatch + 1 }, recordedEventsByType: recBy, publishedByType: pubBy, aggregated: agg });
    if (ctx && ctx.waitUntil) ctx.waitUntil(Promise.all([rel, fin]));
  };
  const flushRec = (end) => {
    clearTimeout(recTimer); recTimer = null;
    if (!recBuf.length && !end) return Promise.resolve();
    const batch = recBuf; recBuf = []; subCount++; subBy.metricsBatch++;
    return metricsStub.fetch("https://m/events", { method: "POST", body: JSON.stringify({ sessId: sess.id, events: batch, end: end || undefined }) })
      .then((r) => { if (r && r.ok === false) console.error("metrics batch store failed", r.status, batch.length); })
      .catch((e) => console.error("metrics batch error", String(e)));
  };
  const rec = (r0) => {
    r0.ts = new Date().toISOString();
    const r = scrubEvent(r0);
    sess.metrics.push(r); console.log(JSON.stringify(r));
    { const k = r.event === 'boundary' ? 'boundary:' + r.boundary : r.event; recBy[k] = (recBy[k] || 0) + 1; }
    if (subCount >= SUB_HARD && !sess.over) { subDropped++; return; }
    recBuf.push(r);
    if (!recTimer && !sess.over) { recTimer = setTimeout(() => { const f = flushRec(); if (ctx && ctx.waitUntil) ctx.waitUntil(f); }, subCount >= SUB_SOFT ? 10000 : 4000); }
  };
  const send = (o) => { if (!sess.over) ws.send(JSON.stringify(o)); };
  const flushPub = () => {
    clearTimeout(pubTimer); pubTimer = null;
    if (!pubBuf.length) return;
    const batch = pubBuf; pubBuf = []; subCount++; subBy.livePubs++;
    const p = liveStub.fetch("https://lb/pubs", { method: "POST", body: JSON.stringify(batch) })
      .then((r) => { if (r && r.ok === false) sess.pubFailed += batch.length; })
      .catch((e) => { sess.pubFailed += batch.length; console.error("live pub error", String(e)); });
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  };
  const pub = (o, final) => {
    if (!liveStub || !sess.callSid) return;
    // degraded mode (>= SUB_SOFT calls used): partial-transcript pings are not published; they were the most frequent live message
    if (!final && subCount >= SUB_SOFT) { if (!subDegraded) { subDegraded = true; rec({ event: "subrequest_budget_degraded", callSid: sess.callSid, used: subCount }); } if (o.type === "partial") { subDropped++; return; } }
    if (!final && subCount >= SUB_HARD) { subDropped++; return; }
    pubBy[o.type] = (pubBy[o.type] || 0) + 1;
    o.callSid = sess.callSid; o.ts = Date.now();
    o.pseq = ++sess.pubSeq; // per-call source sequence for Worker->/live->page reconciliation (counts attempted publishes)
    if (o.type === "call_end") { o.pubTotal = sess.pubSeq; o.pubFailed = sess.pubFailed; o.subreq = subCount + 3; o.subDropped = subDropped; }
    pubBuf.push(o);
    // one DO call per window; each message keeps its own server timestamp and pseq. Partial-transcript pings are only a "receiving" indicator: 500 ms window.
    // Everything else 100 ms (400 ms when degraded). A non-partial message pulls an already-armed partial window in to 100 ms. Display delay is at most that; event timestamps are stamped at the source.
    const delay = o.type === "partial" ? 500 : (subCount >= SUB_SOFT ? 400 : 100);
    if (!pubTimer) { pubDue = Date.now() + delay; pubTimer = setTimeout(flushPub, delay); }
    else if (Date.now() + delay < pubDue) { clearTimeout(pubTimer); pubDue = Date.now() + delay; pubTimer = setTimeout(flushPub, delay); }
  };

  // speaker-events / tokens-played payloads are not fully documented publicly
  // (Twilio TwiML noun doc names the events clientSpeaking/agentSpeaking and the
  // tokens-played stream but gives no JSON schema). Parse defensively and keep a
  // verbatim raw copy in the event log for shape verification on real traffic.
  const speakerInfo = (m) => {
    const name = String(m.name ?? m.event ?? m.speaker ?? m.type ?? "");
    if (!/speak/i.test(name)) return null;
    const who = /agent/i.test(name) ? "agent" : (/client/i.test(name) ? "client" : null);
    if (!who) return null;
    const v = m.value ?? m.state ?? m.speaking ?? m.active;
    let on = null;
    if (typeof v === "boolean") on = v;
    else if (v != null) on = /^(on|start|started|speaking|true|active)$/i.test(String(v));
    return { who, on };
  };
  const isTokensPlayed = (m) =>
    /tokens[-_ ]?played/i.test(String(m.type ?? "")) || /tokens[-_ ]?played/i.test(String(m.name ?? ""));

  // 10-minute hard cap per call.
  const capTimer = setTimeout(() => {
    if (sess.over) return;
    rec({ event: "call_cap_reached", callSid: sess.callSid, capMs: MAX_CALL_MS });
    try {
      send({ type: "text", token: "The test time limit was reached, hanging up now.", last: true });
      send({ type: "end" });
    } catch {}
    finish();
    try { ws.close(1000, "cap"); } catch {}
  }, MAX_CALL_MS);

  ws.addEventListener("message", async (ev) => {
    const tRecv = Date.now(), tRecvMono = performance.now();
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    lastActivity = tRecv;
    try {
      switch (msg.type) {
        case "setup":
          sess.callSid = msg.callSid;
          // bind the call to the lease so a Twilio-signed /call-status can release it as the backstop
          { subCount++; subBy.gateBind++; const bp = gateStub.fetch("https://gate/bind", { method: "POST", body: JSON.stringify({ lease, callSid: msg.callSid }) }).catch((e) => console.error("gate bind error", String(e)));
            if (ctx && ctx.waitUntil) ctx.waitUntil(bp); }
          sess.relaySessionId = /^[A-Za-z0-9]{10,40}$/.test(String(msg.sessionId || "")) ? msg.sessionId : null;
          rec({ event: "setup", callSid: msg.callSid, sessionId: sess.relaySessionId || undefined, from: msg.from, to: msg.to, models: MODELS,
                setupKeys: Object.keys(msg).filter(k => /^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(k)).sort(), connectionType: typeof msg.connectionType === "string" ? msg.connectionType.slice(0, 12) : undefined });
          pub({ type: "call_start" });
          if (netInfo) {
            // Twilio -> Cloudflare edge connection as measured by Cloudflare (metadata only).
            rec({ event: "relay_net", callSid: msg.callSid, ...netInfo });
            pub({ type: "relay_net", sessId: sess.id, ...netInfo });
          }
          break;
        case "dtmf":
          rec({ event: "dtmf", callSid: sess.callSid, digit: msg.digit });
          break;
        case "interrupt":
          rec({ event: "interrupt", callSid: sess.callSid, turn: sess.turn, ...relayTag(), receivedAt: tRecv,
                utteranceUntilInterrupt: msg.utteranceUntilInterrupt,
                durationUntilInterruptMs: msg.durationUntilInterruptMs });
          pub({ type: "interrupt", turn: sess.turn, ms: msg.durationUntilInterruptMs });
          // the customer cut in: the in-flight reply (if still generating) is stale, stop generating/sending it
          if (sess.active && !sess.active.done) sess.active.cancel('interrupt');
          break;
        case "prompt": {
          if (!msg.last) {
            // partial transcript: counts and length only; never starts an LLM call, never stored as text
            sess.partials++;
            const chars = String(msg.voicePrompt || "").length;
            // v5z4: persist the FIRST partial of each utterance as a full record; the rest only update counters that are written as one partial_summary
            // (count, first/last receivedAt, min/max/last chars) at the final or at call end. The live pub below is unchanged (the STT lamp uses it).
            const pa = sess.pAgg || (sess.pAgg = { n: 0, firstAt: tRecv, lastAt: tRecv, minChars: chars, maxChars: chars, lastChars: chars, firstSeq: sess.partials, lastSeq: sess.partials, firstRelaySeq: sess.relaySeq + 1, lastRelaySeq: sess.relaySeq + 1 });
            pa.n++; pa.lastAt = tRecv; pa.lastChars = chars; pa.lastSeq = sess.partials; pa.lastRelaySeq = sess.relaySeq + 1; pa.minChars = Math.min(pa.minChars, chars); pa.maxChars = Math.max(pa.maxChars, chars);
            if (pa.n === 1) rec({ event: "partial_prompt", callSid: sess.callSid, ...relayTag(), association: "call_only", receivedAt: tRecv, chars, partialSeq: sess.partials });
            else { agg.partialsSkipped++; sess.relaySeq++; }
            pub({ type: "partial", chars, partialSeq: sess.partials, receivedAt: tRecv });
            break;
          }
          flushPartials();
          // a new final supersedes a reply that is still generating (early final followed by more speech)
          if (sess.active && !sess.active.done) sess.active.cancel('superseded_by_new_final');
          const turnId = ++sess.turn;
          const ctl = { done: false, cancelled: null, cancel(reason) { if (!this.cancelled && !this.done) this.cancelled = reason; } };
          sess.active = ctl;
          // Protocol IDs are generated and owned by us (Relay does not carry them).
          const baseId = sess.callSid || sess.id;
          const utteranceId = baseId + ':u' + turnId;
          const responseId = baseId + ':r' + turnId;
          const turn = { event: 'turn', callSid: sess.callSid, turn: turnId,
            utteranceId, responseId,
            prompt: msg.voicePrompt, lang: msg.lang, tPromptRecv: tRecv, models: MODELS };
          let eventSeq = 0;
          const stamps = {};
          const boundary = (name, fields = {}) => {
            const wall = name === 'relay_final_received' ? tRecv : Date.now();
            const mono = name === 'relay_final_received' ? tRecvMono : performance.now();
            if (stamps[name] == null) stamps[name] = { wall, mono };
            rec({ event:'boundary', boundary:name, callSid:sess.callSid, turn:turnId,
              utteranceId, responseId, source:'ws-server',
              sequence:++eventSeq, clockDomain:'server', epochTime:wall, monotonicTime:mono, ...fields });
            pub({type:'boundary', boundary:name, turn:turnId, utteranceId, responseId,
              epochTime:wall, monotonicTime:mono, sequence:eventSeq, ...fields});
          };
          // Timestamp taken at WS callback entry, before JSON parsing.
          boundary('relay_final_received', { receivedAt:tRecv });
          pub({ type:'stt_done', turn:turnId, utteranceId, promptChars:(msg.voicePrompt || '').length });
          if (sess.pendingSpeakerOff != null) { turn.tSpeakerOffSrv = sess.pendingSpeakerOff; sess.pendingSpeakerOff = null; }
          sess.tokensPlayedFirst = null;
          let full = '', firstTokenAt = null, chunkSeq = 0;
          // history as of this turn's start (earlier user lines, completed replies only); this turn's own user line is added right after
          const historySnapshot = sess.history.slice();
          const userMsg = historyAddUser(sess.history, msg.voicePrompt);
          turn.llmInflightAtStart = sess.llmInflight || 0; sess.llmInflight = (sess.llmInflight || 0) + 1;
          // v5z4: every chunk is still sent and counted; only the FIRST chunk, the last=true chunk, fallback chunks and any skipped/failed chunk get
          // boundary records (rec + live pub). The middle chunks (2-3 characters each, send start->returned was 0 ms on all 129 chunks of the 11-03 17:12 call)
          // are folded into per-turn counters (turn.textChunks) so nothing about count, size or failure is lost. Readers use chunkSeq 1 and last=true only.
          const tc = { chunks: 0, chars: 0, returned: 0, failed: 0, skipped: 0, maxSendMs: 0, recordedBoundaries: 0, foldedBoundaries: 0, firstSeq: null, lastSeq: null };
          turn.textChunks = tc;
          const textSend = (token, last, fallback = false) => {
            const seq = ++chunkSeq;
            const full1 = seq === 1 || last || fallback;
            tc.chunks++; tc.chars += token.length; if (tc.firstSeq == null) tc.firstSeq = seq; tc.lastSeq = seq;
            const bnd = (name, f) => { if (full1 || name === 'relay_text_send_failed' || name === 'relay_text_send_skipped') { tc.recordedBoundaries++; boundary(name, f); } else { tc.foldedBoundaries++; agg.chunkEventsSkipped++; if (!stamps[name]) stamps[name] = { wall: Date.now(), mono: performance.now() }; } };
            const t0 = performance.now();
            bnd('relay_text_send_start', { chunkSeq:seq, chars:token.length, last, fallback });
            try {
              if (sess.over) { tc.skipped++; boundary('relay_text_send_skipped', {chunkSeq:seq,last,fallback}); return; }
              ws.send(JSON.stringify({type:'text', token, last, ...(last ? {} : {interruptible:true})}));
              tc.returned++; tc.maxSendMs = Math.max(tc.maxSendMs, performance.now() - t0);
              bnd('relay_text_send_returned', {chunkSeq:seq,chars:token.length,last,fallback});
            } catch (error) { tc.failed++; boundary('relay_text_send_failed', {chunkSeq:seq,last,fallback}); throw error; }
          };
          try {
            for await (const tok of streamLLM(env, historySnapshot, msg.voicePrompt, undefined, boundary)) {
              if (typeof tok !== 'string' || tok.length === 0) continue;
              if (ctl.cancelled) break; // a token that arrives after cancel is dropped before any first-token record or send
              if (firstTokenAt === null) {
                firstTokenAt = Date.now(); turn.tLlmFirstToken = firstTokenAt;
                boundary('llm_first_nonempty_token');
                pub({ type:'llm_first', turn:turnId, utteranceId, responseId, ms:firstTokenAt-tRecv });
              }
              full += tok;
              textSend(tok, false);
            }
            // a cancelled stream still ends here (lamp closes); the flag keeps it distinguishable from a natural end
            boundary('llm_stream_end', {hasNonemptyToken:firstTokenAt !== null, ...(ctl.cancelled ? {cancelled:ctl.cancelled} : {})});
          } catch (error) {
            if (ctl.cancelled) { boundary('llm_stream_end', {hasNonemptyToken:firstTokenAt !== null, cancelled:ctl.cancelled, errorAfterCancel:true}); }
            else {
            // A send failure is not mislabeled a model failure.
            const sendFailure = stamps.relay_text_send_failed != null;
            boundary(sendFailure ? 'turn_transport_failure' : 'llm_failed', sendFailure ? {} : { errorText: String(error && error.message || error).replace(/[^\x20-\x7e]/g, '').slice(0, 160) });
            console.error(sendFailure ? 'Relay send error' : 'LLM error', String(error));
            full = 'Sorry, the middle layer failed. Please say that again.';
            try { textSend(full, false, true); } catch {}
            }
          }
          // a cancelled reply sends no more text (including no last=true)
          if (!ctl.cancelled) { try { textSend('', true); } catch {} }
          ctl.done = true;
          if (ctl.cancelled) turn.cancelled = ctl.cancelled;
          turn.reply = full;
          turn.llmFirstTokenMs = firstTokenAt ? firstTokenAt-tRecv : null; // legacy receive-to-first metric, unchanged
          turn.replyTotalMs = Date.now()-tRecv; turn.replyChars = full.length;
          turn.tLlmRequestStart = stamps.llm_request_start?.wall ?? null;
          turn.tLlmStreamReceived = stamps.llm_response_stream_received?.wall ?? null;
          turn.tLlmEnd = stamps.llm_stream_end?.wall ?? null;
          turn.tLlmFailed = stamps.llm_failed?.wall ?? null;
          // Owned local intervals use monotonic clock; no cross-device subtraction.
          turn.finalHandlerToRequestMs = stamps.llm_request_start ? stamps.llm_request_start.mono-stamps.relay_final_received.mono : null;
          turn.requestToFirstTokenMs = stamps.llm_first_nonempty_token && stamps.llm_request_start ? stamps.llm_first_nonempty_token.mono-stamps.llm_request_start.mono : null;
          // Six-metric server half: W4-W3 forwarding, W5-W2 total generation (same clock).
          turn.forwardFirstChunkMs = stamps.relay_text_send_start && stamps.llm_first_nonempty_token ? stamps.relay_text_send_start.mono-stamps.llm_first_nonempty_token.mono : null;
          turn.aiTotalGenMs = stamps.llm_stream_end && stamps.llm_request_start ? stamps.llm_stream_end.mono-stamps.llm_request_start.mono : null;
          rec(turn);
          pub({ type:'llm_done', turn:turnId, utteranceId, responseId, ms:turn.replyTotalMs, chars:full.length, ...(ctl.cancelled ? {cancelled:ctl.cancelled} : {}) });
          sess.llmInflight = Math.max(0, (sess.llmInflight || 1) - 1);
          historyAddReply(sess.history, userMsg, full); // empty (cancelled before any text) adds nothing; a partial reply that was already sent is kept, as before
          break;
        }
        case "error":
          { const cls = classifyRelayError(msg.description);
          rec({ event: "twilio_error", callSid: sess.callSid, description: msg.description, ...relayTag(), receivedAt: tRecv, code: cls.code, endsSession: cls.endsSession });
          pub({ type: "error", description: String(msg.description || "").slice(0, 120), code: cls.code, endsSession: cls.endsSession }); }
          break;
        default: {
          // Real Relay traffic (2026-11-02 live calls): speaker-events and tokens-played arrive as
          // {type:"info", name:"clientSpeaking"|"agentSpeaking"|"tokensPlayed", value}; configUpdated
          // is value:{session:{...}} or value:{language:[...]}. Only configUpdated is handled here;
          // every other info message continues into the speaker/tokens parser below.
          if (msg.type === "info" && msg.name === "configUpdated") {
            const val = msg.value && typeof msg.value === "object" ? msg.value : {};
            rec({ event: "relay_info", callSid: sess.callSid, name: "configUpdated", ...relayTag(), association: "call_only", receivedAt: tRecv,
                  infoKeys: Object.keys(msg).sort().slice(0, 12), valueKeys: Object.keys(val).slice(0, 12),
                  config: configSnapshot(val.session), languages: Array.isArray(val.language) ? val.language.slice(0, 6).map(configSnapshot) : undefined });
            pub({ type: "relay_config", name: "configUpdated", receivedAt: tRecv });
            break;
          }
          const sp = speakerInfo(msg);
          // Structural evidence only: fixed known keys, types, no arbitrary values.
          const shape = {};
          for (const key of ['type','name','event','speaker','value','state','speaking','active','token','last','turn','turnId','sequenceId']) {
            if (Object.prototype.hasOwnProperty.call(msg,key)) shape[key] = msg[key] === null ? 'null' : Array.isArray(msg[key]) ? 'array' : typeof msg[key];
          }
          if (sp) {
            rec({ event:'speaker', callSid:sess.callSid, ...relayTag(), who:sp.who, on:sp.on,
              turn:null, association:'call_only', receivedAt:tRecv, serverMonoMs:tRecvMono, shape });
            // No provider turn/chunk identifier has been verified. Do not borrow latest turn.
            pub({type:'speaker',who:sp.who,on:sp.on,turn:null,association:'call_only',receivedAt:tRecv});
          } else if (isTokensPlayed(msg)) {
            rec({event:'tokens_played',callSid:sess.callSid,...relayTag(),turn:null,association:'call_only',
              receivedAt:tRecv,serverMonoMs:tRecvMono,shape});
            pub({type:'tokens_played',turn:null,association:'call_only',receivedAt:tRecv});
          } else {
            rec({event:'unknown_msg',callSid:sess.callSid,association:'call_only',receivedAt:tRecv,shape});
          }
        }
      }
    } catch (e) { console.error("handler error", String(e)); }
  });
  ws.addEventListener("close", () => {
    if (sess.over) return;
    rec({ event: "ws_close", callSid: sess.callSid, turns: sess.turn,
          callDurationMs: Date.now() - sess.callStart });
    pub({ type: "call_end", turns: sess.turn, ms: Date.now() - sess.callStart });
    finish();
  });
}


export const SESSION_MAX_AGE_S = 12 * 3600;

export async function hmacSha256B64(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function makeSessionCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
  const sig = await hmacSha256B64(env.PAGE_PASSCODE, "vp-session-v1." + exp);
  return `vp_sess=${exp}.${sig}; Path=/; Max-Age=${SESSION_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

export async function sessionOk(request, env) {
  if (!env.PAGE_PASSCODE) return false;
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)vp_sess=(\d+)\.([A-Za-z0-9_-]+)/);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expect = await hmacSha256B64(env.PAGE_PASSCODE, "vp-session-v1." + exp);
  return expect === m[2];
}

// Constant-time-ish passcode check: compare SHA-256 digests, not raw strings.
export async function passcodeMatches(env, candidate) {
  if (!env.PAGE_PASSCODE || typeof candidate !== "string" || !candidate) return false;
  const h = async (v) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  const a = await h(env.PAGE_PASSCODE), b = await h(candidate);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function callsEnabled(env) {
  return String(env.REAL_CALL_ENABLED || "false") === "true";
}



export const GATE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice latency observability</title>
<style>body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;margin:0 auto;padding:2rem 1.2rem;max-width:30rem;background:#f5f4f1;color:#25211e}
.card{background:#fff;border:1px solid #e7e4df;border-radius:12px;padding:1.2rem 1.3rem}
h2{margin:0 0 1rem;font-size:1.1rem;font-weight:650}
input{font-size:1rem;padding:.5rem .6rem;border:1px solid #d8d4cd;border-radius:8px;width:12rem}
button{font-size:1rem;padding:.5rem 1.2rem;border-radius:8px;border:1px solid #2e7d6b;background:#2e7d6b;color:#fff;cursor:pointer}
</style></head>
<body><div class="card"><h2>Voice latency observability</h2>
<form method="post" action="/login">
<p>Passcode:<input type="password" name="passcode" autocomplete="current-password" required autofocus> <button type="submit">Enter</button></p>
</form></div></body></html>`;

export const PAGE_BUILD = "en-1.0.0";

export const OBS_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice latency observability</title>
<style>
body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;margin:0 auto;padding:16px 14px;max-width:46rem;color:#25211e;background:#f5f4f1;font-size:14px;line-height:1.55}
h2{margin:.2rem 0;font-size:1.15rem;font-weight:650} .sub{color:#6f6a64;font-size:.82rem;margin-bottom:1rem;line-height:1.6}
.card{background:#fff;border:1px solid #e7e4df;border-radius:12px;padding:1rem 1.05rem;margin:.85rem 0}
.card>b{font-weight:650}
table{border-collapse:collapse;width:100%;font-size:.85rem;white-space:nowrap}
.tw{overflow-x:auto}
td,th{border-bottom:1px solid #efece8;padding:.4rem .5rem;text-align:left;vertical-align:top}
th{color:#6f6a64;font-weight:600;font-size:.76rem}
.ev{font:12px/1.65 ui-monospace,monospace;background:#f8f7f4;border:1px solid #efece8;border-radius:8px;padding:.5rem .7rem;margin:.3rem 0;white-space:pre-wrap;overflow-wrap:anywhere}
.tag{display:inline-block;font-size:.7rem;border-radius:4px;padding:0 .4rem;margin-left:.4rem}
.m{background:#e1efe9;color:#276552}.b{background:#f4ead5;color:#7d6227}.e{background:#f3e1de;color:#96463d}
a{color:#2e7d6b;text-decoration:none} details{margin:.2rem 0} summary{cursor:pointer;line-height:1.6}
.err{color:#96463d}
button{font-size:.82rem;padding:.35rem .9rem;border-radius:8px;border:1px solid #d8d4cd;background:#fff;color:#25211e;cursor:pointer}
.bar-row{display:flex;align-items:center;margin:.45rem 0;font-size:.8rem}
.tn{width:3rem;color:#6f6a64;flex:none;font-size:.76rem}
.cascade{flex:1;display:flex;height:15px;border-radius:5px;overflow:hidden;background:#efedea;min-width:50px}
.cascade i{display:block;height:100%}
.s1{background:#6f97b8}.s2{background:#9187b3}.s3{background:#c08a5e}
.bneck{box-shadow:inset 0 0 0 2px #8a857e}
.blab{font-size:.7rem;color:#6f6a64;font-weight:600}
.drift{font-size:.7rem;color:#96463d;font-weight:600}
.ilab{font-size:.7rem;color:#8a6d2f;font-weight:600;margin-left:.5rem}
.e2ev{width:4.2rem;text-align:right;font-variant-numeric:tabular-nums;flex:none;font-size:.8rem;font-weight:600}
.miss{color:#8a857e;font-size:.72rem;margin:.2rem 0 .55rem 3rem;line-height:1.6}
.schip{display:inline-block;background:#f3f1ed;border:1px solid #eceae5;border-radius:5px;padding:0 .35rem;margin:.15rem .25rem .1rem 0;font-size:.72rem;line-height:1.7;white-space:nowrap}
.schip.wrn{background:#f4ead5;color:#7d6227;border-color:#eadfc4}
.segi{display:inline-block;margin-right:.7rem;white-space:nowrap}
.cdot{display:inline-block;width:.5rem;height:.5rem;border-radius:2px;margin-right:.2rem;vertical-align:-1px}
.legend2{font-size:.74rem;color:#6f6a64;margin:.5rem 0 .2rem;line-height:1.7}
.bk{display:flex;gap:10px;font-size:.88rem;line-height:1.65;padding:6px 0;color:#3a3733}
.bk+.bk{border-top:1px solid #efece7}
.bkl{flex:none;width:6.2em;color:#6f6a64;font-size:.76rem;padding-top:2px}
.bkd{margin-top:.55rem;font-size:.8rem;color:#6f6a64;line-height:1.65}
.bkd summary{cursor:pointer;font-weight:600}
.chip{display:inline-block;width:.75rem;height:.75rem;border-radius:3px;vertical-align:-1px;margin:0 .25rem 0 .5rem}
.agg-row{display:flex;align-items:center;margin:.32rem 0;font-size:.8rem;flex-wrap:wrap}
.agg-nm{width:8.4rem;flex:none}
.agg-bar{flex:1;height:12px;background:#efedea;border-radius:4px;min-width:40px}
.agg-bar i{display:block;height:100%;border-radius:4px}
.agg-vl{flex:none;margin-left:.5rem;font-variant-numeric:tabular-nums;color:#45403a;font-size:.76rem}
.models{background:#f8f7f4;border:1px solid #efece8;border-radius:8px;padding:.45rem .7rem;margin:.4rem 0}
.mrow{display:flex;align-items:baseline;gap:.5rem;padding:.14rem 0;font-size:.76rem;line-height:1.5}
.mk{flex:none;width:5em;color:#6f6a64;font-size:.7rem}
.mv{flex:1;color:#25211e;overflow-wrap:break-word}
.msrc{flex:none;font-size:.64rem;border-radius:4px;padding:0 .35rem;white-space:nowrap}
.msrc.ok{background:#e1efe9;color:#276552}
.msrc.warn{background:#f4ead5;color:#7d6227}
.msrc.bad{background:#f3e1de;color:#96463d}
@media (max-width:480px){.agg-vl{width:100%;margin:.1rem 0 .3rem}}
.schip{white-space:normal}.segi{display:block;white-space:normal;overflow-wrap:anywhere}.tln{overflow-wrap:anywhere}body{overflow-wrap:anywhere}.blab,.drift,.ilab{overflow-wrap:anywhere}@media(max-width:600px){.bar-row{flex-wrap:wrap}.cascade{min-width:40%}}
</style></head><body>
<h2>Voice latency observability</h2>
<div class="sub">auto-refreshes every 5 s · stores only timing and event metadata, no recordings, no conversation text · <span class="tag m">measured</span>=server record · <span class="tag b">approx</span>=browser clock estimate (includes provider internals + network + buffering) · <a href="/">Call page</a> · version ${PAGE_BUILD}/<span id="wbuild">?</span></div>

<div class="card"><details><summary><b>Telemetry self-observation</b> <span class="sub">coverage / rejected / report-failure counts</span></summary><div id="telehealth">…</div>
<div class="legend2">coverage = turns with browser reports / turns recorded by the server · report failures are counted by the browser on its next successful send, lost if the network is down, so they can only be underestimated · rejection breakdown: bad JSON/bad row = server 400 · edge 403 = session check failed (not logged in / expired / invalid) · edge 413 = over limit · no-result dedupe = duplicate reports of one event merged · counts start when obs-v1 went live and include synthetic validation traffic, so they do not represent historical coverage</div></details></div>

<div class="card"><b>Live test results</b> <span id="rttag"></span><div id="rtbody">…</div>
<div class="legend2">one cascade bar per turn:<span class="chip" style="background:#6f97b8"></span>stop speaking → transcript<span class="tag b">approx</span><span class="chip" style="background:#9187b3"></span>transcript → LLM first token<span class="tag m">measured</span><span class="chip" style="background:#c08a5e"></span>first token → audible<span class="tag b">approx</span> · gray frame = slowest segment of the turn (relative, not a timeout verdict) · right side = end to end (end of speech → first audio)<span class="tag b">approx</span> · duration numbers are colored by budget status (green ≤ budget · orange ≤ 1.5× · red > 1.5×; mapping s1 300 · s2 350 · s3 300 · end to end 1000ms, basis at the bottom of the page) · stop speaking = backfilled to the last above-threshold frame (not the 500ms confirmation moment), measured duration includes the confirmation period without subtracting it · physical audibility not verified</div></div>

<div class="card"><b>Segment statistics (all turns)</b><div id="segagg">…</div>
<div class="sub" style="margin:.35rem 0 0">bar length = mean duration · all units are ms · n = sample count, treat small samples with caution · means are sensitive to outliers; median = middle of the sorted values (even counts average the two middle values), P70/P95 = nearest-rank · whole-turn text = server time from receiving the transcript to finishing the text<span class="tag m">measured</span></div></div>

<div class="card"><b>Real call sessions</b><div id="sessions">…</div></div>
<div class="card" style="border-color:#d8c9a8;background:#fbf7ec"><b>Sessions pending authenticity check</b> <span class="tag b">callSid looks like a Twilio one but reconciliation is unconfirmed, not counted as simulated for now</span><div id="pendsessions">…</div></div>
<div class="card" style="border-color:#e3d3ac;background:#fdfaf2"><b>Simulated test sessions</b> <span class="tag b">not real calls, link function checks only</span><div id="simsessions">…</div></div>

<div class="card"><details><summary><b>Real call records (Twilio API)</b> <span class="sub">reconciled with system sessions</span></summary><div id="calls">…</div></details></div>

<div class="card"><b>Baseline eval (text layer, no audio)</b> <button id="evalbtn" style="margin-left:.6rem">Run one eval</button><details class="bkd"><summary>Past LLM test records (text baseline, not calls)</summary><div id="evals">…</div></details>
<div class="sub" style="margin:.4rem 0 0">runs 6 fixed prompts through the middle LLM, records only latency and character counts, does not store answers · <b>measures latency only, not answer correctness</b> · for comparing after a model swap or a decision layer · repeated runs within the same minute are rejected by the server (quota protection)</div></div>

<div class="card"><b>Budget and basis notes</b>
<div class="bk"><span class="bkl">Pure component budget</span><span>endpointing decision+ASR <b>300</b> · LLM first token <b>350</b> · TTS first audio <b>150</b> · network + playback <b>150</b> · slack <b>50</b> (Critical path total 1000ms)</span></div>
<div class="bk"><span class="bkl">Observation mapping <span class="tag b">approx</span></span><span>s1 stop speaking → transcript <b>300ms</b> · s2 transcript → first token <b>350ms</b> · s3 first token → audible <b>300ms</b> · end to end <b>1000ms</b></span></div>
<div class="bk"><span class="bkl">Status colors</span><span><b style="color:#276552">green ≤ budget</b> · <b style="color:#a5660f">orange ≤1.5×</b> · <b style="color:#96463d">red >1.5×</b>,judged separately per segment from measured values</span></div>
<div class="bk"><span class="bkl">Live halo</span><span>the halo of an in-progress stage on the call page = live status of that wait against the budget (same thresholds as above, browser side<span class="tag b">approx</span>);"speak" and "play" are not budgeted——speaking and playback durations are not latency; "think" counts only up to the first token, not the whole turn; duration numbers after a segment completes are still colored by the same thresholds</span></div>
<div class="bk"><span class="bkl">Stage colors</span><span><span class="chip" style="background:#6f97b8"></span>transcribe <span class="chip" style="background:#9187b3"></span>generate <span class="chip" style="background:#c08a5e"></span>synthesis + transport, identify the stage only and are independent of the status colors</span></div>
<div class="bk"><span class="bkl">not a timeout</span><span>budget status is a display basis only, not a timeout verdict, and the system never interrupts any call because of it</span></div>
<div class="bk"><span class="bkl">Statistics and turn basis</span><span>median = middle of the sorted values (even counts average the two middle values), shown rounded to whole ms · P70/P95 = nearest-rank · turns = number of ConvRelay final (last=true) triggers: each final counts as one turn, interruptions neither add nor remove turns, no semantic merging or dedupe; older calls without trigger-boundary records use the processing record count and are marked unverifiable · before v5z9: pct(50) was nearest-rank and the Insights summary used the upper median, both labeled "median", now unified</span></div>
<details class="bkd"><summary>Technical basis details</summary><div style="margin-top:.4rem">the s1 measured value includes the 500ms stop-confirmation period (not subtracted); s3 includes synthesis + network + buffering; s1/s3 align clocks across ends by arrival order<span class="tag b">approx</span>,not strictly comparable with the pure component budget; the three segments summed differ from end to end because they do not add up. The LLM budget varies with backend configuration (memory/RAG/tools); currently a free small model.</div></details></div>

<script>
const fmtMs = (ms) => ms == null ? '-' : (ms/1000).toFixed(1) + 's';
const fmtT = (x) => { const d = new Date(x); return isNaN(d) ? String(x ?? '-') :
  d.toLocaleString("en-GB", { timeZone: "UTC", month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); };
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a,b)=>a-b);
  const i = Math.min(s.length - 1, Math.ceil(p/100*s.length) - 1); return s[Math.max(0,i)]; };
// Unified statistics/turn-basis helpers, injected from module scope (single source of truth; tested in tests/turn-stats-basis.test.mjs)
const median = ${medianOf.toString()};
const turnTriggerStats = ${turnTriggerStats.toString()};
const recSelfCheck = ${recSelfCheck.toString()};
const mean = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
const numok = (v) => typeof v === 'number' && isFinite(v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function sessModels(s){ const evs = s.events||[]; for (const e of evs) if (e.event==='setup' && e.models) return e.models; for (const e of evs) if (e.event==='turn' && e.models) return e.models; return null; }
  function modelsText(m){ return m ? ('STT ' + m.stt + ' · LLM ' + m.llm + ' · TTS ' + m.tts) : 'not recorded (before the version that added model stamping)'; }
  function modelsShort(m){ if(!m) return 'model not recorded (before stamping went live)'; const sv=String(m.stt||'').replace(/^Deepgram\s*/,'').replace(/\s*[·(].*$/,'').replace(/-general$/,''); const lv=String(m.llm||'').replace('@cf/meta/','').split('-').slice(0,3).join('-'); return sv + ' · ' + lv + ' · ElevenLabs'; }
  function modelsHtml(m){
    if(!m) return '<div class="mrow"><span class="mk">Model</span><span class="mv">not recorded (before the version that added model stamping)</span></div>';
    const row=(k,v,s2,c)=>'<div class="mrow"><span class="mk">'+k+'</span><span class="mv">'+esc(v==null?'not recorded':v)+'</span>'+(s2?'<span class="msrc '+c+'">'+s2+'</span>':'')+'</div>';
    let h=row('STT',m.stt,'explicitly configured','ok')+row('LLM',m.llm,'explicitly configured','ok');
    if(m.ttsVoice||m.ttsModel) h+=row('TTS',m.tts,'explicitly configured','ok')+row('TTS voice',m.ttsVoice,'doc default','warn')+row('TTS model',m.ttsModel,'not configurable','bad');
    else {
      const tv=String(m.tts||''); const parts=tv.split(' · ');
      const vp=parts.find(x=>x.indexOf('voice ')===0); const mp=parts.find(x=>x.indexOf('TTS model ')===0);
      if(vp||mp){
        h+=row('TTS',parts[0]||'ElevenLabs','explicitly configured','ok');
        if(vp) h+=row('TTS voice',vp.replace(/^voice /,''),'doc default','warn');
        if(mp) h+=row('TTS model',mp.replace(/^TTS model /,''),'not configurable','bad');
      } else h+=row('TTS',tv,'','');
    }
    return h;
  }
const SEGNAME = { s1:'stop speaking → transcript', s2:'transcript → first token', s3:'first token → audible' };
const SEGTAG = { s1:'b', s2:'m', s3:'b' };
const openIds = new Set();
function rememberOpen() { openIds.clear(); document.querySelectorAll('#sessions details[open], #simsessions details[open]').forEach(d => openIds.add(d.dataset.sid)); }
function restoreOpen() { document.querySelectorAll('#sessions details, #simsessions details').forEach(d => { if (openIds.has(d.dataset.sid)) d.open = true; }); }

function turnCountFrag(s) {
  const ts = turnTriggerStats(s);
  return ts.count + ' turns' + (ts.basis === 'records' && ts.count ? '<span class="tag b">by processing records, no trigger boundary so unverifiable</span>' : '');
}
function sessDur(s) {
  if (s.end) return fmtMs(s.end.callDurationMs);
  const lastTs = (s.events || []).map(e => Date.parse(e.ts)).filter(numok).sort((a,b)=>b-a)[0] || Date.parse(s.start);
  return (numok(lastTs) && Date.now() - lastTs > 10 * 60 * 1000) ? 'ended (end event not recorded)' : 'in progress';
}
function segOf(t, tl) {
  // amp flags: rows from builds before 2026-10-31 used the retired amplitude
  // (level) timing basis - kept visible but marked legacy, not latency evidence.
  // Rows from bw-baseline builds carry volume-inferred B points (approx, usable).
  const sg = { s1: null, s2: numok(t.llmFirstTokenMs) ? t.llmFirstTokenMs : null, s3: null, e2e: null, amp: {} };
  if (tl) {
    const legacy = !tl.pageBuild || String(tl.pageBuild) < '2026-10-31';
    if (numok(tl.sttRecvTs) && numok(tl.speechEndTs)) { sg.s1 = Math.max(0, tl.sttRecvTs - tl.speechEndTs); sg.amp.s1 = legacy; }
    if (numok(tl.playStartTs) && numok(tl.llmFirstRecvTs)) { sg.s3 = Math.max(0, tl.playStartTs - tl.llmFirstRecvTs); sg.amp.s3 = legacy; }
    if (numok(tl.playStartTs) && numok(tl.speechEndTs)) { sg.e2e = Math.max(0, tl.playStartTs - tl.speechEndTs); sg.amp.e2e = legacy; }
  }
  return sg;
}

let TELE = {}; let NR = {}; let LATE = {}; let FAILMAX = {};
const BUDGET = { s1: 300, s2: 350, s3: 300, e2e: 1000 }; // approximate mapping, not a timeout verdict
const BC = { g: '#276552', o: '#a5660f', r: '#96463d' };
const STAGEC = { s1: '#6f97b8', s2: '#9187b3', s3: '#c08a5e' };
function bst(v, b) { return v <= b ? 'g' : (v <= b * 1.5 ? 'o' : 'r'); }
function medE2eVal(s) {
  const vals = (s.events||[]).filter(e => e.event === 'turn').map(t => segOf(t, TELE[(s.callSid||'') + ':' + t.turn] || null).e2e).filter(numok);
  return median(vals); // unified basis: conventional median (v5z9; was nearest-rank pct(50))
}
function statChips(s, turns, full) {
  const sid = s.callSid || '';
  const cov = turns.filter(t => TELE[sid + ':' + t.turn]).length;
  let h = '<span class="schip">return ' + cov + '/' + turns.length + '</span>';
  const tst = turnTriggerStats(s);
  if (tst.recMismatch) {
    if (tst.missingRecords.length) h += '<span class="schip wrn">final trigger missing a processing record ×' + tst.missingRecords.length + '(turns ' + tst.missingRecords.slice(0, 8).join(',') + (tst.missingRecords.length > 8 ? ',…' : '') + ';only says the record is missing, whether the turn ran cannot be determined, and cannot be located one by one)</span>';
    if (tst.extraRecords.length) h += '<span class="schip wrn">processing record has no trigger boundary ×' + tst.extraRecords.length + '(turns ' + tst.extraRecords.slice(0, 8).join(',') + (tst.extraRecords.length > 8 ? ',…' : '') + ';boundary record lost, turns still counted on the final basis)</span>';
  }
  if (tst.endMismatch) h += '<span class="schip wrn">end counts ' + tst.endTurns + ' ≠ final ' + tst.finals + '(needs investigation)</span>';
  if (turns.length && cov < turns.length) h += '<span class="schip wrn">insufficient coverage</span>';
  if (FAILMAX[sid]) h += '<span class="schip">report failures ×' + FAILMAX[sid] + '</span>';
  const F3 = '2026-10-31.turn-assoc-f3';
  const resN = turns.filter(t => { const x = TELE[sid + ':' + t.turn]; if (!x) return false; if (String(x.pageBuild || '') >= F3) return false; const v4 = String(x.pageBuild || '') >= '2026-10-31.bw-baseline-v4'; return x.residual || (v4 && numok(x.sttRecvTs) && !numok(x.speechStartTs)); }).length;
  const unN = turns.filter(t => { const x = TELE[sid + ':' + t.turn]; if (!x) return false; return String(x.pageBuild || '') >= F3 && x.speechUnassociated; }).length;
  if (resN) h += '<span class="schip wrn">interrupt remnant ×' + resN + '(turns not deduplicated)</span>';
  if (unN) h += '<span class="schip wrn">speech start/end not linked ×' + unN + '(no browser volume evidence)</span>';
  const mv = medE2eVal(s);
  if (mv != null) h += '<span class="schip">median E2E <b style="color:' + BC[bst(mv, BUDGET.e2e)] + '">' + Math.round(mv) + 'ms</b> (approximate, regular median basis, rounded to ms)</span>';
  if (full) {
    h += '<span class="schip">' + esc(modelsShort(sessModels(s))) + '</span>';
    if (NR[sid]) h += '<span class="schip">transcript not received ×' + NR[sid] + '</span>';
    if (LATE[sid]) h += '<span class="schip">late ×' + LATE[sid] + '</span>';
  }
  return h;
}
function cascadeHtml(s, isSim) {
  const tagOf = (k) => isSim ? 'simulated' : (SEGTAG[k] === 'm' ? 'measured' : 'approx');
  const turns = (s.events||[]).filter(e => e.event === 'turn');
  if (!turns.length) return '<span class="sub">No per-turn data.</span>';
  const rows = turns.map(t => ({ t, tl: TELE[(s.callSid||'') + ':' + t.turn] || null }));
  rows.forEach(r => r.sg = segOf(r.t, r.tl));
  const totals = rows.map(r => numok(r.sg.e2e) ? r.sg.e2e
    : (numok(r.sg.s1) && numok(r.sg.s2) && numok(r.sg.s3) ? r.sg.s1 + r.sg.s2 + r.sg.s3 : null)).filter(numok);
  const segVals = rows.flatMap(r => [r.sg.s1, r.sg.s2, r.sg.s3]).filter(numok);
  const scale = Math.max(1200, ...totals, ...segVals);
  const anyTele = rows.some(r => r.tl);
  return rows.map(r => {
    const segs = [['s1', r.sg.s1], ['s2', r.sg.s2], ['s3', r.sg.s3]];
    let maxK = null, maxV = -1;
    const measured = segs.filter(([k, v]) => numok(v));
    if (measured.length >= 2) measured.forEach(([k, v]) => { if (v > maxV) { maxV = v; maxK = k; } });
    const bar = segs.map(([k, v]) => numok(v)
      ? '<i class="' + k + (k === maxK ? ' bneck' : '') + '" style="width:' + Math.max(2.5, v / scale * 100) + '%"></i>' : '').join('');
    const e2eTxt = numok(r.sg.e2e) ? (r.sg.e2e/1000).toFixed(2) + 's' + (r.sg.amp && r.sg.amp.e2e ? '<span class="tag b">legacy amplitude</span>' : '')
      : (totals.length && numok(r.sg.s1) && numok(r.sg.s2) && numok(r.sg.s3) ? ((r.sg.s1+r.sg.s2+r.sg.s3)/1000).toFixed(2) + 's' : '-');
    let html = '<div class="bar-row"><span class="tn">turn ' + r.t.turn + '</span>'
      + '<div class="cascade">' + bar + '</div><span class="e2ev"' + (numok(r.sg.e2e) ? ' style="color:' + BC[bst(r.sg.e2e, BUDGET.e2e)] + '"' : '') + '>' + e2eTxt + '</span></div>';
    const flags = [];
    if (maxK) flags.push('<span class="blab">▲ slowest segment: ' + SEGNAME[maxK] + ' ' + Math.round(maxV) + 'ms (' + tagOf(maxK) + ')</span>');
    if (r.tl && r.tl.interrupted) flags.push('<span class="ilab">interrupted</span>');
    const v4row = r.tl && String(r.tl.pageBuild || '') >= '2026-10-31.bw-baseline-v4';
    if (r.tl) {
      const f3row = String(r.tl.pageBuild || '') >= '2026-10-31.turn-assoc-f3';
      if (f3row && r.tl.speechUnassociated) flags.push('<span class="ilab">speech start/end not linked (no browser volume evidence, content not recorded, not inferred)</span>');
      if (!f3row && (r.tl.residual || (v4row && numok(r.tl.sttRecvTs) && !numok(r.tl.speechStartTs)))) flags.push('<span class="ilab">interrupt remnant trigger (attribution uncertain, no new speech energy recorded)</span>');
      if (f3row && r.tl.speechSharedWithPrev) flags.push('<span class="ilab">continued transcript · same-segment candidate (continuous volume assumed, protocol has no same-segment confirmation, approximate)</span>');
      if (f3row && r.tl.playEpisodes > 1) flags.push('<span class="ilab">multiple downlink energy segments ×' + r.tl.playEpisodes + '(keep the latest segment start/end, approximate)</span>');
      if (f3row && r.tl.playAssocCandidate) flags.push('<span class="ilab">playback start/end are candidate links (text send of this turn correlated + volume, approximate)</span>');
    }
    if (r.tl && r.tl.orphanPlayEnd) flags.push('<span class="ilab">playback end assigned to this turn across turns</span>');
    if (r.tl && r.tl.stalled) flags.push('<span class="ilab">server events stalled (timer no longer indicates progress)</span>');
    if (r.tl && numok(r.tl.sttRecvTs) && numok(r.tl.llmFirstRecvTs) && numok(r.t.llmFirstTokenMs)) {
      const s2b = r.tl.llmFirstRecvTs - r.tl.sttRecvTs;
      const dd = Math.abs(s2b - r.t.llmFirstTokenMs);
      if (dd > 50) flags.push('<span class="drift">clock offset exceeded ±' + Math.round(dd) + 'ms (browser ' + Math.round(s2b) + 'ms vs server ' + Math.round(r.t.llmFirstTokenMs) + 'ms)</span>');
    }
    if (flags.length) html += '<div style="margin:-.15rem 0 .1rem 3rem">' + flags.join('') + '</div>';
    const nums = segs.map(([k, v]) => {
      if (!numok(v)) return '<span class="segi"><i class="cdot" style="background:' + STAGEC[k] + '"></i>' + SEGNAME[k] + ' not measured</span>';
      const vv = Math.round(v);
      return '<span class="segi"><i class="cdot" style="background:' + STAGEC[k] + '"></i>' + SEGNAME[k] + ' <b style="color:' + BC[bst(v, BUDGET[k])] + '">' + vv + 'ms</b> (' + tagOf(k) + (r.sg.amp && r.sg.amp[k] ? '·legacy amplitude' : '') + ')</span>';
    }).join('');
    const talk = (r.tl && numok(r.tl.speechStartTs) && numok(r.tl.speechEndTs)) ? 'speech ' + Math.round(r.tl.speechEndTs - r.tl.speechStartTs) + 'ms (volume inference' + (r.sg.amp && r.sg.amp.s1 ? ',legacy amplitude basis' : '') + ') · ' : '';
    html += '<div class="miss" style="margin-top:0">' + talk + nums + '</div>';
    html += metric6Html(s, r.t, r.tl, isSim);
    return html;
  }).join('') + (anyTele ? '' : '<div class="miss">This call has no browser-side report (it predates the report feature): the purple bar is only the server-measured segment, not the full end-to-end length.</div>');
}

// Six core metrics (10/31 baseline): server half from the turn record (same
// Cloudflare clock, measured); browser-dependent half from telemetry rows,
// cross-clock values aligned via the row's own clkOffsetMs (approx).
function metric6(s, t, tl) {
  const out = [];
  const clk = tl && numok(tl.clkOffsetMs) ? tl.clkOffsetMs : null;
  // B fields from pre-10/31 builds are the retired amplitude basis - not usable.
  const bOk = tl && tl.pageBuild && String(tl.pageBuild) >= '2026-10-31';
  const w4 = (s.events || []).find(e => e.event === 'boundary' && e.turn === t.turn && e.boundary === 'relay_text_send_start' && e.chunkSeq === 1);
  const w4ts = w4 ? (w4.epochTime ?? w4.serverTs) : null;
  const m = (label, val, tag, note) => out.push({ label, val, tag, note });
  m('AI TTFT W3-W2', numok(t.requestToFirstTokenMs) ? t.requestToFirstTokenMs : null, 'm', 'same clock, includes the /ws→AI call chain, not pure model time');
  m('forwarding overhead W4-W3', numok(t.forwardFirstChunkMs) ? t.forwardFirstChunkMs : null, 'm', 'same clock');
  m('AI total generation W5-W2', numok(t.aiTotalGenMs) ? t.aiTotalGenMs : null, 'm', 'same clock, includes the call chain');
  m('STT+uplink W1-B2', (bOk && numok(t.tPromptRecv) && numok(tl.speechEndTs) && clk != null) ? Math.max(0, t.tPromptRecv - (tl.speechEndTs + clk)) : null, 'b', 'approximate cross-clock alignment, B2 inferred from volume');
  m('TTS+downlink B3-W4', (bOk && numok(w4ts) && numok(tl.playStartTs) && clk != null) ? Math.max(0, (tl.playStartTs + clk) - w4ts) : null, 'b', 'approximate cross-clock alignment, B3 inferred from volume');
  m('perceived latency B3-B2', (bOk && numok(tl.playStartTs) && numok(tl.speechEndTs)) ? Math.max(0, tl.playStartTs - tl.speechEndTs) : null, 'b', 'same browser clock, start/end inferred from volume');
  return out;
}
function metric6Html(s, t, tl, isSim) {
  const ms = metric6(s, t, tl);
  return '<div class="miss" style="margin-top:.1rem">' + ms.map(x =>
    '<span class="segi">' + x.label + ' ' + (numok(x.val)
      ? '<b style="color:' + BC[bst(x.val, BUDGET.e2e)] + '">' + Math.round(x.val) + 'ms</b>'
      : 'not measured') + '<span class="tag ' + (isSim ? 'b' : x.tag) + '">' + (isSim ? 'simulated' : (x.tag === 'm' ? 'measured' : 'approx')) + '</span>'
    + (x.note ? ' <span class="tln">(' + esc(x.note) + ')</span>' : '') + '</span>').join('') + '</div>';
}

function collectSegs(list) {
  const acc = { s1: [], s2: [], s3: [], e2e: [], total: [] };
  for (const s of list) for (const t of (s.events||[]).filter(e => e.event === 'turn')) {
    const tl = TELE[(s.callSid||'') + ':' + t.turn] || null;
    const sg = segOf(t, tl);
    if (numok(sg.s1)) acc.s1.push(sg.s1);
    if (numok(sg.s2)) acc.s2.push(sg.s2);
    if (numok(sg.s3)) acc.s3.push(sg.s3);
    if (numok(sg.e2e)) acc.e2e.push(sg.e2e);
    if (numok(t.replyTotalMs)) acc.total.push(t.replyTotalMs);
  }
  return acc;
}
function aggHtml(acc, title, isSim) {
  const defs = [
    ['s1', 'stop speaking → transcript', '#6f97b8', 'b'], ['s2', 'transcript → LLM first token', '#9187b3', 'm'],
    ['s3', 'first token → audible', '#c08a5e', 'b'], ['e2e', 'End to end (end of speech → audible)', '#63a78f', 'b'],
    ['total', 'Whole-turn text (server)', '#94a3b8', 'm']];
  const means = defs.map(([k]) => mean(acc[k])).filter(numok);
  if (!means.length) return '';
  const smax = Math.max(800, ...means);
  let h = '<div style="margin:.5rem 0 .2rem"><b>' + title + '</b></div>';
  for (const [k, nm, color, tg] of defs) {
    const a = acc[k]; if (!a.length) continue;
    const tl = isSim ? 'simulated' : (tg === 'm' ? 'measured' : 'approx');
    h += '<div class="agg-row"><span class="agg-nm"><span class="chip" style="background:' + color + ';margin-left:0"></span>' + nm
      + '<span class="tag ' + (isSim ? 'b' : tg) + '">' + tl + '</span></span>'
      + '<div class="agg-bar"><i style="background:' + color + ';width:' + Math.max(2, mean(a) / smax * 100) + '%"></i></div>'
      + '<span class="agg-vl">avg ' + mean(a) + 'ms · P70 ' + pct(a,70) + 'ms · P95 ' + pct(a,95) + 'ms · n=' + a.length + '</span></div>';
  }
  return h;
}

async function load() {
  let d; try { const r = await fetch('/obs/data'); if (!r.ok) throw new Error('HTTP ' + r.status); d = await r.json(); }
  catch (e) { document.getElementById('rtbody').innerHTML = '<span class="err">Failed to load data: ' + esc(e.message) + '</span>'; return; }
  const ss = d.sessions || [];
  TELE = {}; NR = {}; LATE = {}; FAILMAX = {};
  (d.telemetry || []).forEach(t => {
    if (t.nr) { NR[t.callSid||''] = (NR[t.callSid||''] || 0) + 1; return; }
    TELE[(t.callSid||'') + ':' + t.turn] = t;
    if (t.lateAfterNr) LATE[t.callSid||''] = (LATE[t.callSid||''] || 0) + 1;
    if (numok(t.failedSends)) FAILMAX[t.callSid||''] = Math.max(FAILMAX[t.callSid||''] || 0, t.failedSends);
  });
  document.getElementById('wbuild').textContent = d.build || '?';
  const ts = d.teleStats || {};
  // browser -> Worker SDK events: per (callSid, browserSessionId) source sequence eventSeq (1..n contiguous by construction), dedup by seq
  const ledgerSummary = ${ledgerSummary.toString()};
  const ledRows = Object.values(d.teleLedger || {}).sort((a, b) => a.last - b.last).slice(-5).map(e => { const L = ledgerSummary(e); return (e.callSid || '').slice(-6) + ': browser per-turn telemetry sends ' + (L.sentTotal != null ? L.sentTotal : 'unknown (no final send)') + ' · Worker received (deduped) ' + L.received + '(of which rejected by the Worker ' + L.rejectedAtWorker + ',stored ' + L.stored + ') · duplicates ' + L.dup + ' · ' + L.note; });
  const sdkBySess = {};
  (d.sdkEvents || []).forEach(r => { const k = (r.callSid || '') + '/' + (r.browserSessionId || ''); const o = sdkBySess[k] || (sdkBySess[k] = { seqs: new Set(), n: 0, last: false }); o.n++; o.seqs.add(r.eventSeq); if (r.event === 'call_disconnected') o.last = true; });
  const sdkRows = Object.keys(sdkBySess).slice(-5).map(k => { const o = sdkBySess[k]; const mx = Math.max(...o.seqs); let miss = 0; for (let i = 1; i <= mx; i++) if (!o.seqs.has(i)) miss++; return k.slice(-24) + ': received (deduped) ' + o.seqs.size + ' / max sequence ' + mx + ' · gaps ' + miss + ' · duplicates ' + (o.n - o.seqs.size) + (o.last ? '' : ' · no call_disconnected, tail may be unsent/unreceived, cannot be determined'); });
  // Worker-side recording self-check: rec() counted at source vs actually stored.
  // "0 dropped at source" alone never proved end-to-end zero loss (v5z9).
  const scRows = ss.filter(s => s.end && s.end.recordedEventsByType && recSelfCheck(s)).slice(0, 5).map(s => { const c = recSelfCheck(s);
    return (s.callSid || s.id || '').slice(-6) + ': rec() ' + c.recTotal + ' items · source-side budget drops ' + c.dropped + ' · /netlog external rows ' + c.external + ' · stored ' + c.stored
      + (c.missing > 0 ? ' · <span class="err">does not balance: rec counted but not stored ' + c.missing + ' items (flush failed or written after the end, cannot be located one by one)</span>'
        : (c.missing < 0 ? ' · <span class="err">extra ' + (-c.missing) + ' items of unknown origin, need investigation</span>' : ' · balanced')); });
  const scNoBasis = ss.filter(s => !(s.end && s.end.recordedEventsByType)).length;
  document.getElementById('telehealth').innerHTML =
    '<div>Browser→Worker per-turn telemetry ledger (tseq, one sequence number per send attempt; the final send at the end carries a final flag):' + (ledRows.length ? '<br>' + ledRows.join('<br>') : 'No call with a ledger yet (rows from older builds have no tseq, cannot be verified)') + '. Limits: requests the Pages edge rejects before they reach the Worker (403/413/bad JSON) have no callSid, do not enter the ledger, and appear only in the edge rejection total; failed network sends are self-reported by the browser</div>'
    +     '<div>Browser→Worker SDK events (deduped by browserSessionId+eventSeq; source sequence is contiguous so a sequence gap = verifiable loss; tail loss is flagged only when call_disconnected is missing):' + (sdkRows.length ? '<br>' + sdkRows.join('<br>') : 'no record') + '. Per-turn telemetry (since v5w) is in the ledger above; per-turn rows from earlier builds have no sequence numbers and cannot be checked one by one; edge rejections have only a total (downlink).</div>'
    +     '<div>Worker record self-check (rec source count vs actually stored; /netlog browser network rows use a separate channel and are excluded):' + (scRows.length ? '<br>' + scRows.join('<br>') : 'no call with a source-side count') + (scNoBasis ? '<br>plus ' + scNoBasis + ' old calls have no source-side count, cannot be verified' : '') + '. Limit: covers only the rec → batched storage step; loss of the source count itself (process death) is invisible; Relay→Worker reconciliation is in the Insights summary on the call page.</div>'
    +     '<div>accepted ' + (ts.accepted||0) + '(merged ' + (ts.merged||0) + ' · new ' + (ts.appended||0) + ' · no result ' + (ts.nrAppended||0) + ' · no-result dedupe ' + (ts.nrDeduped||0) + ')</div>'
    + '<div>rejected: bad JSON ' + (ts.rejectBadJson||0) + ' · bad rows ' + (ts.rejectBadRow||0) + ' · edge bad JSON ' + (ts.edge_bad_json||0) + ' · edge bad rows ' + (ts.edge_bad_row||0) + ' · edge 403 ' + (ts.edge_forbidden||0) + ' · edge 413 ' + (ts.edge_too_large||0) + '</div>';
  const realSids = new Set((d.twilioCalls || []).map(c => c.sid));
  // Twilio-format callSid that reconciliation did not confirm (list fetch failed or
  // outside the covered window) is unverified, never silently simulated.
  const TW_SID = /^CA[0-9a-f]{32}$/;
  const real = ss.filter(s => s.callSid && realSids.has(s.callSid));
  const pend = ss.filter(s => !(s.callSid && realSids.has(s.callSid)) && TW_SID.test(s.callSid || ''));
  const sims = ss.filter(s => !(s.callSid && realSids.has(s.callSid)) && !TW_SID.test(s.callSid || ''));

  // ---- realtime card: newest real, else newest unverified, else newest sim ----
  const target = real[0] || pend[0] || sims[0] || null;
  const rtEl = document.getElementById('rtbody');
  if (!target) { rtEl.innerHTML = '<span class="sub">No calls yet.</span>'; document.getElementById('rttag').innerHTML = ''; }
  else {
    const isReal = target === real[0] && real.length > 0;
    const isPend = !isReal && target === pend[0] && pend.length > 0;
    document.getElementById('rttag').innerHTML = isReal ? '<span class="tag m">real call</span>'
      : (isPend ? '<span class="tag b">unverified</span>' : '<span class="tag b">simulated</span>');
    const turns = (target.events||[]).filter(e => e.event === 'turn');
    const dur = sessDur(target);
    rtEl.innerHTML = '<div style="margin:.3rem 0 .4rem"><b>' + esc(fmtT(target.start)) + '</b> · '
      + (target.callSid ? esc(target.callSid.slice(-6)) : '(no callSid)') + ' · ' + turnCountFrag(target) + ' · ' + dur
      + (isReal ? '' : (isPend ? ' <span class="tag b">unverified: Twilio reconciliation not confirmed</span>' : ' <span class="tag b">not a real call, synthetic timing</span>')) + '<br>' + statChips(target, turns, false)
      + '</div><div class="models">' + modelsHtml(sessModels(target)) + '</div>'
      + cascadeHtml(target, !(isReal || isPend))
      + (NR[target.callSid||''] ? '<div class="miss">no transcript received after speech stopped ×' + NR[target.callSid||''] + '(no result within the window does not mean rejected; late finals are processed normally and this flag is not rewritten)</div>' : '')
      + (LATE[target.callSid||''] ? '<div class="miss">late, outside the window ×' + LATE[target.callSid||''] + '(approximate link: a late final may belong to a new utterance, cannot be confirmed pair by pair)</div>' : '');
  }

  // ---- segment aggregates ----
  const aR = collectSegs(real), aP = collectSegs(pend), aS = collectSegs(sims);
  let aggH = aggHtml(aR, 'real call', false);
  aggH += aggHtml(aP, 'unverified (reconciliation incomplete, same basis as measured)', false);
  aggH += aggHtml(aS, 'simulated test (not a real call, synthetic timing)', true);
  const s2rows = [];
  for (const s of real) for (const t of (s.events||[]).filter(e => e.event==='turn')) {
    if (numok(t.llmFirstTokenMs)) s2rows.push({ s2: t.llmFirstTokenMs, pc: t.promptChars, rc: t.replyChars });
  }
  s2rows.sort((a, b) => b.s2 - a.s2);
  if (s2rows.length >= 3) {
    aggH += '<div class="sub" style="margin-top:.35rem">s2 slowest 3 turns:' + s2rows.slice(0, 3).map(r =>
      Math.round(r.s2) + 'ms (input ' + (r.pc ?? '?') + ' chars / output ' + (r.rc ?? '?') + ' chars)').join(' · ')
      + ' —correlation between segments needs more samples, no causal conclusion for now</div>';
  }
  document.getElementById('segagg').innerHTML = aggH || '<span class="sub">No per-turn samples yet.</span>';

  // ---- twilio calls (no cost display) ----
  const sessSids = new Set(ss.map(x => x.callSid).filter(Boolean));
  const unmatched = (d.twilioCalls || []).filter(c => !sessSids.has(c.sid));
  const shortUn = unmatched.filter(c => Number(c.duration) < 15).length;
  const recon = (d.twilioCalls && d.twilioCalls.length)
    ? '<div class="sub" style="margin-bottom:.3rem">Reconciliation: billing (from the earliest session, ≤31 days) ' + d.twilioCalls.length + ' calls · reconciliation confirmed ' + real.length + ' calls · '
      + (unmatched.length === 0 ? 'consistent'
        : (unmatched.length === shortUn
          ? 'no session billing ' + unmatched.length + ' calls, avg <15s(ended before connecting: rejected by the gate / dropped immediately)'
          : '<span class="err">no session billing ' + unmatched.length + ' calls, of which ' + (unmatched.length - shortUn) + ' calls ≥15s, need investigation</span>'))
      + '</div>' : '';
  document.getElementById('calls').innerHTML = recon + ((d.twilioCalls && d.twilioCalls.length)
    ? '<div class="tw"><table><tr><th>Time</th><th>Status</th><th>Duration</th></tr>' + d.twilioCalls.map(c =>
        '<tr><td>' + esc(fmtT(c.start)) + '</td><td>' + esc(c.status) + '</td><td>' + esc(c.duration) + 's</td></tr>').join('') + '</table></div>'
    : '<span class="sub">' + esc(d.twilioNote || 'No Twilio call records in the reconciliation window') + '</span>');

  rememberOpen();
  const renderSess = (s, mode) => {
    const isSim = mode === 'sim';
    const mtag = isSim ? '<span class="tag b">simulated</span>' : (mode === 'pend' ? '<span class="tag b">unverified</span>' : '<span class="tag m">measured</span>');
    const turns = (s.events||[]).filter(e => e.event==='turn');
    let evHtml = (s.events||[]).map(e => {
      if (e.event==='setup') return '<div class="ev">connect callSid=' + esc(e.callSid) + ' <span class="tag m">measured</span></div>';
      if (e.event==='turn') return '<div class="ev">turn ' + e.turn + 'turn · prompt ' + esc(e.promptChars ?? '?') + 'chars\\n'
        + 'first token ' + esc(e.llmFirstTokenMs) + 'ms · whole turn ' + esc(e.replyTotalMs) + 'ms · reply ' + esc(e.replyChars) + 'chars <span class="tag m">measured</span> · content not recorded\\n model ' + esc(modelsShort(e.models)) + '</div>';
      if (e.event==='speaker' || e.event==='tokens_played') return '<div class="ev">call level · ' + esc(e.event)
        + (e.who ? ' · ' + esc(e.who) + ' ' + esc(e.on) : '')
        + ' · arrived ' + esc(e.receivedAt ?? e.ts) + ' · turn/text chunk not confirmed'
        + (e.shape ? ' · field type ' + esc(JSON.stringify(e.shape)) : '') + '</div>';
      if (e.event==='boundary') return '<div class="ev">turn ' + esc(e.turn) + ' · ' + esc(e.boundary) + ' · #' + esc(e.sequence ?? e.eventSeq)
        + ' · epoch ' + esc(e.epochTime ?? e.serverTs) + 'ms · monotonic clock ' + esc(Math.round(e.monotonicTime ?? e.serverMonoMs)) + 'ms'
        + (e.chunkSeq != null ? ' · text chunk #' + esc(e.chunkSeq) + (e.last ? '(end marker)' : '') : '')
        + (e.utteranceId ? ' · ' + esc(String(e.utteranceId).slice(-8)) + ' → ' + esc(String(e.responseId || '').slice(-8)) : '')
        + '<span class="tag m">measured</span> · code boundary' + (e.source ? ' · ' + esc(e.source) : '') + '</div>';
      if (e.event==='partial_prompt') return '';
      if (e.event==='interrupt') return '<div class="ev">interrupt: turn ' + esc(e.turn) + ', ' + esc(e.durationUntilInterruptMs) + 'ms barge-in (playback progress, not reaction latency) <span class="tag m">measured</span></div>';
      if (e.event==='twilio_error') return '<div class="ev"><span class="err">Twilio error:' + esc(e.description) + '</span></div>';
      if (e.event==='call_cap_reached') return '<div class="ev">reached the 10 minute per-call limit, hanging up automatically <span class="tag m">measured</span></div>';
      if (e.event==='dtmf') return '<div class="ev">keypress ' + esc(e.digit) + ' <span class="tag m">measured</span></div>';
      if (e.event==='ws_close') return '<div class="ev">end: ' + esc(e.turns) + ' turns · ' + fmtMs(e.callDurationMs) + ' <span class="tag m">measured</span></div>';
      if (e.event==='ws_idle_timeout') return '<div class="ev">120 seconds without activity, ended by the server (watchdog) <span class="tag m">measured</span></div>';
      return '<div class="ev">' + esc(e.event) + ' ' + esc(JSON.stringify(e).slice(0,200)) + '</div>';
    }).join('');
    if (isSim) evHtml = evHtml.split('<span class="tag m">measured</span>').join(mtag);
    const dur = sessDur(s);
    return '<details data-sid="' + esc(s.id) + '"><summary>' + esc(fmtT(s.start)) + ' · ' + (s.callSid ? esc(s.callSid.slice(-6)) : '(no callSid)')
      + ' · ' + turnCountFrag(s) + ' · ' + dur + (mode === 'real' ? '' : ' ' + mtag) + '<br>' + statChips(s, turns, true)
      + '</summary><div class="models">' + modelsHtml(sessModels(s)) + '</div>' + cascadeHtml(s, isSim) + evHtml + '</details>';
  };
  document.getElementById('sessions').innerHTML = real.length ? real.map(s => renderSess(s, 'real')).join('')
    : '<span class="sub">No real call records yet.</span>';
  document.getElementById('pendsessions').innerHTML = pend.length ? pend.map(s => renderSess(s, 'pend')).join('')
    : '<span class="sub">None.</span>';
  document.getElementById('simsessions').innerHTML = sims.length ? sims.map(s => renderSess(s, 'sim')).join('')
    : '<span class="sub">None.</span>';
  restoreOpen();
  renderEvals(d.evals);
}
function renderEvals(evals) {
  const el = document.getElementById('evals');
  if (!evals || !evals.length) { el.innerHTML = '<span class="sub">No eval runs yet.</span>'; return; }
  el.innerHTML = evals.map(r =>
    '<div style="margin:.4rem 0"><b>' + esc(fmtT(r.ts)) + '</b> · ' + esc(r.model) + ' · set ' + esc(r.setVersion) + ' <span class="tag m">measured</span>'
    + '<div class="tw"><table><tr><th>prompt</th><th>first token ms</th><th>whole turn ms</th><th>reply chars</th><th>error</th></tr>'
    + (r.results||[]).map(x => '<tr><td>' + esc(x.id) + '</td><td>' + esc(x.firstTokenMs ?? '-') + '</td><td>' + esc(x.totalMs) + '</td><td>' + (x.replyChars == null ? '<span class="err">invalid (old stats bug)</span>' : esc(x.replyChars)) + '</td><td>' + (x.error ? '<span class="err">' + esc(x.error) + '</span>' : '-') + '</td></tr>').join('')
    + '</table></div></div>').join('');
}
document.getElementById('evalbtn').addEventListener('click', async (ev) => {
  const b = ev.target; b.disabled = true; b.textContent = 'eval running (about 20 s)…';
  try { const r = await fetch('/eval/run', { method: 'POST' }); if (!r.ok) throw new Error('HTTP ' + r.status); await r.json(); await load(); }
  catch (e) { alert('eval failed:' + e.message); }
  b.disabled = false; b.textContent = 'Run one eval';
});
load(); setInterval(load, 5000);
</script></body></html>`;

// ---- Twilio Voice Insights (post-call, read-only, platform-side numbers; evidence level E5) ----
// Aggregates only: counts and latency ms. No ids, no text. Cross-clock offset is never computed here (stays uncalibrated).
// Field names follow the live Insights API: Events (group conversation_relay, names stt_latency/tts_latency) and
// Call Summary (agent_session_summaries[0] with *_latency_ms {min,avg,max}, turns, interruptions, session_state).
const mma = (o) => (o && typeof o === "object" && Number.isFinite(o.min) && Number.isFinite(o.max)) ? { min: o.min, avg: Number.isFinite(o.avg) ? o.avg : null, max: o.max } : null;
export function summarizeInsights(events, finals, summary) {
  const ev = (events || []).filter((e) => e && e.group === "conversation_relay");
  const of = (name) => ev.filter((e) => e.name === name);
  const lat = (name) => of(name).map((e) => Number(((e.conversation_relay_data || {})[name] || {}).latency_ms)).filter(Number.isFinite);
  const stat = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return { n: s.length, min: s[0], median: medianOf(s), max: s[s.length - 1] }; }; // v5z9: conventional median (was upper-median, labeled median)
  const dup = (name) => { const t = of(name).map((e) => e.timestamp); return t.length - new Set(t).size; };
  const d = Number.isFinite(finals) && finals > 0 ? finals : null;
  // Platform events vs events we expect. This is NOT telemetry coverage: expected counts come from the page's own finals,
  // and interrupted replies legitimately have no tts_latency event.
  const match = (name, expected) => { const n = of(name).length; return { events: n, expected, missing: expected == null ? null : Math.max(0, expected - n), extra: expected == null ? null : Math.max(0, n - expected), duplicateTimestamps: dup(name), judgeable: expected != null }; };
  // Call Summary can carry several agent sessions (reconnect). Match each by session_id to the sessions seen in the Events; never mix them.
  const evSessions = [...new Set(ev.map((e) => (e.conversation_relay_data || {}).session_id).filter(Boolean))];
  const sms = summary && Array.isArray(summary.agent_session_summaries) ? summary.agent_session_summaries : [];
  const one = (sm) => ({
    sessionId: sm.session_id || null, matchedToEvents: !!sm.session_id && evSessions.includes(sm.session_id),
    sessionState: sm.session_state || null, turns: Number.isFinite(sm.turns) ? sm.turns : null,
    interruptions: sm.interruptions ? { agentToCustomer: sm.interruptions.agent_to_customer, customerToAgent: sm.interruptions.customer_to_agent } : null,
    networkMs: mma(sm.network_latency_ms), applicationMs: mma(sm.application_latency_ms), sttMs: mma(sm.stt_latency_ms), ttsMs: mma(sm.tts_latency_ms), firstAudioMs: mma(sm.time_to_first_audio_ms),
  });
  const summaries = sms.map(one);
  return {
    evidence: "E5", eventCount: ev.length, eventSessionIds: evSessions.length,
    stt: stat(lat("stt_latency")), tts: stat(lat("tts_latency")),
    match: { stt: match("stt_latency", d), tts: match("tts_latency", null), expectedBasis: "stt expected = number of finals seen by the page; tts expected unknown (an interrupted reply has no tts event), not judged missing" },
    summary: { state: summary && summary.processing_state || null, unavailable: summaries.length === 0 },
    summaries,
    sessionNote: evSessions.length > 1 || summaries.length > 1 ? "multiple sessions (possibly reconnects): listed per session, not merged; STT/TTS event and expected counts are whole-call, not split per session" : null,
    telemetryCoverage: { known: false, reason: "only the Twilio→Worker leg has a verifiable sent count (see relayLeg); the other sources (Worker→/live→page, browser local events, edge records) have no source-side sent count, so overall telemetry coverage is still unknown; platform event counts/final counts cannot substitute" },
    clock: "uncalibrated",
    caveat: "platform basis; stt_latency is provider metadata (about ±100 ms, up to ±250 ms), not equal to the transcript wait shown on the page (end of speech → final); Summary is session-level min/avg/max, not per turn",
  };
}

// Twilio -> Worker leg coverage: events Twilio's own Insights log says it emitted vs the same event kinds the Worker stored for that call.
// Emitted side is the Insights record (E5), not a wire-level send counter; scope is this one leg only.

// ---- Unified statistics / turn-count basis (v5z9) ----
// One median definition everywhere: conventional middle value (odd count:
// middle element; even count: mean of the two middle elements). Percentiles
// (P70/P95) stay nearest-rank and are labeled as such. Before v5z9 the obs
// page's pct(.,50) was nearest-rank and summarizeInsights' stat was
// upper-median, both shown as median: the 2026-11-04 call's E2E read 3393 vs
// 3457 ms respectively where the conventional median is 3425 ms.
export function medianOf(arr) {
  const s = (arr || []).filter((v) => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Turn-count basis: every ConversationRelay final
// transcript (prompt last=true) is one turn; an interrupt neither adds nor
// removes a turn; no semantic merging or dedup of repeated finals. The server
// already numbers turns that way at receipt (relay_final_received boundary,
// before LLM processing); the event=turn record is only written when
// processing completes, so it can be missing (call ended mid-processing,
// batch flush loss) — the page must count the trigger basis and show any
// record gap instead of silently undercounting. Evidence on live data:
// CAcc68c7 7 finals / 5 records, CA23be25 11 / 6, CAab9d49 1 / 0.
export function turnTriggerStats(s) {
  const evs = (s && s.events) || [];
  // NOTE: no named inner bindings here — esbuild keep-names rewrites them to __name(fn,...),
  // which breaks when this source is injected into the page via toString() (v5z9 incident).
  const finals = [...new Set(evs.filter((e) => e.event === "boundary" && e.boundary === "relay_final_received").map((e) => e.turn).filter((n) => Number.isFinite(n)))].sort((x, y) => x - y);
  const recs = [...new Set(evs.filter((e) => e.event === "turn").map((e) => e.turn).filter((n) => Number.isFinite(n)))].sort((x, y) => x - y);
  const endTurns = s && s.end && Number.isFinite(s.end.turns) ? s.end.turns : null;
  const missingRecords = finals.filter((n) => !recs.includes(n));
  // without any trigger-boundary basis (legacy calls) a record-only diff is not decidable, not a mismatch
  const extraRecords = finals.length ? recs.filter((n) => !finals.includes(n)) : [];
  return {
    finals: finals.length, turnRecords: recs.length, endTurns,
    hasTriggerBasis: finals.length > 0,
    count: finals.length ? finals.length : recs.length,
    basis: finals.length ? "finals" : (recs.length ? "records" : "none"),
    missingRecords, extraRecords,
    recMismatch: missingRecords.length > 0 || extraRecords.length > 0,
    endMismatch: endTurns != null && finals.length > 0 && endTurns !== finals.length,
  };
}

// Worker-side recording self-check: rec() calls counted at source
// (end.recordedEventsByType) minus source-dropped (budget) vs events actually
// stored. browser_net rows arrive via /netlog (a separate append path not
// counted in recBy) and are subtracted. missing > 0 means events entered
// rec() but never landed in storage (flush failure, post-finish writes);
// "0 dropped at source" alone never proved that. Legacy calls without
// recordedEventsByType return null (not decidable).
export function recSelfCheck(s) {
  const end = s && s.end;
  if (!end || !end.recordedEventsByType || typeof end.recordedEventsByType !== "object") return null;
  const recTotal = Object.values(end.recordedEventsByType).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const dropped = Number.isFinite(end.subrequestDropped) ? end.subrequestDropped : 0;
  const evs = (s && s.events) || [];
  const stored = evs.length;
  const external = evs.filter((e) => e && e.event === "browser_net").length;
  const missing = (recTotal - dropped) - (stored - external);
  return { recTotal, dropped, stored, external, missing };
}

// Per-call browser->Worker telemetry ledger summary (shared with the obs page via toString()).
export function ledgerSummary(e) {
  const seen = new Set(e.seqs || []); const gaps = [];
  for (let i = 1; i <= (e.max || 0); i++) if (!seen.has(i)) gaps.push(i);
  const stored = seen.size - (e.rejServer || 0);
  return { received: seen.size, max: e.max || 0, gaps: gaps.length, gapSeq: gaps.slice(0, 10), dup: e.dup || 0, rejectedAtWorker: e.rejServer || 0, stored,
    browserRejected: e.trej || 0, browserNetFail: e.tnet || 0, finalSeen: !!e.final,
    sentTotal: e.final ? e.max : null, // total send attempts is only known when the end-of-call send arrived
    note: e.final ? (gaps.length ? "missing " + gaps.length + " items(#" + gaps.slice(0, 10).join(",") + "): HTTP rejections self-reported by the sender " + (e.trej || 0) + ", network failures " + (e.tnet || 0) + ",the two added together" + ((e.trej || 0) + (e.tnet || 0) >= gaps.length ? "not less than" : "less than") + "gaps(" + ((e.trej || 0) + (e.tnet || 0) >= gaps.length ? "the gaps can be explained by self-reported failures, but not matched one by one" : "there are losses that were not self-reported") + ")" : "sequence contiguous, no gaps") : "final send absent at the end: tail send count unknown, only sequence gaps are checked" };
}
export function relayLegCoverage(insEvents, storedEvents) {
  const ev = (insEvents || []).filter((e) => e && e.group === "conversation_relay");
  const emitted = {}; const dupSrc = {};
  for (const name of ["start_of_customer_speech", "start_of_agent_speech", "prompt_sent", "interrupt"]) {
    const l = ev.filter((e) => e.name === name); emitted[name] = l.length; dupSrc[name] = l.length - new Set(l.map((e) => e.timestamp)).size;
  }
  const st = storedEvents || [];
  const recv = {
    start_of_customer_speech: st.filter((e) => e.event === "speaker" && e.who === "client" && e.on === true).length,
    start_of_agent_speech: st.filter((e) => e.event === "speaker" && e.who === "agent" && e.on === true).length,
    // v5z4: partials are persisted as first-of-utterance partial_prompt + one partial_summary (count) per utterance; legacy calls have only partial_prompt events
    prompt_sent: (st.some((e) => e.event === "partial_summary") ? st.filter((e) => e.event === "partial_summary").reduce((a, e) => a + (e.count || 0), 0) : st.filter((e) => e.event === "partial_prompt").length) + st.filter((e) => e.event === "boundary" && e.boundary === "relay_final_received").length,
    interrupt: st.filter((e) => e.event === "interrupt").length,
  };
  const kinds = Object.keys(emitted).map((k) => ({ kind: k, emitted: emitted[k], received: recv[k], missing: Math.max(0, emitted[k] - recv[k]), extra: Math.max(0, recv[k] - emitted[k]), duplicatesInSource: dupSrc[k] }));
  const E = kinds.reduce((a, k) => a + k.emitted, 0), M = kinds.reduce((a, k) => a + Math.min(k.emitted, k.received), 0);
  return {
    scope: "Twilio→the Worker leg (Relay events). Excludes Worker→/live→page, browser local volume, and edge records; the sent counts of those sources are unknown",
    emittedBasis: "platform record = number of events recorded by Twilio Insights (E5), not a wire send count; app record = number stored by the Worker. Quantity comparison only, with no stable ID item matching, so one loss and one duplicate cancelling out cannot be excluded; the cause of missing items cannot be determined",
    kinds, totalEmitted: E, totalMatched: M, missing: kinds.reduce((a, k) => a + k.missing, 0), extra: kinds.reduce((a, k) => a + k.extra, 0),
    ratio: E ? M / E : null, decidable: E > 0,
  };
}
