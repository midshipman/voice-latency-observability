// (harness copied from stall-liveness) v5y regression: the page's server-event liveness stamp (lastRelayEventTs) must advance with every /live message except pong.
// Real defect (call CAxxxxxxxx, 2026-11-03): the update sat in liveSeqTrack where `recv` is undefined,
// so the stamp stayed at call start; >10 s into the call every server wait (LLM/TTS lamps) counted as "stalled" and the lamps were forced off.
import fs from 'node:fs'; import vm from 'node:vm'; import { webcrypto } from 'node:crypto';
let pass=0,fail=0; const chk=(n,c,x)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x))); };
const file=process.env.PAGE_FILE||'../pages/functions/index.js';
let source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
source=source.replace(/^import .*;\n/,'').replace('const CALL_PAGE =','globalThis.CALL_PAGE =');
source=source.slice(0,source.indexOf('export async function'));
const template={PAGE_BUILD:'test'};vm.createContext(template);vm.runInContext(source,template);
const script=template.CALL_PAGE.match(/<script>\n([\s\S]*)<\/script>/)[1];
let clock=0; class FD extends Date{ static now(){ return clock; } }
const els=new Map();
const el=id=>{if(!els.has(id)) els.set(id,{textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},classList:{toggle(){}},querySelector:()=>({style:{}})});return els.get(id);};
class WS {constructor(){WS.last=this; this.readyState=1;} send(){} close(){}}
const src=fs.readFileSync(new URL('./replay-faults.test.mjs',import.meta.url),'utf8');
const ctxLine=src.split('\n').find(l=>l.startsWith('const ctx='));
eval(ctxLine.replace('const ctx=','globalThis.__ctx='));
const ctx=globalThis.__ctx; vm.createContext(ctx);vm.runInContext(script,ctx);
const T=6000000, at=s=>T+Math.round(s*1000);
const BD=(w,n,b,x)=>({type:'boundary',boundary:b,turn:n,epochTime:at(w),monotonicTime:w*1000,sequence:Math.round(w*1000),...(x||{})});
// One LLM turn, 80 streamed chunks over 3 s. variant 'legacy' = per-chunk start+returned boundary events (v5x shape), 'headtail' = v5z4 shape.
function run(variant, failAt){
  vm.runInContext(`inCall=true;callSid='STREAM';browserSessionId='r';clkOff=0;clkRtt=40;resetChain();turnRows.clear();lastRelayEventTs=${at(0)};lastLiveMsgTs=${at(0)};stallMode=false;quietMode=false;relayClientOn=false;relayAgentOn=false;`,ctx);
  const ev=[]; // [time, message]
  ev.push([0,{type:'stt_done',turn:1,ts:at(0),promptChars:5}],[0,BD(0,1,'relay_final_received')],[0.01,BD(0.01,1,'llm_request_start')],[0.1,BD(0.1,1,'llm_response_stream_received')],[0.4,BD(0.4,1,'llm_first_nonempty_token')]);
  ev.push([0.41,BD(0.41,1,'relay_text_send_start',{chunkSeq:1,chars:2,last:false})],[0.41,BD(0.41,1,'relay_text_send_returned',{chunkSeq:1,chars:2,last:false})]);
  if(variant==='legacy') for(let k=2;k<=80;k++){ const t=0.41+k*0.0375; ev.push([t,BD(t,1,'relay_text_send_start',{chunkSeq:k,chars:2,last:false})],[t,BD(t,1,'relay_text_send_returned',{chunkSeq:k,chars:2,last:false})]); }
  if(failAt) ev.push([2.0,BD(2.0,1,'relay_text_send_failed',{chunkSeq:failAt,last:false})],[2.0,BD(2.0,1,'turn_transport_failure')]);
  else ev.push([3.4,BD(3.4,1,'llm_stream_end',{hasNonemptyToken:true})],[3.41,BD(3.41,1,'relay_text_send_start',{chunkSeq:81,chars:0,last:true})],[3.41,BD(3.41,1,'relay_text_send_returned',{chunkSeq:81,chars:0,last:true})]);
  ev.sort((a,b)=>a[0]-b[0]); let i=0; const frames=[];
  for(clock=at(0);clock<=at(5);clock+=50){ while(i<ev.length&&at(ev[i][0])<=clock){ ctx.handleLive(ev[i][1],at(ev[i][0])); i++; }
    vm.runInContext('tick('+clock+')',ctx);
    frames.push({t:(clock-T)/1000,lit:[1,2,3,4,5,6,7].map(n=>vm.runInContext('lit('+n+')',ctx)),st:[1,2,3,4,5,6,7].map(n=>vm.runInContext('nst['+n+'].st',ctx))}); }
  return frames; }
const flips=(fr,n)=>{ let c=0; for(let k=1;k<fr.length;k++) if(fr[k].lit[n]!==fr[k-1].lit[n]) c++; return c; };
const A=run('headtail'), L=run('legacy');
chk('same lamp states at every 50 ms sample with and without per-chunk events (the lamps are not driven per chunk)',A.every((f,k)=>JSON.stringify(f.lit)===JSON.stringify(L[k].lit)&&JSON.stringify(f.st)===JSON.stringify(L[k].st)),A.filter((f,k)=>JSON.stringify(f.st)!==JSON.stringify(L[k].st)).slice(0,2));
for(const n of [3,4,5]) chk('node '+(n+1)+' changes lit state at most twice during an 80-chunk stream (no flicker): '+flips(A,n),flips(A,n)<=2,flips(A,n));
chk('LLM lamp (node 4) lit from request until llm_stream_end (3.4 s), including after the first token (0.4 s)',A.filter(f=>f.t>0.05&&f.t<3.39).every(f=>f.lit[3]),A.filter(f=>f.t>0.05&&f.t<3.39&&!f.lit[3]).slice(0,2));
chk('LLM lamp off after llm_stream_end',A.filter(f=>f.t>3.45).every(f=>!f.lit[3]),A.at(-1));
chk('LLM and TTS-wait lamps are lit at the same time during the stream (real concurrency, 1.2-3.3 s)',A.filter(f=>f.t>1.2&&f.t<3.3).every(f=>f.lit[3]&&f.lit[5]),A.find(f=>f.t===2));
chk('WS-out (node 5) is not held lit for the stream: it passes at the first chunk',A.filter(f=>f.t>1.2).every(f=>!f.lit[4]),A.find(f=>f.t===2));
chk('stream end does not turn the TTS-wait lamp off by itself (playback is not observed here)',A.filter(f=>f.t>3.5).every(f=>f.lit[5]),A.at(-1));
{ const F=run('headtail',30);
  chk('send failure mid-stream: node 5 (WS out) shows failure, never silently passed',F.at(-1).st[4]==='fail',F.at(-1).st);
  chk('missing llm_stream_end after a failure: LLM node is not faked as done (stays unconfirmed wait)',F.at(-1).st[3]==='wait',F.at(-1).st);
}
console.log('lit/st sample at 2.0 s:',JSON.stringify(A.find(f=>f.t===2)));
console.log(`lamp-stream-stability: ${pass} pass, ${fail} fail`); process.exit(fail?1:0);
