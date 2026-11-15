// Offline cross-check of one call: our server-side stored events vs Twilio Voice Insights ConversationRelay events (carrier_edge, ALL pages).
// usage: node scripts/crosscheck-call.mjs <server-events.json> <insights.json>
// server-events.json: {events:[...]} (our stored events); insights.json: {events_carrier_edge:[...], summary:{...}}
// Output: counts per kind, paired time differences (ours minus Twilio, ms), Twilio-only quantities, and the Summary figures re-derived from events.
import fs from 'node:fs';
const [,, srvFile, insFile] = process.argv;
const srv = JSON.parse(fs.readFileSync(srvFile,'utf8')).events, ins = JSON.parse(fs.readFileSync(insFile,'utf8'));
const cr = ins.events_carrier_edge.filter(e=>e.group==='conversation_relay').sort((a,b)=>a.conversation_relay_data.sequence_number-b.conversation_relay_data.sequence_number);
const T = e => Date.parse(e.timestamp), tw = n => cr.filter(e=>e.name===n).map(T);
const ev = srv;
const fin = ev.filter(e=>e.boundary==='relay_final_received').map(e=>e.receivedAt);
const send1 = ev.filter(e=>e.boundary==='relay_text_send_start'&&e.chunkSeq===1);
const last = ev.filter(e=>e.boundary==='relay_text_send_start'&&e.last===true);
const sp = (who,on)=>ev.filter(e=>e.event==='speaker'&&e.who===who&&e.on===on).map(e=>e.receivedAt);
const itr = ev.filter(e=>e.event==='interrupt');
const pair = (a,b,tol=1500)=>{ const used=new Set(), r=[]; for(const x of a){ let best=null; for(const y of b){ if(used.has(y)) continue; const d=Math.abs(y-x); if(d<=tol&&(!best||d<best[0])) best=[d,y]; } if(best){ used.add(best[1]); r.push(Math.round(x-best[1])); } } return r; };
const counts = {
  final_ours: fin.length, end_of_customer_speech_twilio: tw('end_of_customer_speech').length,
  client_on_ours: sp('client',true).length, start_of_customer_speech_twilio: tw('start_of_customer_speech').length,
  agent_on_ours: sp('agent',true).length, start_of_agent_speech_twilio: tw('start_of_agent_speech').length,
  agent_off_ours: sp('agent',false).length, end_of_agent_speech_twilio: tw('end_of_agent_speech').length,
  interrupt_ours: itr.length, interrupt_twilio: tw('interrupt').length,
  text_seq1_ours: send1.length, first_token_received_twilio: tw('first_token_received').length,
  last_true_ours: last.length, final_token_received_twilio: tw('final_token_received').length,
};
// in-direction (Twilio stamps, we receive): ours minus Twilio should be about 0 when clocks agree
const inPairs = {
  final_vs_end_of_customer_speech: pair(fin,tw('end_of_customer_speech')),
  client_speaking_on: pair(sp('client',true),tw('start_of_customer_speech')),
  agent_speaking_on: pair(sp('agent',true),tw('start_of_agent_speech')),
  agent_speaking_off: pair(sp('agent',false),tw('end_of_agent_speech')),
  interrupt: pair(itr.map(e=>e.receivedAt),tw('interrupt')),
};
// out-direction (we send, Twilio stamps): Twilio minus ours
const outPair = (ours,theirs,tol)=>pair(ours.map(e=>e.epochTime),theirs,tol).map(v=>-v);
const outPairs = { text_seq1_to_first_token_received: outPair(send1,tw('first_token_received'),2500), last_true_to_final_token_received_nearest: outPair(last,tw('final_token_received'),400) };
// Twilio-side per-turn chain (Twilio clock only): application latency = first_token_received - final prompt (end_of_customer_speech); TTFA = start_of_agent_speech - same final
const eoc = tw('end_of_customer_speech').filter(t=>fin.some(f=>Math.abs(f-t)<=50)), // only end-of-speech events that carry one of our final prompts (the call may have a speech blip with no final)
   ft = tw('first_token_received'), sa = tw('start_of_agent_speech');
const appLat = [], ttfa = [];
const allEoc = tw('end_of_customer_speech');
// an event belongs to a final only if it comes before the next end_of_customer_speech (interrupted turns have no first_token_received)
for (const f of eoc){ const nextE = allEoc.find(x=>x>f+50) ?? Infinity; const a = ft.find(x=>x>=f && x<nextE); if(a!==undefined) appLat.push(Math.round(a-f)); const b = sa.find(x=>x>=f && x<nextE); if(b!==undefined) ttfa.push(Math.round(b-f)); }
const avg = a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
const s = (ins.summary.agent_session_summaries||[])[0]||{};
const derived = { application_latency_ms: {values:appLat,avg:avg(appLat),min:Math.min(...appLat),max:Math.max(...appLat)}, time_to_first_audio_ms:{values:ttfa,avg:avg(ttfa)} };
const summary = { processing_state: ins.summary.processing_state, turns: s.turns, application_latency_ms: s.application_latency_ms, time_to_first_audio_ms: s.time_to_first_audio_ms, stt_latency_ms: s.stt_latency_ms, tts_latency_ms: s.tts_latency_ms, interruptions: s.interruptions };
const cfg = (cr.find(e=>e.name==='configurations')||{}).conversation_relay_data?.configurations?.configurations || null;
// ours: final -> text seq1 (our TTFT + forward) per turn, to compare with Twilio application latency
const ours = ev.filter(e=>e.boundary==='relay_final_received').map((f,i)=>{ const s1=send1.find(x=>x.turn===f.turn); return s1? Math.round(s1.epochTime-f.receivedAt):null; });
console.log(JSON.stringify({counts, inDirection_oursMinusTwilio_ms:inPairs, outDirection_twilioMinusOurs_ms:outPairs, twilio_derived:derived, twilio_summary_reported:summary, ours_final_to_text_seq1_ms:ours, effective_config:cfg},null,1));
