import { sessionOk, GATE_PAGE, PAGE_BUILD, modelsInfo } from './_lib.js';

const CALL_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voice call · live chain</title>
<style>
:root{--bg:#17181c;--card:#1e2026;--line:#2b2e36;--txt:#e8e6e1;--dim:#a8a49b;
--acx:#63b8a2;--acline:#2e7d6b;--wait:#d9b76a;--done:#7cc7b1;--fail:#d98c84}
body{margin:0 auto;background:var(--bg);color:var(--txt);font-family:system-ui,-apple-system,"PingFang SC",sans-serif;padding:18px 14px;max-width:560px}
h1{font-size:1.05rem;margin:0 0 2px;font-weight:650}
.sub{color:var(--dim);font-size:.78rem;margin-bottom:12px;line-height:1.6}
.sub a{color:var(--acx);text-decoration:none}
.models{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:0 0 18px}
.mrow{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:.74rem;line-height:1.45}
.mrow+.mrow{border-top:1px solid var(--line)}
.mk{flex:none;width:5em;color:var(--dim);font-size:.68rem}
.mv{flex:1;color:var(--txt);overflow-wrap:break-word}
.msrc{flex:none;font-size:.62rem;border-radius:4px;padding:1px 6px;white-space:nowrap}
.msrc.ok{background:rgba(99,184,162,.15);color:#7cc7b1}
.msrc.warn{background:rgba(211,180,115,.14);color:#d3b473}
.msrc.bad{background:rgba(217,140,132,.13);color:#d98c84}
.tag{font-size:.62rem;border-radius:4px;padding:1px 6px;vertical-align:middle}
.real{background:rgba(99,184,162,.15);color:#7cc7b1}
.approx{background:rgba(211,180,115,.14);color:#d3b473}
.net2{color:var(--dim);font-size:.66rem;margin:0 0 8px;line-height:1.6}
.np{margin:4px 0 10px;font-size:.68rem;line-height:1.55}
.npg{border:1px solid var(--line);border-radius:8px;margin:6px 0;overflow:hidden}
.nph{padding:5px 9px;font-weight:600}.nph small{display:block;color:var(--dim);font-weight:400;font-size:.62rem}
.npd{display:flex;border-top:1px solid var(--line)}.npd>div{flex:1;padding:5px 9px;min-width:0}.npd>div+div{border-left:1px solid var(--line)}
.npt{color:var(--dim);font-size:.62rem;margin-bottom:2px}
.npi{display:flex;justify-content:space-between;gap:6px;padding:1px 0}.npi span:first-child{color:var(--dim)}
.npn{padding:4px 9px;color:var(--dim);border-top:1px solid var(--line);font-size:.62rem;line-height:1.5}
@media(max-width:460px){.npd{flex-direction:column}.npd>div+div{border-left:none;border-top:1px solid var(--line)}}
.tag.pend{background:rgba(150,160,175,.14);color:#aab}.tag.na{background:rgba(150,160,175,.14);color:#aab}
.cnotes{font-size:.6rem;color:var(--dim);line-height:1.55;margin:6px 0 0}.cnotes b{color:var(--txt);font-weight:600}
.e2r{padding:1px 0}.e2k{display:inline-block;min-width:6.2em;color:var(--dim)}.e2n{opacity:.7;font-size:.6rem}
.e2e{font-size:.66rem;color:var(--dim);margin:8px 0 2px;line-height:1.5}.e2e b{color:var(--txt);font-weight:600}
.chain{display:flex;align-items:flex-start;margin:2px 0 0}
.chain .node{flex:none;width:12.5%;padding-top:4px}
.cedge{flex:1;min-width:8px;position:relative;align-self:stretch}
.cedge .eline{position:absolute;left:0;right:0;top:21px;height:2px;background:var(--line)}
.cedge .eline::after{content:"";position:absolute;right:-1px;top:-3px;border-left:7px solid var(--line);border-top:4px solid transparent;border-bottom:4px solid transparent}
.cedge.on .eline{background:repeating-linear-gradient(90deg,var(--done) 0 6px,rgba(124,199,177,.15) 6px 12px);animation:dashf .5s linear infinite}
.cedge.on .eline::after{border-left-color:var(--done)}
@keyframes dashf{to{background-position:12px 0}}
.cedge .chip{display:none;position:absolute;left:50%;top:10px;transform:translateX(-50%);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:2px 3px;font-size:.5rem;line-height:1.45;text-align:center;color:var(--dim);min-width:36px;max-width:19vw;z-index:1}
.cedge .chip .cv{color:var(--txt);font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
.chainwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.chainin{min-width:0;position:relative}
.node .dot svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.node{display:flex;flex-direction:column;align-items:center;position:relative}
.node .dot{width:34px;height:34px;border-radius:50%;background:var(--card);border:2px solid var(--line);
display:flex;align-items:center;justify-content:center;font-size:.95rem;font-weight:650;color:var(--dim);transition:all .25s}
.node .nm{font-size:.6rem;margin-top:5px;color:var(--dim);text-align:center;line-height:1.3}
.node .st{font-size:.58rem;margin-top:3px;min-height:26px;white-space:nowrap;text-align:center;line-height:1.45;font-variant-numeric:tabular-nums;color:var(--dim)}
.node.st-off{opacity:.6}
.node.st-on{opacity:1}
.node.st-on .dot{border-color:var(--done);color:var(--done);box-shadow:0 0 10px -2px var(--done);animation:breath 1.1s ease-in-out infinite alternate}
.node.hold .dot{animation:none;box-shadow:none;border-style:dashed}
.node.st-on .nm{color:var(--txt)}
.node.st-on .st{color:var(--done)}
@keyframes breath{from{transform:scale(1)}to{transform:scale(1.1)}}
.detail{margin-top:14px;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--ac,#3a4150);border-radius:12px;padding:10px 14px}
.detail .t{font-size:.85rem;font-weight:650}
.detail .m{color:var(--dim);font-size:.72rem;margin-top:3px;line-height:1.55}
.bar{height:6px;border-radius:3px;background:#262a32;margin-top:8px;overflow:hidden}
.bar>i{display:block;height:100%;border-radius:3px;background:var(--ac);width:0%;transition:width .1s linear}
.flow>i{animation:flow 0.7s linear infinite}
@keyframes flow{0%{width:8%}50%{width:88%}100%{width:8%}}
.controls{margin:6px 0 10px;display:flex;gap:10px;position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0}
.logd{margin-top:14px}.logd summary{color:var(--dim);font-size:.7rem;cursor:pointer;padding:4px 0}
.sec{margin-top:6px}
button{font-size:.95rem;padding:.55rem 1.4rem;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--txt);cursor:pointer}
button:disabled{opacity:.35;cursor:default}
#call{background:var(--acline);border-color:var(--acline);color:#fff;font-weight:650}
.events{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.events .h{font-size:.72rem;color:var(--dim);margin-bottom:5px}
.ev{font:11.5px/1.75 ui-monospace,monospace;color:#c4c1ba;white-space:pre-wrap;max-height:9rem;overflow:auto}
.evm{color:var(--acx)} .evw{color:#d3b473} .eve{color:#d98c84}
.tlcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin-top:12px;font-size:.68rem;color:var(--dim);line-height:1.7}
.tlcard .tlh{font-weight:650;color:var(--txt);margin-bottom:4px}
.tlcard .tlf{margin-top:5px;opacity:.85}
.tlr{display:flex;gap:8px;padding:1.5px 0}
.tlt{flex:none;width:58px;text-align:right;font-variant-numeric:tabular-nums;color:var(--txt)}
.tll{flex:1;overflow-wrap:break-word}
.tlc{font-size:.6rem;border:1px solid var(--line);border-radius:4px;padding:0 4px;white-space:nowrap}
.tln{opacity:.7}
.legend{margin-top:14px;color:var(--dim);font-size:.68rem;line-height:1.65}
.demo{background:rgba(211,180,115,.14);color:#d3b473;font-size:.68rem;border-radius:6px;padding:2px 8px;margin-left:8px}
</style></head><body>
<h1>Voice call · live chain<span id="demotag" class="demo" style="display:none">demo data</span></h1>
<div class="sub">Q&A in English · each call auto-hangs up after 10 minutes · <a href="/obs">Observability →</a> · version ${PAGE_BUILD}</div>
<div class="controls"><button id="call">Call</button><button id="hangup" disabled>Hang up</button></div>
<div class="chainwrap"><div class="chainin">
<div class="chain" id="chain">
  <div class="node" data-s="1"><div class="dot"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></div><div class="nm">Microphone</div><div class="st" id="st1"></div></div>
  <div class="cedge" id="ce1"><div class="eline"></div><div class="chip"><span class="cv" id="ev1v">—</span><br>RTT·<span id="ev1t">measured</span></div></div>
  <div class="node" data-s="2"><div class="dot"><svg viewBox="0 0 24 24"><path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 7v10"/><path d="M20 10v4"/></svg></div><div class="nm">STT</div><div class="st" id="st2"></div></div>
  <div class="cedge" id="ce2"><div class="eline"></div></div>
  <div class="node" data-s="3"><div class="dot"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg></div><div class="nm">WS in</div><div class="st" id="st3"></div></div>
  <div class="cedge" id="ce3"><div class="eline"></div></div>
  <div class="node" data-s="4"><div class="dot"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg></div><div class="nm">LLM</div><div class="st" id="st4"></div></div>
  <div class="cedge" id="ce4"><div class="eline"></div></div>
  <div class="node" data-s="5"><div class="dot"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/><path d="M12 11v2"/></svg></div><div class="nm">WS out</div><div class="st" id="st5"></div></div>
  <div class="cedge" id="ce5"><div class="eline"></div></div>
  <div class="node" data-s="6"><div class="dot"><svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9v2M12 8v4M16 9v2"/></svg></div><div class="nm">TTS</div><div class="st" id="st6"></div></div>
  <div class="cedge" id="ce6"><div class="eline"></div></div>
  <div class="node" data-s="7"><div class="dot"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg></div><div class="nm">Speaker</div><div class="st" id="st7"></div></div>
</div>
</div></div>
<div class="e2e" id="e2e"></div>
<div class="e2e" id="insum" style="display:none"></div>
<div class="detail" id="detail" style="--ac:#3a4150">
  <div class="t" id="dt">Standby</div><div class="m" id="dm">Click "Call" to start</div><div class="m" id="livehealth" style="display:none;margin-top:6px"></div>
  <div class="bar" id="db"><i style="--ac:#3a4150"></i></div>
</div>
<div class="sec">__MODELS_CARD__
<div class="net2" id="net2">uplink RTT — · jitter — · loss — · clock offset —</div>
<div class="np" id="netpanel"></div></div>



<details class="logd" id="nd"><summary>Chain node notes (collapsed by default)</summary><div class="legend">Chain diagram: seven nodes = the physical path; the two /ws nodes are the two directions of one bidirectional WebSocket. Only two colors:<b style="color:var(--done)">green</b>=working · <b style="color:var(--dim)">gray</b>=not working. Microphone = local volume; speaker = local downlink volume (approximate, not what the ear hears), Relay speaker events are corroboration only, and a gap between the two is marked "needs calibration". Twilio STT and Twilio TTS have no separate start/end events, so a green light is an inference: STT runs from local voice onset until the transcript returns, "end of speech → return" is a merged wait (endpoint silence, STT, return trip), not STT latency; TTS is a merged inference from text sent → Relay starts speaking, not TTS internal time. /ws in, LLM, /ws out are server timestamp intervals (server clock), the cross-clock offset needs calibration, and they are not summed. "Local end of speech → downlink volume detected" is an approximation on the browser clock, meaning only that the browser detected sound. The milliseconds under a gray node are measured durations: W points = server same clock <span class="tag real">measured</span>;B points = browser volume inference <span class="tag approx">approx</span>. Stalled events, ended calls and waits left unfinished after an interruption no longer stay green. Display only, changes no call behavior.</div><div class="cnotes" id="cnotes"></div></details>
<details class="logd" id="tld"><summary>Per-event timeline of this turn (collapsed by default)</summary><div class="tlcard" id="tlcard" style="display:none"><div class="tlh" id="tlh"></div><div id="tl"></div>
<div class="tlf" id="tlf">each row = one event actually observed (relative to the first observed event of this turn); adjacent difference <span class="tag real">measured</span>=same clock · <span class="tag approx">approx</span>=cross-clock conversion; events not observed do not appear and are not filled in by estimation.</div></div></details>
<details class="logd" id="logd"><summary>Detailed log (collapsed by default)</summary><div class="events"><div class="h">Recent events</div><div class="e2n">Evidence level tags: E1 = direct local browser observation (microphone/downlink volume, approximate) · E2 = Relay real-time notification (time the Worker received it) · E3 = derived within one clock · E4 = cross-clock approximation (no value shown when uncalibrated) · E5 = Twilio Insights post-call platform record. Rows without a tag are the page's own status notes.</div>
<div class="ev" id="ev"></div></div>
</details>

<script src="https://cdn.jsdelivr.net/npm/@twilio/voice-sdk@2/dist/twilio.min.js"></script>
<script src="/sdk-observer.js?v=20261022-1"></script>
<script>
const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const nodes = {}; document.querySelectorAll('.node').forEach(n => nodes[n.dataset.s] = n);
const evLog = (html, ev) => { const t = new Date().toLocaleTimeString("en-GB",{timeZone:"UTC",hour12:false});
  const el = $('ev'); el.innerHTML = t + ' ' + html + (ev ? ' <span class="tag na" title="evidence level:' + ({E1:'direct local observation',E2:'Relay real-time notification',E3:'derived on one clock',E4:'cross-clock approximation',E5:'Insights platform record'})[ev] + '">' + ev + '</span>' : '') + '\\n' + el.innerHTML; };
const fmtS = (ms) => (ms/1000).toFixed(2) + 's';

// ---- seven-node, four-state chain (10/31 POC baseline) ----
// States: idle(gray) / wait (yellow, ticking elapsed) / done (green, segment ms) / fail (red).
// Driven only by observed events: B points from SDK volume (approx), W points
// from /ws server boundary stamps (same-clock measured). No inferred events.
const NN = {1:'Microphone',2:'STT(Twilio·Deepgram)',3:'WS in',4:'LLM',5:'WS out',6:'TTS(Twilio·ElevenLabs)',7:'Speaker'};
const NM = {1:'Browser · microphone',2:'Twilio STT',3:'/ws server · inbound',4:'LLM Workers AI',5:'/ws server · outbound',6:'Twilio TTS',7:'Browser · speaker'};
let nst = {};
// Display-only hold: a stage that is lit (or passes) for less than MIN_HOLD_MS stays visibly marked for MIN_HOLD_MS so the eye can follow the chain.
// It is NOT a duration: the text says passed / below stamp resolution and display held, and the measured ms stays separate.
const MIN_HOLD_MS = 700, RES_MS = 5;
let holdUntil = {}, holdInfo = {}, litSince = {};
let chainGen = 0;
function resetChain() { chainGen++; nst = {}; holdUntil = {}; holdInfo = {}; litSince = {}; for (let i = 1; i <= 7; i++) nst[i] = { st: 'idle' }; renderChain(); }
function setNode(n, st, o) {
  o = o || {};
  nst[n] = { st: st, since: o.since != null ? o.since : Date.now(), ms: o.ms != null ? o.ms : null,
    approx: !!o.approx, na: !!o.na, cx: o.cancelled || null, note: o.note || '', ttft: o.ttft != null ? o.ttft : null };
  if ((n === 3 || n === 5) && st === 'done' && o.ms != null && o.ms < 150) { holdUntil[n] = Date.now() + MIN_HOLD_MS; holdInfo[n] = { ms: o.ms }; }
  renderChain();
}
let relayClientOn = false, relayAgentOn = false; // ConversationRelay speaker-events state (anchor for node 1 / node 7); null/unparsed events leave it unchanged
function lit(i) { return litCore(i) || (!stallMode && inCallOrDemo() && (holdUntil[i] || 0) > Date.now()); }
function inCallOrDemo() { return inCall || DEMO; }
function litCore(i) {
  // Two states only. Green = this stage is working by the stated basis:
  // 1 mic = local volume (Relay clientSpeaking only corroborates); 2 STT = INFERRED streaming, local speech start until the transcript returns (merged wait, not STT latency);
  // 3/4/5 = server-stamped start with the end event still outstanding; 6 TTS = INFERRED merged, text sent until Relay agent speaking / local playback; 7 speaker = local playback (approx), Relay agentSpeaking corroborates.
  if (!inCall && !DEMO) return false;
  const s = nst[i] || { st: 'idle' };
  const n1 = nst[1] || { st: 'idle' };
  if (i === 1) return s.st === 'wait';
  if (i === 2) return !stallMode && (s.st === 'wait' || (n1.st === 'wait' && !suspectSpeech));
  if (i === 6) return s.st === 'wait' && !stallMode && !relayAgentOn;
  if (i === 7) return s.st === 'wait';
  return s.st === 'wait' && !stallMode;
}
function leadWait() { let w = 0; for (let i = 1; i <= 7; i++) if (nst[i] && nst[i].st === 'wait') w = i; return w; }
function renderChain() {
  const now = Date.now();
  for (let i = 2; i <= 6; i++) {
    const c = litCore(i);
    if (c && !litSince[i]) litSince[i] = now;
    else if (!c && litSince[i]) { const d = now - litSince[i]; if (d < MIN_HOLD_MS && !stallMode && inCallOrDemo() && nst[i] && nst[i].st !== 'idle' && nst[i].st !== 'fail') { holdUntil[i] = litSince[i] + MIN_HOLD_MS; holdInfo[i] = { ms: d }; } litSince[i] = 0; }
  }
  const notes = [];
  for (let i = 1; i <= 7; i++) {
    const el = nodes[i]; if (!el) continue;
    const s = nst[i] || { st: 'idle' };
    const on = lit(i);
    const core = litCore(i);
    el.className = 'node st-' + (on ? 'on' : 'off') + (on && !core ? ' hold' : '');
    const stEl = $('st' + i);
    let base = '';
    if (s.st === 'done') base = (s.na ? 'not linked' : (s.ms != null ? (s.ms < RES_MS ? 'passed<br>below stamp resolution' : Math.round(s.ms) + 'ms') : 'passed')) + (s.approx ? '<br>approx' : '') + (s.note ? '<br>' + s.note : '');
    else if (s.st === 'fail') base = 'failed' + (s.note ? '<br>' + s.note : '');
    const real = !DEMO;
    const n1 = nst[1] || { st: 'idle' };
    const hold = on && !core;
    if (hold) {
      const hi = holdInfo[i] || {};
      const m = i === 3 || i === 5 ? ((s.ms != null && s.ms >= RES_MS) ? 'passed ' + Math.round(s.ms) + 'ms' : 'passed<br>below stamp resolution') : (i === 6 ? 'inferred · merged passed' : 'passed ' + (hi.ms != null ? fmtS(hi.ms) : ''));
      stEl.innerHTML = m + '<br><span style="opacity:.8">display held, not a duration</span>';
    } else if (on) {
      if (i === 1) stEl.innerHTML = 'working<br>local sound<br>' + (real ? (relayClientOn ? 'Relay confirmed' : 'Relay not confirmed') : '');
      else if (i === 2) stEl.innerHTML = n1.st === 'wait' ? 'working<br>inferred · streaming<br>speaking' : 'working<br>inferred · merged wait<br>end of speech → return ' + fmtS(Math.max(0, now - s.since));
      else if (i === 6) stEl.innerHTML = 'working<br>inferred · merged<br>text sent → speaking starts ' + fmtS(Math.max(0, now - s.since));
      else if (i === 7) stEl.innerHTML = 'working<br>local playback approx<br>' + (real ? (relayAgentOn ? 'Relay speaking' : 'Relay not confirmed') : '');
      else stEl.innerHTML = 'working<br>' + fmtS(Math.max(0, now - s.since)) + (i === 4 && s.ttft != null ? '<br>first token ' + fmtS(s.ttft) + ' arrived, stream in progress' : '') + (stallMode && i >= 2 && i <= 6 ? '<br>stalled' : '');
    } else if (i === 7 && relayAgentOn) stEl.innerHTML = 'Relay speaking<br>not detected locally<br>needs calibration';
    else if (i === 1 && relayClientOn) stEl.innerHTML = 'Relay reports speech<br>no local volume';
    else if (s.st === 'wait') stEl.innerHTML = (stallMode && i >= 2 && i <= 6 ? 'events stalled<br>' : '') + 'waiting for next event<br>status unconfirmed<br>waited ' + fmtS(Math.max(0, now - s.since));
    else stEl.innerHTML = base;
    // Node shows only a short state; the long wording (basis, approx, hold) goes to the notes line below the chain.
    const full = stEl.innerHTML;
    let sh = '';
    if (hold) sh = 'passed<br>display held';
    else if (on && i === 2) sh = n1.st === 'wait' ? (attrSpeechStartTs != null && attrSpeechStartTs === bSpeechStartTs ? 'final arrived<br>local sound continues' : 'receiving<br>inferred') : 'transcript wait<br>' + fmtS(Math.max(0, now - (bSpeechEndTs != null ? bSpeechEndTs : s.since)));
    else if (on) sh = 'working' + (i === 6 ? '<br>inferred' : (i === 4 && s.ttft != null ? '<br>stream in progress' : ''));
    else if (s.st === 'done' && i === 1 && s.ms != null) sh = 'speech<br>' + fmtS(s.ms);
    else if (s.st === 'done' && i === 2 && s.ms != null) sh = 'transcript wait<br>' + fmtS(s.ms);
    else if (s.st === 'done' && s.cx) sh = 'cancelled' + (s.ms != null ? '<br>' + Math.round(s.ms) + 'ms' : '');
    else if (s.st === 'done') sh = s.na ? 'not linked' : (s.ms != null && s.ms >= RES_MS ? Math.round(s.ms) + 'ms' : 'passed') + (s.approx ? '<br>approx' : '');
    else if (s.st === 'fail') sh = 'failed';
    else if (i === 7 && relayAgentOn) sh = 'Relay<br>speaking';
    else if (i === 1 && relayClientOn) sh = 'Relay<br>speech';
    else if (s.st === 'wait') sh = stallMode && i >= 2 && i <= 6 ? 'stalled<br>waiting' : 'waiting';
    stEl.innerHTML = sh;
    if (full) notes.push('<b>' + NN[i] + '</b> ' + full.replace(/<br>/g, ' ').replace(/<span[^>]*>|<\\/span>/g, ''));
  }
  $('cnotes').innerHTML = notes.join('<br>');
  renderE2e();
  for (let k = 1; k <= 6; k++) $('ce' + k).classList.toggle('on', litCore(k) || litCore(k + 1));
  let lead = 0; for (let i = 1; i <= 7; i++) if (litCore(i)) lead = i; // held (display-only) stages never headline the card
  if (!lead && stallMode) { const w = leadWait(); if (w >= 2 && w <= 6) lead = w; } // stalled: card explains, but no light
  const bar = $('db');
  if (!inCall && !DEMO) { $('dt').textContent = 'Standby'; $('dm').textContent = 'Click "Call" to start'; $('detail').style.setProperty('--ac', '#3a4150'); bar.className = 'bar'; bar.querySelector('i').style.cssText = '--ac:#3a4150;width:0%'; }
  else if (lead) {
    const stalledLead = stallMode && lead >= 2 && lead <= 6;
    $('dt').textContent = lead === 2 && !stalledLead ? ((nst[1] && nst[1].st === 'wait') ? (attrSpeechStartTs != null && attrSpeechStartTs === bSpeechStartTs ? 'final arrived; sound still detected locally' : 'STT receiving (inferred)') : 'STT transcript wait (inferred)') : NM[lead] + (stalledLead ? ' events stalled…' : lead === 1 ? ' working: you are speaking' : lead === 7 ? ' working: playing' : lead === 6 ? ' working (inferred)' : ' working');
    $('dm').innerHTML = stalledLead ? ('server events not updated for ' + Math.round((liveLost ? STALL_MS : STALL_HARD_MS) / 1000) + ' s' + (liveLost ? 'and the observation channel is lost' : '') + ':status unconfirmed, the waiting timer no longer indicates progress; the call may still be connected, you can keep talking or hang up')
      : (quietMode && lead >= 2 && lead <= 6) ? ('waiting: server has had no new event for ' + Math.round(STALL_MS / 1000) + ' s, the request for this stage was sent and its end event has not arrived (for example a slow LLM first token); status unconfirmed, judged stalled only if there is still no event at ' + Math.round(STALL_HARD_MS / 1000) + ' s')
      : lead === 1 ? 'local microphone volume (approximate); Relay clientSpeaking is corroboration only' : lead === 7 ? 'local downlink volume (approximate,≠physical sound output); Relay agentSpeaking is corroboration only' : lead === 2 ? 'inferred: from local voice onset until the transcript returns the stage is working as a stream; end of speech → return is a merged wait, not STT latency' : lead === 6 ? 'inferred: text sent → Relay starts speaking, merged, not TTS internal time' : 'waiting for the real event of this stage, not filled in by estimation';
    const acc = lit(lead) ? 'var(--done)' : '#3a4150';
    $('detail').style.setProperty('--ac', acc);
    if (lead === 1) { bar.className = 'bar'; bar.querySelector('i').style.cssText = '--ac:' + acc + ';width:' + Math.min(100, inVol * 220) + '%'; }
    else if (lead === 7) { bar.className = 'bar'; bar.querySelector('i').style.cssText = '--ac:' + acc + ';width:' + Math.min(100, outVol * 220) + '%'; }
    else { bar.className = 'bar flow'; bar.querySelector('i').style.cssText = '--ac:' + acc + ''; }
  } else {
    $('dt').textContent = inCall ? 'In call' : 'Standby';
    $('dm').textContent = inCall ? 'Please speak' : 'Click "Call" to start';
    $('detail').style.setProperty('--ac', '#3a4150');
    bar.className = 'bar'; bar.querySelector('i').style.cssText = '--ac:#3a4150;width:0%';
  }
}

function renderE2e() {
  const el = $('e2e'); if (!el) return;
  const now = Date.now();
  const n1 = nst[1] || { st: 'idle' }, n2 = nst[2] || { st: 'idle' };
  const row = (k, v, tg, note) => '<div class="e2r"><span class="e2k">' + k + '</span><b>' + v + '</b> <span class="tag ' + tg + '">' + (tg === 'pend' ? 'pending' : 'approx') + '</span> <span class="e2n">' + note + '</span></div>';
  let speak = row('You speak', '—', 'pend', 'local volume start/end; not counted as STT time'), wait = row('transcript wait', '—', 'pend', 'end of speech → final returned; merged wait, not STT internal time'), e2e = row('end of speech → downlink volume', '—', 'pend', 'sound detected locally, not STT/TTS internal time');
  if (n1.st === 'wait' && bSpeechStartTs != null) speak = row('You speak', fmtS(Math.max(0, now - bSpeechStartTs)) + ' in progress', 'approx', 'local volume start/end; not counted as STT time');
  else if (bSpeechStartTs != null && bSpeechEndTs != null) speak = row('You speak', fmtS(bSpeechEndTs - bSpeechStartTs), 'approx', 'local volume start/end; not counted as STT time');
  if (n2.st === 'wait' && n1.st !== 'wait' && bSpeechEndTs != null) wait = row('transcript wait', fmtS(Math.max(0, now - bSpeechEndTs)) + ' in progress', 'approx', 'end of speech → final returned; merged wait, not STT internal time');
  else if (n2.st === 'done' && n2.ms != null) wait = row('transcript wait', fmtS(n2.ms), 'approx', 'end of speech → final returned; merged wait, not STT internal time');
  else if (n2.st === 'done' && n2.ms == null) wait = row('transcript wait', 'not measured', 'pend', 'final came before local end of speech or there is no volume evidence: not estimated, not pending');
  if (bSpeechEndTs != null && bPlayStartTs != null && bPlayStartTs >= bSpeechEndTs) e2e = row('end of speech → downlink volume', fmtS(bPlayStartTs - bSpeechEndTs), 'approx', 'sound detected locally, not STT/TTS internal time; not additive with the two items above');
  el.innerHTML = speak + wait + e2e;
}
// ---- pipeline state ----
let speaking = false, playActive = false;
let orphanPlayTurn = null;    // playback orphaned by a SERVER-CONFIRMED round switch (interrupt event / new-utterance transcript takeover): its B4 settles to the old turn, never the new timeline
let playOwnerTurn = null;     // the turn that was current when this playback episode STARTED (volume-inferred); its B4 settles only there, never onto a round that took over later
let suspectSpeech = false;      // local mic volume during playback: suspected speech only, never resets the chain; a server interrupt or new-utterance transcript confirms and switches rounds
let attrSpeechStartTs = null; // utterance start already attributed to a turn row; a second final for the SAME episode is a shared continuation, not a residual
let lastRelayEventTs = null, stallMode = false, quietMode = false, lastLiveMsgTs = null, liveLost = false, liveSeq = { seen: new Set(), dup: 0, total: null, failed: null }, liveSeqReport = null; // lastLiveMsgTs: ANY message on the /live observation channel (incl. pong); separate from relay-event stall
let lastAboveTs = 0, outBelowSince = null;
let inVol = 0, outVol = 0, inCall = false, liveWs = null, callSid = null;
// B points (browser wall clock): volume-inferred, approximate by design.
let bSpeechStartTs = null, bSpeechEndTs = null, bPlayStartTs = null, bPlayEndTs = null;
let playEpisodeStartTs = null, playEpisodeChain = 0; // playback episode identity: an end may only be shown on the chain that owned its start
let bnd = {};                 // current-turn server boundary stamps from /live {name:{mono,epoch}}
let curUtteranceId = null, curResponseId = null;
// obs2: network + clock sync
let rtc = null;
let clkOff = null, clkRtt = null;
let pingTimer = null;

// ---- per-turn browser telemetry (metadata only: timestamps, no content) ----
let cur = null; const turnRows = new Map();
let browserSessionId = null;
let teleFail = 0, teleSeq = 0, teleRej = 0, teleNet = 0; // per-call ledger: teleSeq = send attempts, teleRej = HTTP non-ok, teleNet = network error/beacon refusal
function teleFetch(body) {
  fetch('/telemetry', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then(r => { if (!r.ok) { teleFail++; teleRej++; } })
    .catch(() => { teleFail++; teleNet++; });
}
function teleSend(useBeacon, isFinal) {
  if (!cur || !cur.turn) return;
  const sid = DEMO ? 'DEMO-LOCAL' : callSid;
  if (!sid) return;
  const body = JSON.stringify({ tseq: ++teleSeq, trej: teleRej || undefined, tnet: teleNet || undefined, tfinal: isFinal ? true : undefined, callSid: sid, v: 2, failedSends: teleFail || undefined, sim: DEMO, ua: navigator.userAgent,
    browserSessionId, pageBuild: '${PAGE_BUILD}',
    clkOffsetMs: clkOff ?? undefined, clkRttMs: clkRtt ?? undefined,
    rtcRttMs: rtc && rtc.rtt != null ? rtc.rtt : undefined, rtcJitterMs: rtc && rtc.jitter != null ? rtc.jitter : undefined,
    rtcLostPkts: rtc && rtc.lost != null ? rtc.lost : undefined,
    rtcMosX100: rtc && rtc.mos != null ? Math.round(rtc.mos * 100) : undefined,
    rtcCodec: rtc && rtc.codec || undefined, ...cur });
  if (useBeacon && navigator.sendBeacon) { try { if (!navigator.sendBeacon('/telemetry', body)) { teleFail++; teleNet++; } } catch { teleFail++; teleNet++; } }
  else teleFetch(body);
}
function saveTurn(turn, patch) {
  if (!Number.isInteger(turn) || turn < 1) return;
  let row = turnRows.get(turn);
  if (!row) { row = { turn }; turnRows.set(turn, row); }
  Object.assign(row, patch);
  const current = cur; cur = row; teleSend(false); cur = current;
}

const IN_TH = 0.06, OUT_TH = 0.05, END_MS = 500, PLAY_END_MS = 800;

// ---- volume tick: B1/B2 (mic) and B3/B4 (speaker) ----
// B2/B4 are stamped at the last above-threshold frame (estimated physical end),
// detection happens after the quiet window; both labeled approximate.
function tick(now) {
  if (inVol > IN_TH) {
    lastAboveTs = now;
    if (!speaking) {
      speaking = true;
      bSpeechStartTs = now; bSpeechEndTs = null;
      if (playActive) {
        // mic volume during playback: suspected speech only — keep the playing chain intact
        suspectSpeech = true;
        evLog('microphone sound detected during playback: suspected speech (unconfirmed), keeping the current chain; waiting for a server interrupt or a new transcript to confirm', 'E1');
      } else if (!leadWait() || nst[1].st !== 'wait') {
        tl = []; bnd = {}; bPlayStartTs = null; bPlayEndTs = null; resetChain();
      }
      setNode(1, 'wait', { since: now });
      tlPush('b', now, 'B1 speech start detected', suspectSpeech ? 'volume above threshold, approximate, suspected (during playback, unconfirmed)' : 'volume above threshold, approximate');
    }
  } else if (speaking && now - lastAboveTs > END_MS) {
    speaking = false;
    bSpeechEndTs = lastAboveTs;
    setNode(1, 'done', { ms: Math.max(0, bSpeechEndTs - bSpeechStartTs), approx: true, note: suspectSpeech ? 'suspected speech, unconfirmed' : 'speech duration' });
    if (suspectSpeech) {
      // suspected speech ended unconfirmed: no STT wait, no round switch
      suspectSpeech = false;
      evLog('suspected speech ended, not confirmed by the server: no turn switch, no waiting for a transcript', 'E1');
    } else if (attrSpeechStartTs === bSpeechStartTs) {
      // a final for this same volume episode already arrived before the local mic end: do not open a second, never-resolving wait.
      // The speech end is recorded on the attributed turn; a later final of the same episode is handled as a continuation candidate.
      if (cur) cur.speechEndTs = bSpeechEndTs;
      evLog('final arrived before local end of speech: the transcript wait of this turn has ended, no new wait is opened (local end-of-speech time is only recorded)', 'E1');
    } else {
      setNode(2, 'wait', { since: lastAboveTs });
    }
    tlPush('b', lastAboveTs, 'B2 speech stop detected', 'backfilled to the last above-threshold frame, approximate');
  }
  if (outVol > OUT_TH) {
    outBelowSince = null;
    if (!playActive) {
      playActive = true;
      bPlayStartTs = now; playEpisodeStartTs = now; playEpisodeChain = chainGen;
      const w4 = bnd.relay_text_send_start;
      const w4axis = w4 && Number.isFinite(clkOff) ? w4.epoch - clkOff : null;
      setNode(6, 'done', { ms: w4axis != null ? Math.max(0, now - w4axis) : null, approx: true, na: !w4,
        note: w4 ? 'text sent → downlink volume detected: merged approximation, candidate link, not TTS time' : 'downlink energy detected; no text send record for this turn, turn link not measured' });
      setNode(7, 'wait', { since: now });
      tlPush('b', now, 'B3 first downlink audio detected', 'outputVolume above threshold, approximate,≠physical sound output confirmed');
      // Turn-level playback data needs corroboration. The protocol carries no playback IDs, so the best
      // available evidence is a text-send boundary for the CURRENT round - and even that stays an explicit
      // candidate. Without it the episode stays call-level: never bound to whatever round happens to be current.
      playOwnerTurn = (w4 && cur && cur.turn) ? cur.turn : null;
      if (playOwnerTurn !== null) {
        const prow = turnRows.get(playOwnerTurn);
        const patch = { playStartTs: now, playAssocCandidate: true };
        // a new episode on a row with a completed pair supersedes it: clear the stale end so playEnd < playStart can never stand
        if (prow && prow.playEndTs != null) { patch.playEndTs = undefined; patch.playEndClear = true; patch.playEpisodes = (prow.playEpisodes || 1) + 1; } // playEndClear: JSON drops undefined, so the clear rides as an explicit flag
        saveTurn(playOwnerTurn, patch);
        evLog('<b class="evm">● sound started</b>(volume inference, approximate; related to turn ' + playOwnerTurn + ' text send, candidate link)', 'E1');
      } else {
        evLog('<b class="evm">● sound started</b>(volume inference, approximate; no text send record for this turn, not linked to a turn, call-level record only)', 'E1');
      }
    }
  } else if (playActive) {
    if (!outBelowSince) outBelowSince = now;
    if (now - outBelowSince > PLAY_END_MS) {
      playActive = false;
      bPlayEndTs = outBelowSince;
      suspectSpeech = false;
      const ot = orphanPlayTurn; orphanPlayTurn = null;
      const owner = playOwnerTurn; playOwnerTurn = null;
      if (ot !== null && cur && cur.turn !== ot) {
        // a server-confirmed new round actually took over: this playback was orphaned
        saveTurn(ot, { playEndTs: outBelowSince, orphanPlayEnd: true });
        evLog('previous playback ended (interrupted by new speech / overlapped, assigned to the original turn, not in this turn timeline)', 'E1');
      } else {
        // no takeover: playback completed — an unconfirmed suspicion must not fake an interruption
        if (playEpisodeStartTs != null && playEpisodeChain === chainGen && Number.isFinite(bPlayEndTs - playEpisodeStartTs)) setNode(7, 'done', { ms: Math.max(0, bPlayEndTs - playEpisodeStartTs), approx: true, note: 'playback duration' });
        else { evLog('previous playback ended: belongs to an old response, overlaps the current chain or its start is no longer in this chain; not written into the current chain, not counted as duration', 'E1'); }
        tlPush('b', outBelowSince, 'B4 downlink audio ended', 'backfilled to the last above-threshold frame, approximate');
        // settle only to the turn that owned this episode's START; a bare end never lands on a round that took over mid-episode
        if (owner !== null) {
          const orow = turnRows.get(owner);
          if (orow && orow.playStartTs != null) saveTurn(owner, { playEndTs: outBelowSince, playAssocCandidate: true });
          else evLog('downlink energy ended: the owning turn has no start for this segment, kept unlinked (volume inference, approximate), not written into the current turn', 'E1');
        } else {
          evLog('downlink energy ended: no linked turn (volume inference, approximate), not written into any turn', 'E1');
        }
        evLog('playback ended', 'E1');
      }
    }
  }
  renderChain();
}
setInterval(() => { if (DEMO || inCall) tick(Date.now()); }, 60);

// ---- server-event stall watchdog: display honesty + diagnostic record only, never changes call behavior ----
const STALL_MS = 10000, STALL_HARD_MS = 30000, LIVE_LOST_MS = 15000; // v5z3: 10 s of silence while a server stage is outstanding = text note only (real LLM first-token waits of 10.8 s happen); lamps go off only at 30 s of silence or when /live itself is lost
function stallCheck(now) {
  { // observation-channel health: independent of business state and of agent playback
    const lost = !DEMO && inCall && lastLiveMsgTs != null && now - lastLiveMsgTs > LIVE_LOST_MS;
    if (lost !== liveLost) { liveLost = lost; evLog(lost ? '<b class="eve">● observation channel (/live) had more than ' + Math.round(LIVE_LOST_MS / 1000) + ' s without any message</b>:the page cannot see server events' : 'observation channel (/live) recovered'); }
    const lh = $('livehealth'); if (lh) { lh.style.display = lost ? '' : 'none'; lh.textContent = lost ? 'observation channel (/live) lost ' + Math.round((now - lastLiveMsgTs) / 1000) + ' s: the page is not receiving server events, the lights and timers below may stop updating; this does not mean the call has dropped' : ''; }
  }
  if (DEMO || !inCall) { stallMode = false; return; }
  const lw = leadWait();
  const waitingServer = lw >= 2 && lw <= 6; // nodes 1/7 are local mic/playback states, not server waits
  const stale = lastRelayEventTs != null && now - lastRelayEventTs > STALL_MS;
  const staleHard = lastRelayEventTs != null && now - lastRelayEventTs > STALL_HARD_MS;
  const quiet = waitingServer && stale && !relayClientOn && !relayAgentOn;
  if (quiet !== quietMode) { quietMode = quiet; if (quiet && !(stale && (staleHard || liveLost))) evLog('server ' + Math.round(STALL_MS / 1000) + ' s without a new event, still waiting for this stage (waiting, unconfirmed; the light stays on the recorded request state)'); }
  const next = quiet && (staleHard || liveLost); // Relay reports speaking: server silence is expected, not a stall
  if (next && !stallMode) {
    evLog('<b class="eve">● server events stalled >' + Math.round(STALL_MS / 1000) + 's: waiting timer no longer indicates progress (last event ' + new Date(lastRelayEventTs).toLocaleTimeString() + ')</b>');
    if (cur && cur.turn) saveTurn(cur.turn, { stalled: true, stallLastEventTs: lastRelayEventTs });
  } else if (!next && stallMode) {
    evLog('server events resumed, continuing with real events');
  }
  stallMode = next;
}
setInterval(() => stallCheck(Date.now()), 1000);

// ---- network + clock sync ----
function renderNet() {
  const f = (v) => (v == null || !isFinite(v)) ? '—' : Math.round(v) + 'ms';
  $('net2').innerHTML = 'uplink RTT ' + f(rtc && rtc.rtt) + ' · jitter ' + f(rtc && rtc.jitter)
    + ' · loss ' + (rtc && rtc.lost != null ? rtc.lost : '—')
    + (DEMO ? ' <span class="tag approx">synthetic</span>(demo filler, not SDK sampling)' : ' <span class="tag real">measured</span>(SDK round trip, not one-way)')
    + ' · clock offset ' + (clkRtt == null ? '—' : Math.round(clkRtt) + 'ms')
    + (DEMO ? ' <span class="tag approx">synthetic</span>' : ' symmetric link <span class="tag approx">approx</span>');
  $('ev1v').textContent = f(rtc && rtc.rtt);
}

// ---- per-turn dynamic event timeline ----
let tl = [];
function tlPush(clock, rawTs, label, note) {
  if (rawTs == null || !isFinite(rawTs)) return;
  tl.push({ rawTs, clock, label, note });
  renderTl();
}
function renderTl() {
  if (!tl.length) { $('tlcard').style.display = 'none'; return; }
  const aligned = Number.isFinite(clkOff);
  const rows = tl.map(r => ({ ...r, adj: r.clock === 's' ? (aligned ? r.rawTs - clkOff : null) : r.rawTs }));
  if (aligned) rows.sort((a,b) => a.adj - b.adj);
  const origins = {};
  for (const r of rows) if (origins[r.clock] == null) origins[r.clock] = r.rawTs;
  const anchor = aligned ? rows[0].adj : null;
  const fmt = (v) => (v < 0 ? '−' + Math.round(-v) : '+' + Math.round(v)) + 'ms';
  let prev = null;
  $('tlh').textContent = DEMO ? 'Timeline of this turn · demo synthetic data (not real measurement)' : (aligned ? 'Timeline of this turn · cross-clock alignment is approximate' : 'Timeline of this turn · clocks not aligned, different clocks are not subtracted');
  $('tl').innerHTML = rows.map((r) => {
    let delta = '';
    if (prev) {
      const same = r.clock === prev.clock;
      if (aligned || same) delta = ' <span class="tln">Δ' + fmt(same ? r.rawTs - prev.rawTs : r.adj - prev.adj) + ' <span class="tag ' + (DEMO || !same ? 'approx' : 'real') + '">' + (DEMO ? 'synthetic' : (same ? 'measured' : 'approx')) + '</span></span>';
    }
    prev = r;
    return '<div class="tlr"><span class="tlt">' + (aligned ? fmt(r.adj - anchor) : fmt(r.rawTs - origins[r.clock]) + '(this clock)') + '</span><span class="tll">' + r.label
      + ' <span class="tlc">' + (r.clock === 's' ? 'server clock' : 'browser clock') + '</span>'
      + (r.note ? ' <span class="tln">(' + r.note + ')</span>' : '') + delta + '</span></div>';
  }).join('');
  $('tlcard').style.display = '';
}

function liveSeqMax() { let m = 0; for (const v of liveSeq.seen) if (v > m) m = v; return m; }
function liveSeqTrack(e) {
  if (e && Number.isInteger(e.pseq) && e.pseq > 0) { if (liveSeq.seen.has(e.pseq)) liveSeq.dup++; else liveSeq.seen.add(e.pseq); }
  if (e && e.type === 'call_end' && Number.isInteger(e.pubTotal)) {
    liveSeq.total = Math.max(liveSeq.total || 0, e.pubTotal); liveSeq.failed = e.pubFailed;
    const first = Math.min(...liveSeq.seen); const miss = [], pre = []; for (let i = 1; i <= liveSeq.total; i++) if (!liveSeq.seen.has(i)) (i < first ? pre : miss).push(i);
    liveSeqReport = { sent: liveSeq.total, received: liveSeq.seen.size, dup: liveSeq.dup, missing: miss.length, missingSeq: miss.slice(0, 20), beforeSubscribe: pre.length, publishFailedAtSource: liveSeq.failed };
    evLog('Worker→/live→page sequence reconciliation: Worker published ' + liveSeqReport.sent + ' items (including publish failures ' + liveSeq.failed + ')· page received (deduped) ' + liveSeqReport.received + ' · duplicates ' + liveSeq.dup + ' · sent before the page connected to /live ' + pre.length + '(page was not yet subscribed, not a transport loss) · missing after subscribing ' + miss.length + (miss.length ? '(#' + miss.slice(0, 20).join(',') + ')' : ''));
  }
}
// ---- live server events (handleLive is also used by demo mode and tests) ----
function handleLive(e, recv) {
  if (typeof recv === 'number') lastLiveMsgTs = recv;
  if (e && e.type !== 'pong' && typeof recv === 'number') lastRelayEventTs = recv; // relay-session liveness; pong only proves the /live bus (v5y: was in liveSeqTrack where recv is undefined, so it never updated)
  liveSeqTrack(e);
  if (e.type === 'boundary') {
    const epoch = e.epochTime != null ? e.epochTime : e.serverTs;
    const mono = e.monotonicTime != null ? e.monotonicTime : e.serverMonoMs;
    if (cur && e.turn === cur.turn && typeof epoch === 'number') {
      bnd[e.boundary] = { epoch: epoch, mono: mono };
      tlPush('s', epoch, e.boundary, 'code boundary; turn ' + e.turn + 'turns #' + (e.sequence != null ? e.sequence : e.eventSeq) + (e.chunkSeq != null ? ';text chunk#' + e.chunkSeq : ''));
      if (e.boundary === 'llm_request_start') {
        const w1 = bnd.relay_final_received;
        setNode(3, 'done', { ms: w1 && mono != null && w1.mono != null ? Math.max(0, mono - w1.mono) : null, note: 'W2-W1 same clock' });
        setNode(4, 'wait', { since: Number.isFinite(clkOff) ? epoch - clkOff : recv });
      }
      if (e.boundary === 'llm_first_nonempty_token') {
        // v5z5: first token is the head of the stream, not the end of the LLM stage. LLM stays lit until llm_stream_end; WS-out starts waiting concurrently.
        const w2 = bnd.llm_request_start;
        const prev = nst[4] || {};
        setNode(4, 'wait', { since: prev.st === 'wait' ? prev.since : (Number.isFinite(clkOff) ? epoch - clkOff : recv), ttft: w2 && mono != null && w2.mono != null ? Math.max(0, mono - w2.mono) : null, note: 'first token arrived, stream in progress' });
        setNode(5, 'wait', { since: Number.isFinite(clkOff) ? epoch - clkOff : recv });
      }
      if (e.boundary === 'llm_stream_end') {
        const w2 = bnd.llm_request_start;
        if (nst[4] && nst[4].st === 'wait') setNode(4, 'done', { cancelled: e.cancelled || null, ms: w2 && mono != null && w2.mono != null ? Math.max(0, mono - w2.mono) : null, note: e.cancelled ? 'stream cancelled(' + (e.cancelled === 'interrupt' ? 'interrupt' : 'replaced by new final') + '), abnormal end' : 'stream ended (llm_stream_end); includes first-token wait' });
      }
      if (e.boundary === 'relay_text_send_start' && e.chunkSeq === 1) {
        const w3 = bnd.llm_first_nonempty_token;
        setNode(5, 'done', { ms: w3 && mono != null && w3.mono != null ? Math.max(0, mono - w3.mono) : null, note: 'W4-W3 same clock' });
        setNode(6, 'wait', { since: Number.isFinite(clkOff) ? epoch - clkOff : recv });
      }
      if (e.boundary === 'llm_failed') setNode(4, 'fail', { note: 'LLM error' });
      if (e.boundary === 'turn_transport_failure') setNode(5, 'fail', { note: 'send failed' });
    }
    return;
  }
  if (e.type === 'relay_net') { relayNet = e; relaySessId = e.sessId || null; renderNetPanel(); return; }
  if (e.type === 'pong') {
    const rtt = recv - e.c;
    if (clkRtt == null || rtt <= clkRtt) { clkRtt = rtt; clkOff = e.s - (e.c + rtt / 2); }
    renderNet(); renderChain(); renderTl(); return;
  }
  if (e.type === 'speaker') {
    if (e.on === true || e.on === false) { if (e.who === 'client') relayClientOn = e.on; else if (e.who === 'agent') relayAgentOn = e.on; renderChain(); }
    evLog('Relay ' + (e.who || '?') + ' speaking=' + String(e.on) + ' · call-level notification, turn link unconfirmed', 'E2');
    return; // never use an uncorrelated notification as a per-turn timing endpoint
  }
  if (e.type === 'tokens_played') {
    evLog('Relay playback progress notification · call level, corresponding turn/text chunk unconfirmed', 'E2');
    return;
  }
  if (e.type === 'call_start') evLog('<b>● call connected</b>', 'E2');
  if (e.type === 'stt_done') {
    tl = []; bnd = {};
    bnd.relay_final_received = { epoch: e.ts, mono: null };
    tlPush('s', e.ts, 'W1 final arrived at the server', 'Relay delivered to /ws');
    tlPush('b', recv, 'browser received transcript-complete notification', 'pushed via /live, includes push transport');
    curUtteranceId = e.utteranceId || null; curResponseId = null;
    const w1axis = Number.isFinite(clkOff) ? e.ts - clkOff : null;
    // Transcript establishes the turn; browser volume only back-correlates as approximate evidence (user constraint 2026-10-31).
    const hasVolEpisode = bSpeechStartTs != null;
    const freshUtter = hasVolEpisode && bSpeechStartTs !== attrSpeechStartTs;
    const contUtter = hasVolEpisode && bSpeechStartTs === attrSpeechStartTs; // same VAD episode (no >END_MS silence) already attributed to an earlier turn: continuation CANDIDATE - volume-continuity inference only, the protocol carries no same-speech confirmation
    if (playActive && cur && cur.turn !== e.turn && freshUtter) {
      // server-confirmed takeover: fresh new-utterance transcript for another round mid-playback
      if (orphanPlayTurn === null) orphanPlayTurn = cur.turn;
      resetChain();
      if (speaking) setNode(1, 'wait', { since: bSpeechStartTs }); // the user is still speaking per the local mic: the mic lamp must not go grey because the chain was reset for the new turn
    }
    suspectSpeech = false;
    if (freshUtter || contUtter) {
      setNode(2, 'done', { ms: bSpeechEndTs != null ? Math.max(0, (w1axis != null ? w1axis : recv) - bSpeechEndTs) : null, approx: true, note: contUtter ? 'continued transcript · same-segment candidate (continuous volume assumed, approximate)' : 'end of speech → transcript returned · merged wait' });
    } else {
      setNode(2, 'done', { ms: null, note: 'not linked (no volume evidence)' });
    }
    setNode(3, 'wait', { since: w1axis != null ? w1axis : recv });
    evLog('<b class="evm">● transcript complete</b>(turn ' + e.turn + 'turns,' + (e.promptChars||'?') + 'chars' + (e.utteranceId ? ' · ' + e.utteranceId : '') + ')', 'E2');
    if (contUtter) evLog('turn ' + e.turn + 'turn continued transcript: volume was continuous (no long silence) so it is assumed to be the same segment as the previous turn and shares its approximate start/end; the protocol has no same-segment confirmation, so attribution is a candidate, not a remnant');
    if (!freshUtter && !contUtter) evLog('turn ' + e.turn + 'turn has no browser volume evidence: speech start/end not linked (content not recorded, not inferred)');
    if (cur) teleSend(false);
    cur = turnRows.get(e.turn) || { turn: e.turn };
    turnRows.set(e.turn, cur);
    Object.assign(cur, { sttRecvTs: recv, srvSttDoneTs: e.ts });
    if (freshUtter) {
      attrSpeechStartTs = bSpeechStartTs;
      Object.assign(cur, { speechStartTs: bSpeechStartTs,
        speechEndTs: bSpeechEndTs != null ? bSpeechEndTs : undefined });
    } else if (contUtter) {
      Object.assign(cur, { speechStartTs: bSpeechStartTs,
        speechEndTs: bSpeechEndTs != null ? bSpeechEndTs : undefined,
        speechSharedWithPrev: true });
    } else {
      cur.speechUnassociated = true;
    }
    teleSend(false);
  }
  if (e.type === 'llm_first') {
    saveTurn(e.turn, { llmFirstRecvTs: recv, srvLlmFirstTs: e.ts });
    if (cur && cur.turn !== e.turn) return;
    curResponseId = e.responseId || null;
    tlPush('s', e.ts, 'W3 first token (server)', 'includes provider network + scheduling + call chain, not pure model');
    tlPush('b', recv, 'browser received first-token notification', 'pushed via /live');
    evLog('<b class="evm">● first token out</b>(' + fmtS(e.ms) + ' <span class="tag real">' + (DEMO ? 'synthetic' : 'measured') + '</span>,transcript received → first token)', 'E3');
  }
  if (e.type === 'llm_done') {
    saveTurn(e.turn, { llmDoneRecvTs: recv });
    if (cur && cur.turn !== e.turn) return;
    if (e.cancelled) {
      const why = e.cancelled === 'interrupt' ? 'interrupted' : 'replaced by new final';
      tlPush('s', e.ts, 'reply cancelled (server)', why + '; last:true not sent, not a normal completion');
      evLog('<b class="evw">● reply cancelled</b>(' + why + ',sent ' + e.chars + ' chars; not a normal completion)', 'E2');
      return;
    }
    tlPush('s', e.ts, 'reply complete (server)', 'whole-turn generation ended; W6 last:true sent');
    tlPush('b', recv, 'browser received reply-complete notification', 'pushed via /live');
    evLog('<b class="evm">● reply sent</b>(whole turn ' + fmtS(e.ms) + ' <span class="tag real">' + (DEMO ? 'synthetic' : 'measured') + '</span>,' + e.chars + 'chars)', 'E3');
  }
  if (e.type === 'interrupt') {
    tlPush('s', e.ts, 'interrupt event (server)', 'playback progress ' + (e.ms||'?') + 'ms, not reaction latency');
    saveTurn(e.turn, { interrupted: true });
    evLog('<b class="evw">● you interrupted playback</b>(' + (e.ms||'?') + 'ms mark)', 'E2');
    if (playActive) {
      // server-confirmed barge-in: switch rounds on the diagram now
      if (orphanPlayTurn === null) orphanPlayTurn = cur ? cur.turn : null;
      suspectSpeech = false;
      tl = []; bnd = {}; bPlayStartTs = null; bPlayEndTs = null; resetChain();
      if (speaking) setNode(1, 'wait', { since: bSpeechStartTs != null ? bSpeechStartTs : recv });
    } else {
      // server-confirmed interrupt but no browser playback episode: an unfinished wait of the interrupted round must not stay lit
      let cleared = 0;
      for (let i = 2; i <= 6; i++) if (nst[i] && nst[i].st === 'wait') { nst[i] = { st: 'idle' }; cleared++; }
      if (cleared) evLog('interrupt: the wait for an end event on the interrupted turn was cleared (no event is invented)');
    }
  }
  if (e.type === 'error') { const lw = leadWait(); if (lw && e.endsSession === true) setNode(lw, 'fail', { note: String(e.description || '').slice(0, 24) }); evLog('<b class="eve">● error' + (e.code ? ' ' + e.code : '') + (e.endsSession === true ? '(session ended)' : e.endsSession === false ? '(session continues, not a link fault)' : '(unknown whether the session ended)') + ':' + (e.description||'') + '</b>'); }
  if (e.type === 'call_end') { evLog('call ended:' + (e.turns||0) + 'turns · ' + fmtS(e.ms||0)); }
  renderChain();
}

function connectLive() {
  if (!callSid) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  liveWs = new WebSocket(proto + '//' + location.host + '/live?callSid=' + encodeURIComponent(callSid) + '&after=' + liveSeqMax());
  const afterAtConnect = liveSeqMax();
  liveWs.onopen = () => {
    const doPing = () => { if (liveWs && liveWs.readyState === 1) { try { liveWs.send(JSON.stringify({ type: 'ping', c: Date.now() })); } catch {} } };
    doPing(); clearInterval(pingTimer); pingTimer = setInterval(doPing, 5000);
  };
  const thisWs = liveWs;
  liveWs.onmessage = (m) => {
    if (liveWs !== thisWs) return; // stale socket from a previous call
    let e; try { e = JSON.parse(m.data); } catch { return; }
    if (e && e.replay && afterAtConnect > 0) { liveSeqTrack(e); evLog('catch-up after reconnect #' + e.pseq + '(counted only in sequence reconciliation, does not change current status)'); return; }
    handleLive(e, Date.now());
  };
  liveWs.onclose = () => { clearInterval(pingTimer); if (inCall) setTimeout(connectLive, 1500); };
}


// ---- network, split by path and direction (metadata only; no audio behaviour changes) ----
// A = media path browser<->Twilio (WebRTC). B = observation path browser<->Cloudflare (HTTPS /ping + /live WebSocket).
// C = Twilio<->Cloudflare /ws connection as Cloudflare measured it. One-way = RTT/2 under a symmetry assumption (true one-way is anywhere in 0..RTT).
const edge = { s: [], first: null, n: 0, err: 0, cf: null };
let relayNet = null, netMedia = null, mediaRtts = [], mediaTimer = null;
const medianOf = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
async function probeEdgeOnce() {
  const t0 = nowMs();
  try {
    const r = await fetch('/ping?x=' + Math.random().toString(36).slice(2), { cache: 'no-store', credentials: 'same-origin' });
    const j = await r.json(); const rtt = nowMs() - t0;
    edge.n++; if (edge.first == null) edge.first = rtt; else { edge.s.push(rtt); edge.s = edge.s.slice(-40); }
    edge.cf = j;
  } catch (e) { edge.err++; }
  renderNetPanel();
}
async function probeEdgeBurst(k) { for (let i = 0; i < k; i++) { await probeEdgeOnce(); await new Promise((r) => setTimeout(r, 150)); } }
function pollMedia() {
  if (!inCall || !sdkObserver || typeof sdkObserver.stats !== 'function') return;
  sdkObserver.stats().then((st) => {
    if (!st) return; netMedia = st;
    const v = st.pairRttMs != null ? st.pairRttMs : (st.up && st.up.rttMs != null ? st.up.rttMs : null);
    if (v != null) { mediaRtts.push(v); mediaRtts = mediaRtts.slice(-120); }
    renderNetPanel();
  }).catch(() => {});
}
function renderNetPanel() {
  const el = $('netpanel'); if (!el) return;
  const T = (k, t) => (DEMO && (k === 'real' || k === 'approx')) ? '<span class="tag approx">synthetic' + (k === 'approx' ? '·estimate' : '') + '</span>' : '<span class="tag ' + k + '">' + t + '</span>';
  const ms = (v, d) => (v == null || !isFinite(v)) ? '—' : (v < 10 && d ? v.toFixed(1) : Math.round(v)) + 'ms';
  const half = (v) => v == null ? '—' : '≈' + ms(v / 2, true);
  const row = (k, v, tag) => '<div class="npi"><span>' + k + '</span><span>' + v + ' ' + (tag || '') + '</span></div>';
  const pend = (why) => T('pend', why || 'to be collected');
  // A: media path
  const mRtt = mediaRtts.length ? medianOf(mediaRtts) : (rtc && rtc.rtt != null ? rtc.rtt : null);
  const mMin = mediaRtts.length ? Math.min.apply(null, mediaRtts) : null, mMax = mediaRtts.length ? Math.max.apply(null, mediaRtts) : null;
  const up = netMedia && netMedia.up, dn = netMedia && netMedia.down;
  const pk = (rtc && rtc.pk != null) ? rtc.pk : null;
  let A = '<div class="npg"><div class="nph">A Voice media path · browser ↔ Twilio (WebRTC, your voice travels this path)<small>round trip RTT '
    + (mRtt == null ? '—' : ms(mRtt) + (mediaRtts.length ? '(median,' + mediaRtts.length + ' samples,' + ms(mMin) + '–' + ms(mMax) + ')' : '(SDK snapshot)')) + ' ' + (mRtt == null ? pend(inCall ? 'collecting' : 'waiting for call') : T('real', 'measured')) + '</small></div>'
    + '<div class="npd"><div><div class="npt">outbound browser→Twilio</div>'
    + row('one-way delay', half(mRtt), mRtt == null ? pend(inCall ? 'collecting' : 'waiting for call') : T('approx', 'estimate'))
    + row('jitter (Twilio side)', up && up.jitterMs != null ? ms(up.jitterMs, true) : '—', up && up.jitterMs != null ? T('real', 'measured') : pend(inCall ? 'not provided by the browser' : 'waiting for call'))
    + row('loss (Twilio side)', up && up.lossFraction != null ? (up.lossFraction * 100).toFixed(1) + '%' : '—', up && up.lossFraction != null ? T('real', 'measured') : pend(inCall ? 'not provided by the browser' : 'waiting for call'))
    + row('sent packets', netMedia && netMedia.sent && netMedia.sent.packets != null ? netMedia.sent.packets + ' packets' : '—', netMedia && netMedia.sent ? T('real', 'measured') : '')
    + '</div><div><div class="npt">inbound Twilio→browser</div>'
    + row('one-way delay', half(mRtt), mRtt == null ? pend(inCall ? 'collecting' : 'waiting for call') : T('approx', 'estimate'))
    + row('jitter', dn && dn.jitterMs != null ? ms(dn.jitterMs, true) : '—', dn && dn.jitterMs != null ? T('real', 'measured') : pend(inCall ? 'not provided by the browser' : 'waiting for call'))
    + row('jitter buffer mean', dn && dn.jitterBufferMs != null ? ms(dn.jitterBufferMs) : '—', dn && dn.jitterBufferMs != null ? T('real', 'measured') : pend(inCall ? 'not provided by the browser' : 'waiting for call'))
    + row('loss', dn && dn.packetsLost != null ? dn.packetsLost + ' packets' : '—', dn && dn.packetsLost != null ? T('real', 'measured') : pend(inCall ? 'not provided by the browser' : 'waiting for call'))
    + '</div></div><div class="npn">one-way = round trip ÷ 2; holds only under the assumption of symmetric uplink and downlink, which is not verified and has no provable error bound; only the round-trip value is certain. Jitter and loss come from WebRTC stats per direction: outbound is the receive quality Twilio reports to the browser, inbound is what the browser itself received.</div></div>';
  // B: observation path
  const eMin = edge.s.length ? Math.min.apply(null, edge.s) : null, eMed = medianOf(edge.s);
  const cfb = edge.cf || {};
  const wsRtt = clkRtt;
  let B = '<div class="npg"><div class="nph">B Observation channel · browser ↔ Cloudflare<small>only decides how soon the page sees events, not on the voice path</small></div>'
    + '<div class="npd"><div><div class="npt">outbound browser→Cloudflare</div>'
    + row('HTTPS one-way', half(eMin), eMin == null ? pend(edge.err ? 'probe failed' : 'probing') : T('approx', 'estimate'))
    + row('live bus one-way', half(wsRtt), wsRtt == null ? pend(inCall ? 'collecting' : 'waiting for call') : T('approx', 'estimate'))
    + '</div><div><div class="npt">inbound Cloudflare→browser</div>'
    + row('HTTPS one-way', half(eMin), eMin == null ? pend(edge.err ? 'probe failed' : 'probing') : T('approx', 'estimate'))
    + row('live bus one-way', half(wsRtt), wsRtt == null ? pend(inCall ? 'collecting' : 'waiting for call') : T('approx', 'estimate'))
    + '</div></div>'
    + '<div class="npn">HTTPS /ping round trip: min ' + ms(eMin) + ' · median ' + ms(eMed) + ' · ' + edge.s.length + ' samples (first packet ' + ms(edge.first) + ' includes handshake, not counted)' + (eMin == null ? '' : ' ' + T('real', 'measured'))
    + '<br>TCP round trip of this connection recorded by Cloudflare (platform metric request.cf.clientTcpRtt, not an application one-way measurement; missing means missing):' + (cfb.tcpRtt != null ? ms(cfb.tcpRtt) + ' ' + T('real', 'measured') : (cfb.quicRtt != null ? ms(cfb.quicRtt) + '(QUIC) ' + T('real', 'measured') : (edge.cf ? 'not provided by the edge ' + T('na', 'unavailable') : '—')))
    + (cfb.colo ? ' · point of presence ' + cfb.colo + (cfb.proto ? ' · ' + cfb.proto : '') : '')
    + '<br>live bus (WebSocket→Durable Object) round trip:' + ms(wsRtt) + '(minimum taken every 5 s during the call)' + (wsRtt == null ? '' : ' ' + T('real', 'measured')) + '. one-way = round trip ÷ 2. Symmetry assumption not verified.</div></div>';
  // C: Twilio <-> Cloudflare
  const rn = relayNet;
  const rr = rn ? (rn.tcpRtt != null ? rn.tcpRtt : rn.quicRtt) : null;
  let C = '<div class="npg"><div class="nph">C Twilio ↔ Cloudflare /ws connection<small>voice events travel this path; round trip measured by Cloudflare itself</small></div>'
    + '<div class="npd"><div><div class="npt">outbound Twilio→Cloudflare</div>' + row('one-way', half(rr), rr == null ? (rn ? T('na', 'unavailable') : pend(inCall ? 'waiting for connection' : 'waiting for call')) : T('approx', 'estimate')) + '</div>'
    + '<div><div class="npt">inbound Cloudflare→Twilio</div>' + row('one-way', half(rr), rr == null ? (rn ? T('na', 'unavailable') : pend(inCall ? 'waiting for connection' : 'waiting for call')) : T('approx', 'estimate')) + '</div></div>'
    + '<div class="npn">' + (rn ? ('TCP round trip of the Twilio connection recorded by Cloudflare (platform metric, not an application one-way):' + ms(rr) + (rr != null ? ' ' + T('real', 'measured') : '') + ' · Cloudflare point of presence ' + (rn.colo || '—') + ' · origin country ' + (rn.country || '—')) : 'provided by Cloudflare after the call is established')
    + '. Inside Cloudflare (edge → Durable Object/Workers AI) the page cannot see,<b>already merged into each segment</b>.</div></div>';
  const cal = '<div class="npn">cross-clock offset:' + (Number.isFinite(clkOff) ? clkOff + 'ms' : '—') + ' <span class="tag pend">needs calibration</span>(not checked by an independent method; 0 is treated as unknown and not used for cross-clock numbers)</div>';
  el.innerHTML = A + B + C + cal + '<div class="npn" style="border:none">These network times are already included in end to end (local end of speech → downlink volume detected) and are not added again. A, B and C are three different paths and cannot substitute for each other.</div>';
}
let callT0 = null, relaySessId = null, netlogFail = 0;
function netlogSend(force) {
  if ((!inCall && force !== true) || !relaySessId || !callSid || DEMO) return;
  const eS = edge.s, cfb = edge.cf || {}, up = netMedia && netMedia.up, dn = netMedia && netMedia.down;
  const body = JSON.stringify({ sessId: relaySessId, callSid, browserTs: Date.now(), inCallMs: callT0 ? Date.now() - callT0 : undefined,
    edgeN: eS.length, edgeMinMs: eS.length ? Math.min.apply(null, eS) : undefined, edgeMedMs: medianOf(eS) ?? undefined, edgeErr: edge.err,
    cfTcpRttMs: cfb.tcpRtt ?? undefined, busRttMs: clkRtt ?? undefined, clkOffsetMs: clkOff ?? undefined,
    mediaRttMs: mediaRtts.length ? medianOf(mediaRtts) : undefined, mediaRttN: mediaRtts.length,
    upJitterMs: up && up.jitterMs != null ? up.jitterMs : undefined, upLoss: up && up.lossFraction != null ? up.lossFraction : undefined,
    downJitterMs: dn && dn.jitterMs != null ? dn.jitterMs : undefined, downLost: dn && dn.packetsLost != null ? dn.packetsLost : undefined,
    downJitterBufMs: dn && dn.jitterBufferMs != null ? dn.jitterBufferMs : undefined, sentPackets: netMedia && netMedia.sent && netMedia.sent.packets != null ? netMedia.sent.packets : undefined });
  fetch('/netlog', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).then((r) => { if (!r.ok) netlogFail++; }).catch(() => { netlogFail++; });
}
setInterval(() => netlogSend(), 20000);
renderNetPanel();
if (!DEMO) probeEdgeBurst(8);
setInterval(() => { if (inCall) probeEdgeOnce(); }, 20000);
setInterval(pollMedia, 1000);

// ---- call controls ----
let device = null, call = null, sdkObserver = null;
$('call').onclick = async () => {
  try {
    browserSessionId = crypto.randomUUID(); turnRows.clear(); cur = null;
    evLog('fetching token…');
    const r = await fetch('/token');
    if (!r.ok) { evLog('token rejected ' + r.status); return; }
    const { token } = await r.json();
    const observer = sdkObserver = new SdkObserver({ sessionId: browserSessionId, emit: row => {
      teleFetch(JSON.stringify({ sdkEvent: row, sim: false, pageBuild: '${PAGE_BUILD}' }));
    }});
    const mediaOptions = observer.options(navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), window.RTCPeerConnection);
    device = new Twilio.Device(token, { codecPreferences: ['opus', 'pcmu'], ...mediaOptions });
    device.on('error', (e) => evLog('device error: ' + e.message));
    await device.register();
    evLog('SDK registered, placing call…');
    observer.record('connect_requested');
    call = await device.connect(new URLSearchParams(location.search).get('exp') === 'nopartial' ? { params: { exp: 'nopartial' } } : undefined);
    call.on('volume', (i, o) => { inVol = i; outVol = o; });
    call.on('sample', (sm) => {
      observer.sample(sm);
      // Voice SDK RTCSample: rtt/jitter are ALREADY milliseconds - the SDK
      // converts (roundTripTime*1000 / jitter*1000 / currentRoundTripTime*1000)
      // in lib/twilio/rtc/stats.ts, twilio/twilio-voice.js (verified 2026-10-21).
      rtc = { rtt: sm.rtt ?? null, jitter: sm.jitter ?? null, mos: sm.mos, lost: sm.packetsLost, codec: sm.codecName };
      renderNet();
    });
    call.on('accept', () => {
      inCall = true; callT0 = Date.now(); relaySessId = null; rtc = null; clkOff = null; clkRtt = null; tl = []; bnd = {}; relayNet = null; netMedia = null; mediaRtts = []; renderNetPanel();
      bSpeechStartTs = bSpeechEndTs = bPlayStartTs = bPlayEndTs = null;
      orphanPlayTurn = null; playOwnerTurn = null; attrSpeechStartTs = null; lastRelayEventTs = Date.now(); lastLiveMsgTs = Date.now(); liveLost = false; liveSeq = { seen: new Set(), dup: 0, total: null, failed: null }; liveSeqReport = null; stallMode = false; suspectSpeech = false; relayClientOn = relayAgentOn = false;
      curUtteranceId = curResponseId = null;
      $('tlcard').style.display = 'none'; renderNet();
      resetChain();
      teleSeq = 0; teleRej = 0; teleNet = 0;
      callSid = (call.parameters && (call.parameters.CallSid || call.parameters.get && call.parameters.get('CallSid'))) || null;
      observer.bind(callSid); observer.record('call_accepted');
      evLog('<b>call connected</b>' + (callSid ? '' : '(no callSid obtained, real-time events unavailable)'));
      connectLive();
    });
    call.on('disconnect', () => {
      observer.record('call_disconnected');
      netlogSend(true);
      inCall = false; speaking = playActive = false;
      orphanPlayTurn = null; playOwnerTurn = null; attrSpeechStartTs = null; lastRelayEventTs = null; lastLiveMsgTs = null; liveLost = false; stallMode = false; suspectSpeech = false; relayClientOn = relayAgentOn = false;
      const active = cur; { const rows = [...turnRows.values()]; rows.forEach((row, i) => { cur = row; teleSend(true, i === rows.length - 1); }); } cur = active;
      $('hangup').disabled = true; $('call').disabled = false;
      { const w = liveWs; if (w) setTimeout(() => { try { w.close(); } catch {} }, 8000); } // keep /live ~8 s so the Worker's final call_end (publish total) can still arrive
      renderChain();
      fetchInsights(callSid, [90000, 60000, 90000]);
    });
    call.on('error', (e) => evLog('call error: ' + e.message));
    $('hangup').disabled = false; $('call').disabled = true;
  } catch (e) { evLog('failed: ' + e.message); }
};

// ---- post-call Twilio Voice Insights (platform numbers, separate evidence source; never merged with browser/Relay numbers) ----
function fetchInsights(sid, delays) {
  if (!sid || DEMO || !delays.length) return;
  const finals = [...turnRows.values()].filter((r) => r.srvSttDoneTs != null).length;
  setTimeout(async () => {
    try {
      const r = await fetch('/insights?callSid=' + encodeURIComponent(sid) + '&finals=' + finals, { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.ready) { evLog('Twilio Insights events not ready yet' + (j.status ? '(HTTP ' + j.status + ')' : '') + (delays.length > 1 ? ',retry later' : ',not obtained')); return fetchInsights(sid, delays.slice(1)); }
      const f = (s) => s ? s.min + '–' + s.max + 'ms(median ' + s.median + ',n=' + s.n + ')' : 'no events';
      const g = (m) => m ? m.min + ' / ' + (m.avg == null ? '—' : m.avg) + ' / ' + m.max + 'ms' : 'none';
      const mt = (x, nm) => nm + ' platform events ' + x.events + (x.judgeable ? ' · expected ' + x.expected + ' · missing ' + x.missing + ' · extra ' + x.extra : ' · expected unknown, not judged missing') + ' · duplicate at the same instant ' + x.duplicateTimestamps;
      const sm = j.summary || {};
      const row = (k, v, n, lbl) => '<div class="e2r"><span class="e2k">' + k + '</span><b>' + v + '</b> <span class="tag approx">' + (lbl || 'E5 platform basis') + '</span> <span class="e2n">' + n + '</span></div>';
      let h = '';
      h += row('STT latency (event)', f(j.stt), 'provider metadata, not the page value"transcript wait"');
      h += row('TTS latency (event)', f(j.tts), 'Twilio-recorded text → speaking');
      if (!sm.unavailable) {
        (j.summaries || []).forEach((x, i) => {
          const lab = 'session summary' + (j.summaries.length > 1 ? ' #' + (i + 1) : '') + (sm.state === 'complete' ? '(complete)' : '(partial, may change later)') + (x.matchedToEvents ? '' : ' · cannot be matched with the event session');
          h += row(lab, 'turns ' + (x.turns == null ? '—' : x.turns) + ' · interruptions customer→agent ' + (x.interruptions ? x.interruptions.customerToAgent : '—') + ' / agent→customer ' + (x.interruptions ? x.interruptions.agentToCustomer : '—') + '<br>network RTT ' + g(x.networkMs) + '<br>app response ' + g(x.applicationMs) + '<br>Twilio end to first audio ' + g(x.firstAudioMs), 'session-level min/avg/max, not per turn; per sessionId, not merged');
        });
        if (j.sessionNote) h += row('multiple sessions', j.sessionNote, '');
      } else h += row('session summary', 'temporarily unavailable', 'Summary endpoint has not returned yet (status ' + (sm.state || '—') + ')');
      const detail = row('platform event match', mt(j.match.stt, 'STT') + '<br>' + mt(j.match.tts, 'TTS'), 'not telemetry coverage;' + j.match.expectedBasis)
        + row('Insights↔app event count match', (j.relayLeg && j.relayLeg.decidable) ? (j.relayLeg.totalMatched + '/' + j.relayLeg.totalEmitted + '(' + Math.round(j.relayLeg.ratio * 100) + '%; only these four platform record types; real transport coverage unknown; equal counts cannot rule out one loss and one duplicate cancelling out)<br>' + j.relayLeg.kinds.map((k) => k.kind.replace('start_of_', '').replace('customer_speech', 'you speak').replace('agent_speech', 'agent speaks') + ' app ' + k.received + '/platform ' + k.emitted).join(' · ')) : ((j.relayLeg && j.relayLeg.note) || 'cannot be determined'), (j.relayLeg && j.relayLeg.emittedBasis || '') + ((j.relayLeg && j.relayLeg.scope) ? ';scope:' + j.relayLeg.scope : ''))
        + row('Worker→/live→page sequence reconciliation', liveSeqReport ? (liveSeqReport.received + '/' + liveSeqReport.sent + '(not connected before subscribing ' + liveSeqReport.beforeSubscribe + ' · missing after subscribing ' + liveSeqReport.missing + ' · duplicates ' + liveSeqReport.dup + ' · source publish failures ' + liveSeqReport.publishFailedAtSource + ')') : 'this page did not receive the source total from call_end, cannot be determined', 'source = Worker per-call increasing sequence pseq, call_end carries the total; the page dedupes by sequence. Limits: if call_end itself is lost the total is unknown; messages during a page /live disconnect cannot be recovered and count as missing; covers only the one call this page stayed connected to /live for', 'source sequence · not Insights')
        + row('overall telemetry coverage', 'unknown', j.telemetryCoverage.reason)
        + '<div class="e2n" style="margin-top:6px">Source: Twilio Voice Insights Events (Edge=carrier_edge, group=conversation_relay) and Call Summary (ProcessingState=partial). Credentials stay on the server, the browser fetches only aggregate numbers. STT/TTS latency = latency_ms in the events; summary = min/avg/max from agent_session_summaries matched by sessionId; expected event count = number of Relay finals this page observed during this call.' + j.caveat + '.</div>';
      h += '<div class="e2r"><b>cross-clock offset ' + j.clock + '</b> <span class="e2n">no cross-clock values shown; telemetry coverage unknown (see details)</span></div>';
      h += '<details style="margin-top:6px"><summary>field matching, coverage and formulas (expand)</summary>' + detail + '</details>';
      $('insum').innerHTML = '<div class="e2r"><b>Twilio Insights summary after the call</b> <span class="e2n">evidence level E5, available after the call; kept separate from the browser/Relay numbers above, not added to them</span></div>' + h;
      $('insum').style.display = '';
      evLog('Twilio Insights summary shown(E5)', 'E5');
      if (sm.unavailable && delays.length > 1) { evLog('session summary not ready, refresh later'); fetchInsights(sid, delays.slice(1)); }
    } catch (e) { evLog('Twilio Insights read failed:' + e.message); }
  }, delays[0]);
}
$('hangup').onclick = () => { call && call.disconnect(); device && device.destroy(); };

// ---- demo mode (?demo=1): scripted fake cycle, clearly labeled demo data ----
let curTurn = 0;
if (DEMO) {
  $('demotag').style.display = '';
  $('ev1t').textContent = 'synthetic';
  $('tlf').innerHTML = '<b>Demo mode: values and timings are scripted, not real measurements;</b> '
    + $('tlf').innerHTML.replace('each row = one event actually observed', 'each row = one scripted synthetic event (not actually observed)').replace('events not observed do not appear and are not filled in by estimation', 'events not triggered do not appear');
  inCall = true;
  clkOff = 0; clkRtt = 42;
  edge.s = [38, 40, 41, 39, 42, 40, 41]; edge.first = 77; edge.cf = { colo: 'FRA', tcpRtt: 22, proto: 'h2' };
  mediaRtts = [108, 111, 112, 110]; netMedia = { pairRttMs: 111, up: { jitterMs: 3, lossFraction: 0, rttMs: 111, packetsLost: 0 }, down: { jitterMs: 4, packetsLost: 0, packetsReceived: 800, jitterBufferMs: 42 }, sent: { packets: 780, bytes: 62000 } };
  relayNet = { colo: 'FRA', country: 'DE', tcpRtt: 9, proto: 'h2' };
  renderNetPanel();
  resetChain();
  const cycle = () => {
    curTurn = (curTurn || 0) + 1;
    const A = Date.now();
    inVol = 0.3;                       // tick fires B1
    evLog('<b class="evm">● heard you speaking…</b>(demo)');
    setTimeout(() => { inVol = 0.02; }, 1800);  // tick fires B2 after quiet window
    setTimeout(() => { handleLive({ type:'stt_done', turn:curTurn, utteranceId:'DEMO-LOCAL:u'+curTurn, ts:A+4500, promptChars:12 }, Date.now()); }, 4400);
    setTimeout(() => { handleLive({ type:'boundary', turn:curTurn, boundary:'llm_request_start', epochTime:A+4550, monotonicTime:1000, sequence:2 }, Date.now()); }, 4500);
    setTimeout(() => { handleLive({ type:'boundary', turn:curTurn, boundary:'llm_first_nonempty_token', epochTime:A+5400, monotonicTime:1850, sequence:3 }, Date.now());
      handleLive({ type:'llm_first', turn:curTurn, utteranceId:'DEMO-LOCAL:u'+curTurn, responseId:'DEMO-LOCAL:r'+curTurn, ts:A+5400, ms:900 }, Date.now());
      rtc = { rtt:96, jitter:12, mos:4.3, lost:0, codec:'opus' }; renderNet(); }, 5100);
    setTimeout(() => { handleLive({ type:'boundary', turn:curTurn, boundary:'relay_text_send_start', chunkSeq:1, epochTime:A+5420, monotonicTime:1870, sequence:4 }, Date.now()); }, 5200);
    setTimeout(() => { handleLive({ type:'llm_done', turn:curTurn, ts:A+6100, ms:1600, chars:30 }, Date.now()); }, 5800);
    setTimeout(() => { outVol = 0.4; }, 6300);    // tick fires B3
    setTimeout(() => { outVol = 0.02; }, 9500);   // tick fires B4 after quiet window
  };
  cycle(); setInterval(cycle, 14000);
  setInterval(() => { if (speaking && inVol > IN_TH) inVol = 0.2 + Math.random() * 0.5; if (playActive && outVol > OUT_TH) outVol = 0.2 + Math.random() * 0.5; }, 120);
}
resetChain();
renderChain();
</script></body></html>`;

export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) {
    return new Response(GATE_PAGE, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const m = modelsInfo(env);
  const row = (k, v, s2, c) => '<div class="mrow"><span class="mk">' + k + '</span><span class="mv">' + v + '</span><span class="msrc ' + c + '">' + s2 + '</span></div>';
  const modelsCard = '<div class="models">'
    + row('STT', m.stt, 'explicitly configured', 'ok')
    + row('LLM', m.llm, 'explicitly configured', 'ok')
    + row('TTS', m.tts, 'explicitly configured', 'ok')
    + row('TTS voice', m.ttsVoice, 'doc default', 'warn')
    + row('TTS model', m.ttsModel, 'not configurable', 'bad')
    + '</div>';
  return new Response(CALL_PAGE.replaceAll("__MODELS_CARD__", modelsCard), { headers: { "content-type": "text/html; charset=utf-8" } });
}
