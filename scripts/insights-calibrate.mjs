// NOTE (v5z6): the first_token_received pairing below is NOT a receipt pairing: Relay's first_token_received lags our first send by 138-1564 ms (docs/CRITICAL-PATH.md 5.3), so the printed offset `bound` is invalid for that kind. Use scripts/crosscheck-call.mjs for the cross-check.
// Read-only calibration: pairs Twilio Voice Insights ConversationRelay events with the
// Worker's own receive/send stamps for the same call. Writes a NEW record; never edits raw events.
// usage: node scripts/insights-calibrate.mjs <out.json> <obsData.json>:<CallSid> [...]
// env:   TWILIO_KEY_SID_FILE, TWILIO_KEY_SECRET_FILE (read inside this process, never printed)
import fs from 'node:fs';
const [,, out, ...pairs] = process.argv;
const auth = 'Basic ' + Buffer.from(fs.readFileSync(process.env.TWILIO_KEY_SID_FILE,'utf8').trim()+':'+fs.readFileSync(process.env.TWILIO_KEY_SECRET_FILE,'utf8').trim()).toString('base64');
const get = async (u) => { const r = await fetch(u,{headers:{authorization:auth}}); if(!r.ok) throw new Error(u.split('?')[0].split('/').slice(-2).join('/')+' HTTP '+r.status); return r.json(); };
const med = a => { const s=[...a].sort((x,y)=>x-y); return s.length? s[Math.floor(s.length/2)] : null; };
// direction 'in' = Twilio stamps first, Worker receives; 'out' = Worker sends, Twilio stamps on receipt
const KINDS = [
  {name:'start_of_customer_speech', dir:'in',  worker:e=>e.event==='speaker'&&e.who==='client'&&e.on===true, t:e=>e.receivedAt, label:'clientSpeaking=true'},
  {name:'start_of_agent_speech',    dir:'in',  worker:e=>e.event==='speaker'&&e.who==='agent'&&e.on===true,  t:e=>e.receivedAt, label:'agentSpeaking=true'},
  {name:'prompt_sent',              dir:'in',  worker:e=>e.event==='boundary'&&e.boundary==='relay_final_received', t:e=>e.epochTime, label:'final prompt arrival (W1)'},
  {name:'first_token_received',     dir:'out', worker:e=>e.event==='boundary'&&e.boundary==='relay_text_send_start'&&e.chunkSeq===1, t:e=>e.epochTime, label:'first text send start (W4)'},
  {name:'final_token_received',     dir:'out', worker:e=>e.event==='boundary'&&e.boundary==='relay_text_send_start'&&e.last===true, t:e=>e.epochTime, label:'last=true send start (W6)'},
];
const rows = [], calls = [];
for (const p of pairs) {
  const [file, sid] = p.split(':');
  const d = JSON.parse(fs.readFileSync(file,'utf8'));
  const ss = Array.isArray(d.sessions) ? d.sessions : d.sessions.sessions;
  const s = ss.find(x=>x.callSid===sid); if(!s) throw new Error('session not found '+sid);
  // v5z6: follow meta.next_page_url. Up to v5z5 only page 1 (200 events) was read; a 117 s call has 204 carrier_edge events, so the last events were silently dropped.
  const pages = async (u) => { const all = []; while (u) { const r = await get(u); all.push(...r.events); u = r.meta && r.meta.next_page_url; } return all; };
  const ev = (await pages(`https://insights.twilio.com/v1/Voice/${sid}/Events?Edge=carrier_edge&PageSize=200`)).filter(e=>e.group==='conversation_relay');
  const lat = ev.filter(e=>e.name==='stt_latency'||e.name==='tts_latency').map(e=>({name:e.name,ms:(e.conversation_relay_data[e.name]||{}).latency_ms}));
  calls.push({sid, sessionId:(ev[0]||{}).conversation_relay_data?.session_id, insightsEvents:ev.length, latencyEvents:lat});
  for (const k of KINDS) {
    const tw = ev.filter(e=>e.name===k.name).map(e=>Date.parse(e.timestamp));
    const wk = s.events.filter(k.worker).map(k.t).filter(Number.isFinite);
    const used = new Set();
    for (const t of tw) { // nearest unused worker stamp within 1.5 s
      let best=-1,bd=1500; wk.forEach((w,i)=>{ if(used.has(i)) return; const dd=Math.abs(w-t); if(dd<bd){bd=dd;best=i;} });
      if (best>=0) { used.add(best); const w=wk[best]; rows.push({sid,kind:k.name,dir:k.dir,workerEvent:k.label,twilioMs:t,workerMs:w,deltaMs: k.dir==='in' ? w-t : t-w}); }
    }
  }
}
const summary = {};
for (const k of KINDS) { const r=rows.filter(x=>x.kind===k.name).map(x=>x.deltaMs); summary[k.name]={dir:k.dir,worker:k.label,n:r.length,min:r.length?Math.min(...r):null,median:med(r),max:r.length?Math.max(...r):null}; }
const inMin = Math.min(...rows.filter(x=>x.dir==='in').map(x=>x.deltaMs)), outMin = Math.min(...rows.filter(x=>x.dir==='out').map(x=>x.deltaMs));
// offset = workerClock - twilioClock. delivery>=0 gives  offset <= min(in)  and  offset >= -min(out)
const bound = { offsetUpperBoundMs: inMin, offsetLowerBoundMs: -outMin, intervalWidthMs: inMin + outMin, consistent: (-outMin) <= inMin,
  calibrated: (-outMin) <= inMin && (inMin + outMin) <= 100,
  note: 'bounds hold only if every paired event really is the same event and one-way delivery >= 0; they are bounds, not an estimate of the offset' };
fs.writeFileSync(out, JSON.stringify({generatedAt:new Date().toISOString(), calls, summary, bound, pairs:rows}, null, 1));
console.log(JSON.stringify({calls:calls.length, summary, bound}, null, 1));
