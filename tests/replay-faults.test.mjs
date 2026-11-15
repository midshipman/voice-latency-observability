// (barge-in negative control) based on timing of real call CAxxxxxxxx (r12); // original header: Replays the REAL 3-round call CA...8593257b (11/2 11:33 CET, timestamps only, no content) through the actual page script on a fake clock,
// then checks every stage becomes visible in order. Network delivery delay is an assumption (DELIVERY_MS); clock offset uses the recorded -20ms (uncalibrated).
import fs from 'node:fs'; import vm from 'node:vm'; import { webcrypto } from 'node:crypto';
let pass=0,fail=0; const chk=(n,c,x)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x))); };
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

// Synthetic fault/rapid-turn replays (NOT real-call evidence): event shapes follow the real Relay messages; volumes and gaps are scripted.
const T=2000000; const at=s=>T+Math.round(s*1000);
function run(script,endS){ // script: [[sec,'live',msg] | [sec,'vol',v] | [sec,'out',v]]
  const A=script.map(([s,k,m])=>({t:at(s),f:k==='live'?()=>ctx.handleLive(m,clock):k==='vol'?()=>vm.runInContext('inVol='+m,ctx):()=>vm.runInContext('outVol='+m,ctx)})).sort((a,b)=>a.t-b.t);
  vm.runInContext(`inCall=true;callSid='REPLAY';browserSessionId='r';clkOff=0;clkRtt=40;resetChain();turnRows.clear();attrSpeechStartTs=null;lastRelayEventTs=${at(0)};stallMode=false;`,ctx);
  const fr=[];let ai=0;const T0=at(0);
  for(clock=T0;clock<=at(endS);clock+=20){while(ai<A.length&&A[ai].t<=clock){A[ai].f();ai++;} if((clock-T0)%60===0)vm.runInContext('tick('+clock+')',ctx);else ctx.renderChain(); if((clock-T0)%1000===0)vm.runInContext('stallCheck('+clock+')',ctx);
    fr.push({t:(clock-T0)/1000,st:[1,2,3,4,5,6,7].map(i=>vm.runInContext('nst['+i+'].st',ctx)),st2:el('st2').innerHTML,e2e:el('e2e').innerHTML,banner:vm.runInContext('stallMode',ctx),lh:{d:el('livehealth').style.display,x:el('livehealth').textContent},html:[1,2,3,4,5,6,7].map(i=>el('st'+i).innerHTML).join('|')});}
  return fr;}
const BD=(w,n,b,x)=>[w,'live',Object.assign({type:'boundary',boundary:b,turn:n,epochTime:at(w),monotonicTime:w*1000,sequence:Math.round(w*1000)},x||{})];
const CHAIN=(w,n)=>[BD(w,n,'relay_final_received'),BD(w+0.01,n,'llm_request_start'),BD(w+0.3,n,'llm_first_nonempty_token'),[w+0.3,'live',{type:'llm_first',turn:n,ts:at(w+0.3),ms:300}],BD(w+0.31,n,'relay_text_send_start',{chunkSeq:1}),BD(w+0.6,n,'llm_stream_end'),[w+0.6,'live',{type:'llm_done',turn:n,ts:at(w+0.6),ms:600,chars:5}]];
const S=(w,on)=>[w,'live',{type:'speaker',who:'client',on}], F=(w,n)=>[w,'live',{type:'stt_done',turn:n,ts:at(w),promptChars:5}];
// A) rapid turns: second utterance starts 0.4s after the first final, before the agent speaks
{const fr=run([[1,'vol',0.3],S(1,true),[2.5,'vol',0],S(2.5,true).slice(0,2).concat([{type:'speaker',who:'client',on:false}]),F(2.5,1),...CHAIN(2.5,1),[2.9,'vol',0.3],S(2.9,true),[4.2,'vol',0],[4.2,'live',{type:'speaker',who:'client',on:false}],F(4.3,2),...CHAIN(4.3,2),[5.5,'live',{type:'speaker',who:'agent',on:true}],[5.6,'out',0.3],[8,'out',0],[8,'live',{type:'speaker',who:'agent',on:false}]],11);
 chk('rapid turns: no "in progress" transcript wait left open after turn 2 final',fr.filter(f=>f.t>=5).every(f=>!/transcript wait<\/span><b>[0-9.]+s in progress/.test(f.e2e)),fr.find(f=>f.t>=5&&/in progress/.test(f.e2e)));
 chk('rapid turns: all stage lamps are idle or done at the end (nothing stuck working)',fr.at(-1).st.every(x=>x==='idle'||x==='done'),fr.at(-1).st);
 chk('rapid turns: only the two permitted lamp colours (no fail state)',fr.every(f=>!f.st.includes('fail')));}
// B) /live observation drop while waiting for the server: final arrives, then nothing for 15 s -> stall text (not a fail lamp), recovery clears it
{const fr=run([S(1,true),[1,'vol',0.3],[2,'vol',0],[2,'live',{type:'speaker',who:'client',on:false}],F(2,1),BD(2,1,'relay_final_received'),BD(2.01,1,'llm_request_start'),[19,'live',{type:'speaker',who:'agent',on:true}]],22);
 const mid=fr.filter(f=>f.t>=14&&f.t<18.5);
 chk('/live drop: after >10 s without events while waiting on the server the page says events stalled (text)',mid.some(f=>f.banner===true),mid.at(-1)&&mid.at(-1).html.slice(0,200));
 chk('/live drop: no stage ever enters fail during the gap',fr.every(f=>!f.st.includes('fail')));
 chk('/live drop: stall state clears when events resume',fr.at(-1).banner===false,fr.at(-1).banner);}
// B2) /live drop while the agent is PLAYING: not a business stall, but the observation channel loss must be visible and must clear on recovery
{const fr=run([S(1,true),[1,'vol',0.3],[2,'vol',0],[2,'live',{type:'speaker',who:'client',on:false}],F(2,1),...CHAIN(2,1),[3,'live',{type:'speaker',who:'agent',on:true}],[3.1,'out',0.3],[30,'out',0],[31,'live',{type:'speaker',who:'agent',on:false}],[31,'live',{type:'pong',c:0,s:0}]],33);
 const lost=fr.filter(f=>f.t>=20&&f.t<30), early=fr.filter(f=>f.t>=4&&f.t<14);
 chk('/live drop while playing: observation-channel loss text is shown after >15 s of silence on /live even though the agent is playing',lost.every(f=>f.lh.d===''&&/observation channel \(\/live\) lost/.test(f.lh.x)),lost[0]&&lost[0].lh);
 chk('/live drop while playing: the loss text says it does not mean the call dropped and is not shown early',early.every(f=>f.lh.d==='none')&&/does not mean the call has dropped/.test(lost[0].lh.x),early.find(f=>f.lh.d!=='none'));
 chk('/live drop while playing: no business stall banner and no fail lamp (agent playing is not a stall)',fr.every(f=>f.banner===false&&!f.st.includes('fail')));
 chk('/live drop while playing: loss text clears when any /live message (pong) returns',fr.at(-1).lh.d==='none',fr.at(-1).lh);
}
// C) relay error that keeps the session (64107) vs one that ends it (64105): only the latter may mark a lamp fail
{const k=classify=>run([S(1,true),[1,'vol',0.3],[2,'vol',0],[2,'live',{type:'speaker',who:'client',on:false}],F(2,1),[3,'live',{type:'relay_error',code:classify.code,endsSession:classify.ends,desc:'x'}]],6);
 const keep=k({code:64107,ends:false}), end=k({code:64105,ends:true});
 chk('relay error 64107 (session continues): no lamp fail',keep.every(f=>!f.st.includes('fail')),keep.at(-1).st);
 chk('relay error 64105 (ends session): any failure is limited to the lamp states, never a third colour (state set is idle/wait/done/fail only)',end.every(f=>f.st.every(x=>['idle','wait','done','fail'].includes(x))));}
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
