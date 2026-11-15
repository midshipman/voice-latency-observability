// Worker->/live->page sequence reconciliation (SYNTHETIC replay): pseq gaps, duplicates, missing call_end
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
// Timing (seconds, relative) taken from the real barge-in call CA9ddc5c...: final of turn 2 arrives 0.7s BEFORE the local mic detects the end of speech.
vm.runInContext("inCall=true;callSid='REPLAY';browserSessionId='r';resetChain();liveSeq={seen:new Set(),dup:0,total:null,failed:null};liveSeqReport=null;",ctx);
clock=1000;
[1,2,2,4,5].forEach(n=>ctx.handleLive({type:'partial',chars:3,pseq:n},clock));
let r0=vm.runInContext('liveSeqReport',ctx);
chk('no call_end yet: no verdict (unknown total)',r0===null);
ctx.handleLive({type:'call_end',turns:1,ms:5,pseq:7,pubTotal:7,pubFailed:1},clock);
const r=JSON.parse(JSON.stringify(vm.runInContext('liveSeqReport',ctx)));
chk('sent 7, received distinct 5 (1,2,4,5,7), dup 1, missing 2 (#3,#6), source failed 1',r.sent===7&&r.received===5&&r.dup===1&&r.missing===2&&r.missingSeq.join()==='3,6'&&r.beforeSubscribe===0&&r.publishFailedAtSource===1,r);
vm.runInContext("liveSeq={seen:new Set(),dup:0,total:null,failed:null};liveSeqReport=null;",ctx);
[3,4,6].forEach(n=>ctx.handleLive({type:'partial',chars:3,pseq:n},clock)); ctx.handleLive({type:'call_end',pseq:7,pubTotal:7,pubFailed:0},clock);
const r2=JSON.parse(JSON.stringify(vm.runInContext('liveSeqReport',ctx)));
chk('late subscription: #1,#2 counted as before-subscribe, #5 as a real gap',r2.beforeSubscribe===2&&r2.missing===1&&r2.missingSeq[0]===5,r2);
// --- reconnect replay through the real connectLive/onmessage path
{ const nodeState=()=>[1,2,3,4,5,6,7].map(i=>el('st'+i).innerHTML).join('|');
  vm.runInContext("inCall=true;callSid='CAx';liveSeq={seen:new Set(),dup:0,total:null,failed:null};liveSeqReport=null;resetChain();",ctx);
  vm.runInContext("connectLive()",ctx); const w1=ctx.WebSocket.last;
  const send=(w,o)=>w.onmessage({data:JSON.stringify(o)});
  send(w1,{type:'call_start',pseq:1,replay:true}); send(w1,{type:'partial',chars:2,pseq:2,replay:true});
  chk('initial replay is applied as normal events and counted',vm.runInContext('liveSeqMax()',ctx)===2&&/call connected/.test(el('ev').innerHTML));
  send(w1,{type:'partial',chars:2,pseq:3});
  // reconnect: new socket, after=3
  vm.runInContext("liveWs.onclose&&0; connectLive()",ctx); const w2=ctx.WebSocket.last; chk('reconnect creates a new socket',w2!==w1);
  const before=nodeState(), evBefore=el('ev').innerHTML.length;
  send(w2,{type:'speaker',who:'client',on:true,pseq:4,replay:true});   // missed during the drop
  send(w2,{type:'partial',chars:2,pseq:3,replay:true});               // already seen
  chk('reconnect replay does not change lamps/nodes (stale state is not re-applied)',nodeState()===before,[before,nodeState()]);
  chk('reconnect replay is counted: #4 recovered, #3 counted as duplicate, logged as catch-up after reconnect',vm.runInContext('liveSeq.seen.has(4)&&liveSeq.dup',ctx)===1&&/catch-up after reconnect #4/.test(el('ev').innerHTML));
  send(w1,{type:'partial',chars:2,pseq:9}); chk('messages from the stale (old) socket are ignored',!vm.runInContext('liveSeq.seen.has(9)',ctx));
  send(w2,{type:'call_end',turns:0,ms:1,pseq:6,pubTotal:6,pubFailed:0,replay:true});
  const rep=JSON.parse(JSON.stringify(vm.runInContext('liveSeqReport',ctx)));
  chk('call_end via replay yields the reconciliation: sent 6, received 1,2,3,4,6, gap #5 after subscription',rep&&rep.sent===6&&rep.received===5&&rep.missingSeq.join()==='5',rep); }
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
