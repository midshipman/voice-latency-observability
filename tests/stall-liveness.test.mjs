// v5y regression: the page's server-event liveness stamp (lastRelayEventTs) must advance with every /live message except pong.
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
const T=5000000, at=s=>T+Math.round(s*1000);
vm.runInContext(`inCall=true;callSid='LIVENESS';browserSessionId='r';clkOff=0;clkRtt=40;resetChain();turnRows.clear();lastRelayEventTs=${at(0)};stallMode=false;`,ctx);
// 1) the stamp follows messages, pong excluded
clock=at(30); ctx.handleLive({type:'call_start'},clock);
chk('a live message at t=30s moves lastRelayEventTs to that time',vm.runInContext('lastRelayEventTs',ctx)===at(30),vm.runInContext('lastRelayEventTs',ctx));
clock=at(31); ctx.handleLive({type:'pong',c:at(31)-40,s:at(31)-20},clock);
chk('pong does not move lastRelayEventTs',vm.runInContext('lastRelayEventTs',ctx)===at(30),vm.runInContext('lastRelayEventTs',ctx));
// 2) 40 s into a call, a 6 s LLM wait with fresh events must light the LLM lamp and not be stalled
const BD=(w,n,b,x)=>({type:'boundary',boundary:b,turn:n,epochTime:at(w),monotonicTime:w*1000,sequence:Math.round(w*1000),...(x||{})});
clock=at(40); ctx.handleLive({type:'speaker',who:'client',on:true},clock); clock=at(41); ctx.handleLive({type:'speaker',who:'client',on:false},clock);
clock=at(41); ctx.handleLive({type:'stt_done',turn:1,ts:at(41),promptChars:5},clock); ctx.handleLive(BD(41,1,'relay_final_received'),clock); ctx.handleLive(BD(41.01,1,'llm_request_start'),clock);
let lampOn=0,stalled=0;
for(clock=at(41);clock<=at(46);clock+=100){ vm.runInContext('tick('+clock+')',ctx); if(Math.round((clock-T)/100)%10===0)vm.runInContext('stallCheck('+clock+')',ctx);
  if(vm.runInContext('lit(4)',ctx))lampOn++; if(vm.runInContext('stallMode',ctx))stalled++; }
chk('t=41-46s (call is 40 s old): LLM lamp stays lit while the request is outstanding',lampOn>=45,lampOn);
chk('t=41-46s: no stall mode (last event was 0-5 s ago)',stalled===0,stalled);

// 3) v5z3: LLM first-token wait of 10.8 s (shape of the user's turn 8) with /live alive (pongs): lamp stays lit, text note only, no stall mode
function scenario(silenceS, pongs){
  vm.runInContext(`inCall=true;callSid='LIVENESS2';browserSessionId='r';clkOff=0;clkRtt=40;resetChain();turnRows.clear();lastRelayEventTs=${at(100)};lastLiveMsgTs=${at(100)};stallMode=false;quietMode=false;relayClientOn=false;relayAgentOn=false;liveLost=false;`,ctx);
  clock=at(100); ctx.handleLive({type:'stt_done',turn:9,ts:at(100),promptChars:5},clock); ctx.handleLive(BD(100,9,'relay_final_received'),clock); ctx.handleLive(BD(100.01,9,'llm_request_start'),clock);
  const fr=[]; let nextPong=at(105);
  for(clock=at(100);clock<=at(100+silenceS);clock+=100){ if(pongs&&clock>=nextPong){ ctx.handleLive({type:'pong',c:clock-40,s:clock-20},clock); nextPong+=5000; }
    vm.runInContext('tick('+clock+')',ctx); if(Math.round((clock-T)/100)%10===0)vm.runInContext('stallCheck('+clock+')',ctx);
    fr.push({t:(clock-at(100))/1000,lit4:vm.runInContext('lit(4)',ctx),stall:vm.runInContext('stallMode',ctx),quiet:vm.runInContext('quietMode',ctx),dm:el('dm').innerHTML}); }
  return fr; }
{ const fr=scenario(11.5,true);
  chk('10.8 s silent LLM wait, /live alive: LLM lamp lit on every sample',fr.every(f=>f.lit4),fr.filter(f=>!f.lit4).length);
  chk('10.8 s silent LLM wait, /live alive: never stall mode',fr.every(f=>!f.stall));
  chk('10.8 s silent LLM wait: after 10 s the card says waiting/unconfirmed (not progress, not failure)',/waiting/.test(fr.at(-1).dm)&&/status unconfirmed/.test(fr.at(-1).dm),fr.at(-1).dm); }
{ const fr=scenario(33,true);
  chk('33 s silent wait, /live alive: lamp lit until 30 s, off after (stall mode, "status unconfirmed")',fr.filter(f=>f.t<29).every(f=>f.lit4)&&fr.filter(f=>f.t>31).every(f=>!f.lit4&&f.stall)&&/status unconfirmed/.test(fr.at(-1).dm),{beforeOk:fr.filter(f=>f.t<29).every(f=>f.lit4),after:fr.filter(f=>f.t>31).some(f=>f.lit4)}); }
{ const fr=scenario(17,false);
  chk('/live channel lost (no pong for 17 s): lamp off and stall mode (cannot confirm anything)',fr.at(-1).stall===true&&fr.at(-1).lit4===false,fr.at(-1)); }
console.log(`stall-liveness: ${pass} pass, ${fail} fail`); process.exit(fail?1:0);
