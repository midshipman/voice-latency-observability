// Code-level test (replay with a controllable fake model stream; not a real call).
import assert from 'node:assert/strict';
import {handleRelaySession} from '../pages/functions/_lib.js';
const T={setTimeout,clearTimeout,setInterval,clearInterval};
globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
const logged=[];const _log=console.log;console.log=(...a)=>{if(typeof a[0]==='string'&&a[0].startsWith('{"event"')){try{logged.push(JSON.parse(a[0]));}catch{}}else _log(...a);};
let n=0;const chk=(m,ok)=>{assert.ok(ok,m);console.log('PASS',m);n++;};
function mk(){
  const streams=[];const sent=[];const recs=[];let handler,closeH;let cancelled=0;
  const env={LLM_MODEL:'m',SYSTEM_PROMPT:'s',AI:{run:async()=>{let ctl;const rs=new ReadableStream({start(c){ctl=c;},cancel(){cancelled++;}});streams.push(ctl);return rs;}}};
  const ws={accept(){},addEventListener(t,f){if(t==='message')handler=f;if(t==='close')closeH=f;},send(b){sent.push(JSON.parse(b));},close(){}};
  const gate={fetch:async()=>Response.json({ok:true})};
  const metrics={fetch:async(u,i)=>{try{const b=JSON.parse(i.body);(Array.isArray(b)?b:[b]).forEach(x=>recs.push(x));}catch{}return Response.json({ok:true});}};
  handleRelaySession(ws,env,{waitUntil(){}},gate,metrics,{fetch:async()=>Response.json({ok:true})});
  const enc=new TextEncoder();
  const tok=(i,t)=>{try{streams[i].enqueue(enc.encode('data: {"response":"'+t+'"}\n'));}catch{}}; // enqueue after cancel throws: that is the released stream
  const flush=()=>new Promise(r=>setImmediate(r));
  return {handler:m=>handler({data:JSON.stringify(m)}),streams,sent,recs,tok,flush,end:i=>{try{streams[i].enqueue(enc.encode('data: [DONE]\n'));streams[i].close();}catch{}},cancelled:()=>cancelled,close:()=>closeH&&closeH()};
}
const txt=s=>s.sent.filter(x=>x.type==='text');
// A: interrupt while generating -> no more text, no last=true, model stream released
{const s=mk();await s.handler({type:'setup',callSid:'CA-T-A'});
 const p=s.handler({type:'prompt',last:true,voicePrompt:'q1',lang:'en-US'});await s.flush();
 s.tok(0,'aa');await s.flush();
 await s.handler({type:'interrupt',utteranceUntilInterrupt:'a',durationUntilInterruptMs:100});
 s.tok(0,'bb');await s.flush();s.end(0);await p;
 const t=txt(s);
 chk('A: only pre-interrupt token was sent',t.length===1&&t[0].token==='aa');
 chk('A: no last=true for the cancelled reply',!t.some(x=>x.last===true));
 chk('A: model stream released',s.cancelled()===1);}
// B: new final while the previous reply is still generating -> old stream stops, new one completes
{const s=mk();await s.handler({type:'setup',callSid:'CA-T-B'});
 const p1=s.handler({type:'prompt',last:true,voicePrompt:'early',lang:'en-US'});await s.flush();
 s.tok(0,'x1');await s.flush();
 const p2=s.handler({type:'prompt',last:true,voicePrompt:'full sentence',lang:'en-US'});await s.flush();
 s.tok(0,'x2');await s.flush();s.end(0);await p1;
 s.tok(1,'y1');await s.flush();s.end(1);await p2;
 const t=txt(s).map(x=>x.token+(x.last?'|L':''));
 chk('B: old reply stops at supersede, new reply complete: '+t.join(','),t.join(',')==='x1,y1,|L');
 chk('B: exactly one last=true (new reply)',txt(s).filter(x=>x.last).length===1);
 s.close();for(let i=0;i<5;i++)await s.flush();
 const turns=logged.filter(e=>e.event==='turn'&&e.callSid==='CA-T-B');
 chk('B: old turn record flagged cancelled, new not',turns.some(e=>e.turn===1&&e.cancelled==='superseded_by_new_final')&&turns.some(e=>e.turn===2&&!e.cancelled));
 const ends=logged.filter(e=>e.event==='boundary'&&e.boundary==='llm_stream_end'&&e.callSid==='CA-T-B');
 chk('B: both turns still close the LLM lamp (llm_stream_end), old one flagged',ends.length===2&&ends.some(e=>e.turn===1&&e.cancelled));}
// C: untouched path: no interrupt -> full reply and last=true as before
{const s=mk();await s.handler({type:'setup',callSid:'CA-T-C'});
 const p=s.handler({type:'prompt',last:true,voicePrompt:'q',lang:'en-US'});await s.flush();
 s.tok(0,'a');s.tok(0,'b');await s.flush();s.end(0);await p;
 chk('C: normal turn unchanged',txt(s).map(x=>x.token+(x.last?'|L':'')).join(',')==='a,b,|L');}
// D: cancel before the first token; the next token must not produce a first-token boundary, a live llm_first, or a send
{const s=mk();await s.handler({type:'setup',callSid:'CA-T-D'});
 const p=s.handler({type:'prompt',last:true,voicePrompt:'q',lang:'en-US'});await s.flush();
 await s.handler({type:'interrupt',utteranceUntilInterrupt:'',durationUntilInterruptMs:0});
 s.tok(0,'late');await s.flush();s.end(0);await p;
 const ev=logged.filter(e=>e.callSid==='CA-T-D'&&e.event==='boundary').map(e=>e.boundary);
 chk('D: no first-token boundary after cancel',!ev.includes('llm_first_nonempty_token'));
 chk('D: no text sent, cancelled end recorded',txt(s).length===0&&logged.some(e=>e.callSid==='CA-T-D'&&e.boundary==='llm_stream_end'&&e.cancelled==='interrupt'));}
// E: stream errors after cancel: no fallback text, cancelled end kept (not llm_failed)
{const s=mk();await s.handler({type:'setup',callSid:'CA-T-E'});
 const p=s.handler({type:'prompt',last:true,voicePrompt:'q',lang:'en-US'});await s.flush();
 s.tok(0,'a');await s.flush();
 await s.handler({type:'interrupt',utteranceUntilInterrupt:'a',durationUntilInterruptMs:10});
 try{s.streams[0].error(new Error('boom'));}catch{}
 s.tok(0,'b');await p;
 const ev=logged.filter(e=>e.callSid==='CA-T-E'&&e.event==='boundary').map(e=>e.boundary);
 chk('E: no fallback text after cancel (only the pre-cancel token was sent)',txt(s).map(x=>x.token).join()==='a'&&!txt(s).some(x=>x.last));
 chk('E: ends as cancelled, not llm_failed',ev.includes('llm_stream_end')&&!ev.includes('llm_failed'));}
Object.assign(globalThis,T);console.log(n+' passed');
