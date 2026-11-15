// v5y: DO calls (subrequests) per /ws invocation. Free plan allows 1,000 internal subrequests per invocation (Cloudflare Workers limits page).
// Real call CA53b1729...: 503 stored events + ~one live publish each = the cap; everything after ~148 s was lost.
// This test drives the real handleRelaySession for 24 s of dense traffic (3 partials/s, a final turn every 3 s with 15 text chunks) with mock stubs
// that count calls and throw after 1000, and checks the projected call at the 10-minute hard cap stays far below 1000 and nothing is lost.
import { handleRelaySession } from '../pages/functions/_lib.js';
import { MetricsStore } from '../worker/worker.js';
let pass=0,fail=0; const chk=(n,c,x)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x))); };
const storage={}; const db=new MetricsStore({storage:{get:async k=>structuredClone(storage[k]),put:async(k,v)=>{storage[k]=structuredClone(v);},delete:async k=>{delete storage[k];}}},{});
let calls=0, pubCalls=0, pubMsgs=0, metricCalls=0; const LIMIT=1000;
const count=()=>{ if(++calls>LIMIT) throw new Error('Too many subrequests'); };
let chain=Promise.resolve();
const metrics={fetch:(u,i)=>{count(); metricCalls++; const t=chain.then(()=>db.fetch(new Request(u,i))); chain=t.catch(()=>{}); return t;}};
const live={fetch:async(u,i)=>{count(); pubCalls++; const b=JSON.parse(i.body); pubMsgs+=Array.isArray(b)?b.length:1; return Response.json({ok:true});}};
const gate={fetch:async()=>{count(); return Response.json({ok:true});}};
const promises=[]; let handler,closeH;
const ws={accept(){},addEventListener(t,fn){if(t==='message')handler=fn;if(t==='close')closeH=fn;},send(){},close(){}};
const env={LLM_MODEL:'m',SYSTEM_PROMPT:'s',AI:{run:async()=>new ReadableStream({start(c){const e=new TextEncoder(); for(let i=0;i<15;i++) c.enqueue(e.encode('data: {"response":"chars"}\n')); c.enqueue(e.encode('data: [DONE]\n')); c.close();}})}};
handleRelaySession(ws,env,{waitUntil:p=>promises.push(p)},gate,metrics,live,'lease');
const msg=o=>handler({data:JSON.stringify(o)}); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await msg({type:'setup',callSid:'CA-BUDGET',from:'client:x'});
const SECS=24; let finals=0;
for(let s=0;s<SECS;s++){ for(let k=0;k<3;k++){ await msg({type:'prompt',last:false,voicePrompt:'x'.repeat(k+1)}); await sleep(333); }
  if(s%3===2){ finals++; await msg({type:'info',name:'clientSpeaking',value:true}); await msg({type:'prompt',last:true,voicePrompt:'How are you',lang:'en-US'}); await msg({type:'info',name:'agentSpeaking',value:true}); await msg({type:'info',name:'agentSpeaking',value:false}); } }
const before=calls;
closeH(); await Promise.all(promises); await chain;
const perSec=before/SECS; const proj=perSec*600;
console.log({secs:SECS,finals,doCallsBeforeClose:before,doCallsTotal:calls,metricCalls,pubCalls,pubMsgs,perSec:perSec.toFixed(2),projected10min:Math.round(proj)});
chk('no call failed against the 1000 limit',calls<=LIMIT,calls);
const sess=(await (await db.fetch(new Request('https://m/sessions'))).json()).sessions[0];
const turns=sess.events.filter(e=>e.event==='turn').length;
chk('every turn stored',turns===finals,{turns,finals});
{ const pp=sess.events.filter(e=>e.event==='partial_prompt').length, ps=sess.events.filter(e=>e.event==='partial_summary'); chk('v5z4: partials folded: first-of-utterance records + summaries carry all '+SECS*3,ps.reduce((a,e)=>a+e.count,0)===SECS*3&&pp===ps.length,{pp,summaries:ps.length,sum:ps.reduce((a,e)=>a+e.count,0)}); }
chk('end record written with the final batch (no separate /finish)',sess.end&&sess.end.turns===finals&&typeof sess.end.subrequests==='number',sess.end);
const msgsTotal=pubMsgs+sess.events.length;
chk('batching: at least 5 messages (live + stored) per DO call (fewer stored events since v5z4); unbatched v5x needed one call per message',msgsTotal/(calls-3)>=5,{msgsTotal,calls});
const bp=sess.end.subrequestsByPurpose; chk('end record has per-purpose DO call counters that add up',bp&&bp.gateAttach+bp.gateBind+bp.gateRelease+bp.metricsBatch+bp.livePubs===sess.end.subrequests,{bp,total:sess.end.subrequests}); console.log('by purpose',JSON.stringify(bp),'recorded',JSON.stringify(sess.end.recordedEventsByType),'aggregated',JSON.stringify(sess.end.aggregated));
console.log('v5x equivalent DO calls for this traffic ~',msgsTotal,'; v5y',calls);
// guard: tiny budget (soft 20, hard 40) with the same dense traffic must degrade, drop, and still deliver the end record and release
{ const st2={}; const db2=new MetricsStore({storage:{get:async k=>structuredClone(st2[k]),put:async(k,v)=>{st2[k]=structuredClone(v);},delete:async k=>{delete st2[k];}}},{});
  let c2=0, rel2=0; const ch2={p:Promise.resolve()};
  const m2={fetch:(u,i)=>{c2++; const t=ch2.p.then(()=>db2.fetch(new Request(u,i))); ch2.p=t.catch(()=>{}); return t;}};
  const l2={fetch:async()=>{c2++; return Response.json({ok:true});}}; const g2={fetch:async(u)=>{c2++; if(String(u).includes('release'))rel2++; return Response.json({ok:true});}};
  const pr=[]; let h2,cl2; const w2={accept(){},addEventListener(t,fn){if(t==='message')h2=fn;if(t==='close')cl2=fn;},send(){},close(){}};
  handleRelaySession(w2,{...env,SUB_SOFT:'20',SUB_HARD:'40'},{waitUntil:p=>pr.push(p)},g2,m2,l2,'lease');
  const m=o=>h2({data:JSON.stringify(o)});
  await m({type:'setup',callSid:'CA-GUARD'});
  for(let s=0;s<14;s++){ for(let k=0;k<3;k++){ await m({type:'prompt',last:false,voicePrompt:'xx'}); await sleep(333);} if(s%2===1) await m({type:'prompt',last:true,voicePrompt:'Hello',lang:'en-US'}); }
  const used=c2; cl2(); await Promise.all(pr); await ch2.p;
  const s2=(await (await db2.fetch(new Request('https://m/sessions'))).json()).sessions[0];
  chk('guard: DO calls before close stay at or below hard budget + small slack',used<=40+8,used);
  chk('guard: end record still written after budget exhausted, with dropped count and degraded flag',s2.end&&s2.end.subrequestDropped>0&&s2.end.subrequestDegraded===true,s2.end);
  chk('guard: gate release still sent at close',rel2===1,rel2);
  chk('guard: degraded marker event recorded',s2.events.some(e=>e.event==='subrequest_budget_degraded'));
}
console.log(`subrequest-budget: ${pass} pass, ${fail} fail`); process.exit(fail?1:0);
