// Backchannel replay (SYNTHETIC timing, not a real call): a short mic sound ("mm-hm") while the agent plays, with NO server interrupt and NO final. The page must keep the playing chain, open no STT wait and not switch turn.
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
const T=1000000; const at=s=>T+Math.round(s*1000);
const A=[]; const live=(s,m)=>A.push({t:at(s),f:()=>ctx.handleLive(m,clock)}); const vol=(s,v)=>A.push({t:at(s),f:()=>vm.runInContext('inVol='+v,ctx)});
vol(1,0.3); live(1.05,{type:'speaker',who:'client',on:true}); vol(2.5,0); live(2.5,{type:'speaker',who:'client',on:false}); live(2.5,{type:'stt_done',turn:1,ts:at(2.5),promptChars:5});
live(3.4,{type:'speaker',who:'agent',on:true}); A.push({t:at(3.5),f:()=>vm.runInContext('outVol=0.3',ctx)});
vol(6,0.25); vol(6.5,0); // backchannel blip, 0.5 s, no server event follows
A.push({t:at(11),f:()=>vm.runInContext('outVol=0',ctx)}); live(11,{type:'speaker',who:'agent',on:false});
A.sort((a,b)=>a.t-b.t);
vm.runInContext("inCall=true;callSid='REPLAY';browserSessionId='r';clkOff=0;clkRtt=40;resetChain();",ctx);
const T0=at(0.5), T1=at(13); const fr=[]; let ai=0;
for(clock=T0;clock<=T1;clock+=20){ while(ai<A.length&&A[ai].t<=clock){A[ai].f();ai++;} if((clock-T0)%60===0) vm.runInContext('tick('+clock+')',ctx); else ctx.renderChain();
  fr.push({t:(clock-T0)/1000+0.5,st2:el('st2').innerHTML,st7:el('st7').innerHTML,e2e:el('e2e').innerHTML,ev:el('ev').innerHTML,turn:vm.runInContext('cur&&cur.turn',ctx)}); }
const during=fr.filter(f=>f.t>=6.1&&f.t<8);
chk('backchannel: event log says suspected speech, unconfirmed, chain kept',/suspected speech/.test(fr.at(-1).ev)&&/keeping the current chain/.test(fr.at(-1).ev),null);
chk('backchannel: no STT wait opens (no transcript wait in progress) at any time after the final',fr.filter(f=>f.t>=3).every(f=>!/transcript wait<\/span><b>[0-9.]+s in progress/.test(f.e2e)),fr.find(f=>f.t>=3&&/transcript wait<\/span><b>[0-9.]+s in progress/.test(f.e2e)));
chk('backchannel: turn number does not change',new Set(fr.filter(f=>f.t>=3).map(f=>f.turn)).size===1,[...new Set(fr.map(f=>f.turn))]);
chk('backchannel: playing node still shows working during and right after the blip',fr.filter(f=>f.t>=6.1&&f.t<10).every(f=>/working/.test(f.st7)),fr.find(f=>f.t>=6.1&&f.t<10&&!/working/.test(f.st7)));
chk('backchannel: suspected speech end logged as unconfirmed, no turn switch',/suspected speech ended, not confirmed by the server/.test(fr.at(-1).ev),null);
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
