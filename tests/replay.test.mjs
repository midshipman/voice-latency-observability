// Replays the REAL 3-round call CA...8593257b (11/2 11:33 CET, timestamps only, no content) through the actual page script on a fake clock,
// then checks every stage becomes visible in order. Network delivery delay is an assumption (DELIVERY_MS); clock offset uses the recorded -20ms (uncalibrated).
import fs from 'node:fs'; import vm from 'node:vm'; import { webcrypto } from 'node:crypto';
let pass=0,fail=0; const chk=(n,c,x)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x))); };
const fx=JSON.parse(fs.readFileSync(new URL('./fixtures/sample-3turn-timing.json',import.meta.url),'utf8'));
const DELIVERY_MS=Number(process.env.DELIVERY_MS||80);
// Synthetic utterance variants: only turn 1's speech length is changed (UTT_SPEAK_MS); everything after is shifted so the recorded transcript wait
// (speech end -> final) and downstream gaps stay exactly as recorded. PAUSE_MS inserts a short breath gap in the local volume mid-sentence.
const SPEAK=process.env.UTT_SPEAK_MS?Number(process.env.UTT_SPEAK_MS):null, PAUSE=Number(process.env.PAUSE_MS||0);
if(SPEAK){
  const t0=fx.tel[0], b1=t0.speechStartTs, oldEnd=t0.speechEndTs, delta=b1+SPEAK-oldEnd;
  const f=T=>T<=b1?T:(T<=oldEnd?b1+(T-b1)*SPEAK/(oldEnd-b1):T+delta);
  for(const e of fx.events){ const base=e.epochTime!=null?e.epochTime:e.receivedAt; if(base==null) continue; const d=f(base)-base;
    if(e.epochTime!=null)e.epochTime+=d; if(e.receivedAt!=null)e.receivedAt+=d; if(e.monotonicTime!=null)e.monotonicTime+=d; if(e.ts)e.ts=new Date(Date.parse(e.ts)+d).toISOString(); }
  for(const t of fx.tel) for(const k of Object.keys(t)) if(k.endsWith('Ts')&&k!=='speechStartTs'||(k==='speechStartTs'&&t.turn>1)) t[k]=f(t[k]);
}
let source=fs.readFileSync(new URL('../pages/functions/index.js',import.meta.url),'utf8');
source=source.replace(/^import .*;\n/,'').replace('const CALL_PAGE =','globalThis.CALL_PAGE =');
source=source.slice(0,source.indexOf('export async function'));
const template={PAGE_BUILD:'test'};vm.createContext(template);vm.runInContext(source,template);
const script=template.CALL_PAGE.match(/<script>\n([\s\S]*)<\/script>/)[1];
let clock=0; class FD extends Date{ static now(){ return clock; } }
const els=new Map();
const el=id=>{if(!els.has(id)) els.set(id,{textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},classList:{toggle(){}},querySelector:()=>({style:{}})});return els.get(id);};
class WS {constructor(){WS.last=this; this.readyState=1;} send(){} close(){}}
const ctx={console,URLSearchParams,location:{search:'',protocol:'https:',host:'test'},document:{getElementById:el,querySelectorAll:()=>[1,2,3,4,5,6,7].map(n=>({...el('node'+n),dataset:{s:String(n)}}))},WebSocket:WS,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,Date:FD,crypto:webcrypto,navigator:{userAgent:'test'},performance,fetch:async()=>({ok:true,json:async()=>({})})};
vm.createContext(ctx);vm.runInContext(script,ctx);
const off=fx.tel[0].clkOffsetMs; // server - browser (recorded; uncalibrated)
const toB=s=>s-off;                // server epoch -> browser clock
const A=[]; // actions {t, f}
const live=(srvTs,msg)=>A.push({t:toB(srvTs)+DELIVERY_MS,f:()=>ctx.handleLive(msg,clock)});
const sTs=e=>e.epochTime!=null?e.epochTime:(e.receivedAt!=null?e.receivedAt:Date.parse(e.ts));
for(const e of fx.events){
  const ts=sTs(e);
  if(e.event==='boundary'){
    live(ts,{type:'boundary',boundary:e.boundary,turn:e.turn,epochTime:e.epochTime,monotonicTime:e.monotonicTime,sequence:e.sequence,chunkSeq:e.chunkSeq});
    if(e.boundary==='relay_final_received') live(ts,{type:'stt_done',turn:e.turn,ts,promptChars:5});
    if(e.boundary==='llm_first_nonempty_token') live(ts,{type:'llm_first',turn:e.turn,ts,ms:100});
  } else if(e.event==='speaker') live(ts,{type:'speaker',who:e.who,on:e.on});
  else if(e.event==='tokens_played') live(ts,{type:'tokens_played'});
  else if(e.event==='turn') live(ts,{type:'llm_done',turn:e.turn,ts,ms:e.replyTotalMs||0,chars:5});
}
for(const t of fx.tel){
  if(t.speechStartTs!=null) A.push({t:t.speechStartTs,f:()=>{vm.runInContext('inVol=0.3',ctx);}});
  if(t.speechEndTs!=null) A.push({t:t.speechEndTs,f:()=>{vm.runInContext('inVol=0',ctx);}});
  if(PAUSE&&t.turn===1){const m=Math.round((t.speechStartTs+t.speechEndTs)/2); A.push({t:m,f:()=>{vm.runInContext('inVol=0',ctx);}}); A.push({t:m+PAUSE,f:()=>{vm.runInContext('inVol=0.3',ctx);}});}
  if(t.playStartTs!=null) A.push({t:t.playStartTs,f:()=>{vm.runInContext('outVol=0.3',ctx);}});
  if(t.playEndTs!=null) A.push({t:t.playEndTs,f:()=>{vm.runInContext('outVol=0',ctx);}});
}
A.sort((a,b)=>a.t-b.t);
const T0=Math.min(...A.map(a=>a.t))-500, T1=Math.max(...A.map(a=>a.t))+3000;
clock=T0; vm.runInContext(`inCall=true;callSid='REPLAY';browserSessionId='r';clkOff=${off};clkRtt=40;resetChain();`,ctx);
const frames=[]; let ai=0;
for(clock=T0;clock<=T1;clock+=20){
  while(ai<A.length&&A[ai].t<=clock){A[ai].f();ai++;}
  if((clock-T0)%60===0) vm.runInContext('tick('+clock+')',ctx); else ctx.renderChain();
  const lit=[],core=[],txt=[]; for(let i=1;i<=7;i++){lit.push(ctx.lit(i)?1:0); core.push(ctx.litCore(i)?1:0); txt.push(el('st'+i).innerHTML);} txt.push(...el('cnotes').innerHTML.split('<br>'));
  frames.push({t:clock-T0,lit,core,txt,e2e:el('e2e').innerHTML,st2:el('st2').innerHTML,dt:el('dt').textContent});
}
fs.writeFileSync('/tmp/replay-frames.json',JSON.stringify({T0,frames,tel:fx.tel.map(t=>({...t,b1:t.speechStartTs-T0,b2:t.speechEndTs-T0,rx:t.sttRecvTs-T0,ps:t.playStartTs-T0,pe:t.playEndTs-T0}))}));
const ivs=i=>{const r=[];let s=null;for(const f of frames){if(f.lit[i-1]&&s==null)s=f.t;if(!f.lit[i-1]&&s!=null){r.push([s,f.t]);s=null;}}if(s!=null)r.push([s,frames.at(-1).t]);return r;};
const within=(i,a,b)=>ivs(i).filter(([s,e])=>e>a&&s<b);
const total=(i,a,b)=>within(i,a,b).reduce((x,[s,e])=>x+Math.min(e,b)-Math.max(s,a),0);
const W=(turn,name)=>{const e=fx.events.find(x=>x.event==='boundary'&&x.turn===turn&&x.boundary===name);return toB(e.epochTime)+DELIVERY_MS-T0;};
for(const t of fx.tel){
  const k=t.turn, b1=t.speechStartTs-T0, b2=t.speechEndTs-T0, rx=t.sttRecvTs-T0, ps=t.playStartTs-T0;
  const w1=W(k,'relay_final_received'), w2=W(k,'llm_request_start'), w3=W(k,'llm_first_nonempty_token');
  const w4=toB(fx.events.find(x=>x.event==='boundary'&&x.turn===k&&x.boundary==='relay_text_send_start'&&x.chunkSeq===1).epochTime)+DELIVERY_MS-T0;
  // mic: local volume; off shortly after B2 (END_MS 500 + frame slack), well before the transcript returns
  const micEnd=ivs(1).filter(([s,e])=>s<=b2+50&&e>b1).map(x=>x[1])[0];
  chk(`round ${k}: mic goes gray within 0.65s of local speech end (not held to transcript)`,micEnd!=null&&micEnd-b2<=650,{micEnd,b2,rx});
  // STT inferred streaming + merged wait: continuous from local start to transcript arrival
  const stt=within(2,b1,w1-1); const cov=total(2,b1,w1-1);
  chk(`round ${k}: STT lit from local speech start to transcript arrival (<=0.3s late start allowed: speech began while the previous playback tail was still detected, so it is held as suspected)`,cov>=(w1-1-b1)-300,{cov,span:w1-b1});
  // each stage visible >=600ms in order after the transcript
  const vis=(i,a,b)=>total(i,a,b);
  chk(`round ${k}: /ws in visible >=600ms after transcript`,vis(3,w1-1,w1+1500)>=600,vis(3,w1-1,w1+1500));
  chk(`round ${k}: LLM visible >=600ms`,vis(4,w2-1,w3+1500)>=600,vis(4,w2-1,w3+1500));
  chk(`round ${k}: /ws out visible >=600ms after first text`,vis(5,w3-1,w3+2000)>=600,vis(5,w3-1,w3+2000));
  chk(`round ${k}: TTS (inferred) visible >=600ms after text sent`,vis(6,w4-1,w4+2500)>=600,vis(6,w4-1,w4+2500));
  chk(`round ${k}: speaker lit during local playback`,total(7,ps+100,Math.min(ps+1500,t.playEndTs?t.playEndTs-T0:ps+1500))>=1000,total(7,ps+100,ps+1500));
  const first=i=>{const w=within(i,i<=2?b1:w1-1,ps+2000);return w.length?Math.max(w[0][0],0):null;};
  const f=[2,3,4,5,6,7].map(first); const f2=f.slice(); 
  chk(`round ${k}: no stage skipped (all of STT,/ws in,LLM,/ws out,TTS,speaker light up)`,f.every(x=>x!=null),f);
  chk(`round ${k}: stages first light in chain order`,f.every((x,i)=>i===0||x>=f[i-1]),f);
}
// Speaking time must never be counted as STT/transcript wait (utterance-length independent)
{
  const t=fx.tel[0], b1=t.speechStartTs-T0, b2=t.speechEndTs-T0, w1=W(1,'relay_final_received');
  const num=(h,k)=>{const m=h.match(new RegExp(k+'<\\/span><b>([0-9.]+)s'));return m?Number(m[1])*1000:null;};
  const sec=(f)=>f.e2e;
  const mid=frames.filter(f=>f.t>=b2+800&&f.t<w1-100);
  chk('turn1: while waiting for the transcript the STT node counts from speech END (not start)',mid.length>0&&mid.every(f=>{const m=f.st2.match(/transcript wait<br>([0-9.]+)s/);return m&&Math.abs(Number(m[1])*1000-(f.t-b2))<=250;}),mid.slice(0,2).map(f=>f.st2));
  chk('turn1: key-times strip shows speaking time separately and it equals local speech length',(()=>{const f=frames.find(f=>f.t>=w1+300);const m=f.e2e.match(/You speak<\/span><b>([0-9.]+)s/);return m&&Math.abs(Number(m[1])*1000-(b2-b1))<=200;})(),frames.find(f=>f.t>=w1+300).e2e);
  chk('turn1: final transcript-wait value = speech end to transcript, independent of speech length',(()=>{const f=frames.find(f=>f.t>=w1+300);const m=f.e2e.match(/transcript wait<\/span><b>([0-9.]+)s/);return m&&Math.abs(Number(m[1])*1000-(w1-b2))<=250;})(),frames.find(f=>f.t>=w1+300).e2e);
  chk('turn1: STT never goes gray between speech start and transcript (longest gap <=150ms)',(()=>{let g=0,mx=0;for(const f of frames.filter(f=>f.t>=b1+300&&f.t<w1-50)){if(!f.lit[1]){g+=20;mx=Math.max(mx,g);}else g=0;}return mx<=150;})());
  chk('stage card title matches the STT node: receiving while speaking, transcript wait after speech end (never a bare "STT working")',frames.filter(f=>f.t>=b1+400&&f.t<b2-300).every(f=>f.dt.includes('STT receiving'))&&mid.every(f=>f.dt.includes('STT transcript wait')),[frames.find(f=>f.t>=b1+400).dt,mid[0]&&mid[0].dt]);
  if(PAUSE) chk('breath pause inside a sentence does not drop the mic light',frames.filter(f=>f.t>=b1+200&&f.t<b2-200).every(f=>f.core[0]));
}
// held stages are labelled as display hold, never as a measured zero
const heldTxt=frames.flatMap(f=>f.txt.filter(x=>x.includes('<b>')&&x.includes('display held')));
chk('held frames exist and say display held, not a duration',heldTxt.length>0&&heldTxt.every(x=>x.includes('not a duration')));
chk('no frame claims 0ms for a held stage',heldTxt.every(x=>!/(^|[^0-9])0ms/.test(x)));
chk('instant /ws stages say below stamp resolution',heldTxt.some(x=>x.includes('below stamp resolution')));
// 700ms hold must not read as several stages working at once: held stages are dashed/steady (class hold), working stages are not
const maxCore=Math.max(...frames.map(f=>f.core.slice(2,7).reduce((a,b)=>a+b,0)));
chk('at most 1 stage among STT..speaker is truly working in the same frame except the legit mic+STT / TTS+speaker overlaps',frames.every(f=>f.core.slice(2,6).reduce((a,b)=>a+b,0)<=2),maxCore);
chk('held stage count never exceeds 3 per frame',frames.every(f=>f.lit.map((v,i)=>v&&!f.core[i]?1:0).reduce((a,b)=>a+b,0)<=3));
if(process.env.DBG){for(const f of frames){const h=f.lit.map((v,i)=>v&&!f.core[i]?i+1:0).filter(Boolean);if(h.length>2||f.core.slice(1,6).reduce((a,b)=>a+b,0)>1)console.log(f.t,'held',h,'core',f.core.map((v,i)=>v?i+1:0).filter(Boolean).join(','));}}
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
