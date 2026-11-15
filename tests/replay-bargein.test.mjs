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
// Timing (seconds, relative) taken from the real barge-in call CA9ddc5c...: final of turn 2 arrives 0.7s BEFORE the local mic detects the end of speech.
// The local volume is synthetic (inVol set from the timings); only the relay event order/timing comes from the real call.
const T=1000000; const at=s=>T+Math.round(s*1000);
const off=0, A=[]; const live=(s,m)=>A.push({t:at(s),f:()=>ctx.handleLive(m,clock)}); const vol=(s,v)=>A.push({t:at(s),f:()=>vm.runInContext('inVol='+v,ctx)});
vol(9.2,0.3); live(9.263,{type:'speaker',who:'client',on:true});
live(11.521,{type:'speaker',who:'client',on:false}); live(11.521,{type:'stt_done',turn:1,ts:at(11.521),promptChars:5}); vol(11.0,0);
live(12.458,{type:'speaker',who:'agent',on:true}); A.push({t:at(12.5),f:()=>vm.runInContext('outVol=0.3',ctx)});
// barge-in: user speaks over playback
vol(15.9,0.3); live(15.871,{type:'interrupt',turn:1}); live(15.871,{type:'speaker',who:'agent',on:false}); live(15.871,{type:'speaker',who:'client',on:true});
A.push({t:at(15.95),f:()=>vm.runInContext('outVol=0',ctx)});
live(16.955,{type:'speaker',who:'client',on:false}); live(16.955,{type:'stt_done',turn:2,ts:at(16.955),promptChars:9});
vol(17.65,0); // mic lamp/end ~0.7s after the final
live(18.387,{type:'speaker',who:'agent',on:true});
A.sort((a,b)=>a.t-b.t);
vm.runInContext(`inCall=true;callSid='REPLAY';browserSessionId='r';clkOff=${off};clkRtt=40;resetChain();`,ctx);
const T0=at(8.5), T1=at(22); const fr=[]; let ai=0;
for(clock=T0;clock<=T1;clock+=20){ while(ai<A.length&&A[ai].t<=clock){A[ai].f();ai++;} if((clock-T0)%60===0) vm.runInContext('tick('+clock+')',ctx); else ctx.renderChain();
  fr.push({t:(clock-T0)/1000+8.5,nodes:[1,2,3,4,5,6,7].map(i=>el('st'+i).innerHTML).join(' | '),st2:el('st2').innerHTML,dt:el('dt').textContent,e2e:el('e2e').innerHTML,notes:el('cnotes').innerHTML,micLit:ctx.lit(1)}); }
const after=fr.filter(f=>f.t>=17.2&&f.t<18.3);
const stuck=fr.filter(f=>f.t>=17.0&&(/transcript wait<\/span><b>[0-9.]+s in progress/.test(f.e2e)||/transcript wait<br>[0-9.]+s/.test(f.st2)&&f.t>=17.9));
chk('turn 2: after the final is back, no new "transcript wait ... in progress" opens when the local mic end arrives later',stuck.length===0,stuck.slice(0,1).map(f=>[f.t,f.st2]));
chk('turn 2: STT node stays done (not working) from the final onward',fr.filter(f=>f.t>=17.2).every(f=>!/working/.test(f.st2)),fr.find(f=>f.t>=17.2&&/working/.test(f.st2)));
chk('turn 2: dt title does not say STT wait after the final',fr.filter(f=>f.t>=17.2&&f.t<18.3).every(f=>!/STT/.test(f.dt)),fr.find(f=>f.t>=17.2&&/STT/.test(f.dt)));
const sttWin=fr.filter(f=>f.t>=17.0&&f.t<17.6);
chk('STT node, final already in while the local mic still sounds: shows "final arrived/local sound continues", never "receiving"',sttWin.length>0&&sttWin.every(f=>/final arrived/.test(f.st2)&&!/receiving/.test(f.st2)),sttWin[0]&&sttWin[0].st2);
chk('turn 2: mic lamp still ends by the local volume (not held)',!fr.find(f=>f.t>=18.5).micLit);
// epoch-as-duration contamination guard: no stage text may contain a >=9-digit number (epoch) and no stage ms may exceed 1 hour
chk('no epoch-sized number is shown as a duration in any stage cell, note or key-times row (barge-in with old playback ending on the new chain)',fr.every(f=>!/\d{7,}/.test(f.nodes+f.notes+f.e2e)),fr.find(f=>/\d{7,}/.test(f.nodes+f.notes+f.e2e))&&[fr.find(f=>/\d{7,}/.test(f.nodes+f.notes+f.e2e)).t,(fr.find(f=>/\d{7,}/.test(f.nodes+f.notes+f.e2e)).nodes.match(/.{0,40}\d{7,}.{0,20}/)||[''])[0]]);
if(process.env.DBG)for(const f of fr.filter(f=>f.t>=15.8&&f.t<19&&Math.round(f.t*10)%3===0))console.log(f.t,f.nodes.replace(/<br>/g,' ').slice(0,260));
chk('barge-in: mic lamp stays working while the local mic is still speaking after the new-turn chain reset (final arrived at 16.955, mic ends ~17.65)',fr.filter(f=>f.t>=17.1&&f.t<17.5).every(f=>f.micLit),fr.find(f=>f.t>=17.1&&f.t<17.5&&!f.micLit)&&fr.find(f=>f.t>=17.1&&f.t<17.5&&!f.micLit).t);
chk('barge-in: unmeasured transcript wait is shown as not measured, not pending, once the final already arrived',fr.filter(f=>f.t>=18.5).every(f=>!/transcript wait<\/span><b>—<\/b> <span class="tag pend">pending/.test(f.e2e)),fr.find(f=>f.t>=18.5)&&fr.find(f=>f.t>=18.5).e2e.slice(0,300));
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
