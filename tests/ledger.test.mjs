// Per-turn telemetry ledger (tseq): worker recordLedger + ledgerSummary + browser-side counters. Synthetic, no content.
// then checks every stage becomes visible in order. Network delivery delay is an assumption (DELIVERY_MS); clock offset uses the recorded -20ms (uncalibrated).
import { recordLedger } from '../worker/worker.js'; import { ledgerSummary } from '../pages/functions/_lib.js'; import fs from 'node:fs'; import vm from 'node:vm'; import { webcrypto } from 'node:crypto';
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
const row=(n,x={})=>({callSid:'CAl',browserSessionId:'b1',tseq:n,...x});
// 1) clean call with final
{ let m={}; [1,2,3].forEach(n=>recordLedger(m,row(n,n===3?{tfinal:true}:{}),false)); const L=ledgerSummary(Object.values(m)[0]);
  chk('clean: 3 sent (final seen), 3 received, no gap',L.sentTotal===3&&L.received===3&&L.gaps===0&&/contiguous, no gaps/.test(L.note),L); }
// 2) loss: #2 never arrived, browser reported 1 network failure
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,row(3,{tfinal:true,tnet:1}),false); const L=ledgerSummary(Object.values(m)[0]);
  chk('loss: gap #2 detected, total known from final, explained by 1 self-reported failure (not item-matched)',L.gaps===1&&L.gapSeq[0]===2&&L.sentTotal===3&&/not less than/.test(L.note)&&/not matched one by one/.test(L.note),L); }
// 3) unreported loss
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,row(4,{tfinal:true}),false); const L=ledgerSummary(Object.values(m)[0]);
  chk('unreported loss: gaps 2,3 with 0 self-reported failures is flagged as not explained',L.gaps===2&&/there are losses that were not self-reported/.test(L.note),L.note); }
// 4) duplicate (resend of same seq / retry) counted once, dup counted
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,row(1),false); recordLedger(m,row(2,{tfinal:true}),false); const L=ledgerSummary(Object.values(m)[0]);
  chk('duplicate seq: counted once as received, dup=1',L.received===2&&L.dup===1,L); }
// 5) worker-rejected row (bad_row) still has a seq: received but not stored
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,row(2),true); recordLedger(m,row(3,{tfinal:true}),false); const L=ledgerSummary(Object.values(m)[0]);
  chk('worker-rejected row: received 3, rejected 1, stored 2',L.received===3&&L.rejectedAtWorker===1&&L.stored===2,L); }
// 6) missing tail beacon: no final -> total unknown, only gaps reported
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,row(2),false); const L=ledgerSummary(Object.values(m)[0]);
  chk('missing final beacon: sentTotal unknown (null) and note says tail unknown',L.sentTotal===null&&/tail send count unknown/.test(L.note),L); }
// 7) tail beacon lost but earlier gap visible
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,row(3),false); const L=ledgerSummary(Object.values(m)[0]);
  chk('no final but an inner gap is still reported',L.sentTotal===null&&L.gaps===1,L); }
// 8) invalid / legacy rows are ignored (old builds without tseq, junk values)
{ let m={}; recordLedger(m,{callSid:'CAl'},false); recordLedger(m,row(0),false); recordLedger(m,row(-3),false); recordLedger(m,row(1.5),false); recordLedger(m,row('7'),false); recordLedger(m,{tseq:2},false);
  chk('legacy/invalid rows create no ledger entry',Object.keys(m).length===0,m); }
// 9) browser sessions separated; newest-30 eviction
{ let m={}; recordLedger(m,row(1),false); recordLedger(m,{...row(1),browserSessionId:'b2'},false); chk('two browser sessions of one call are separate ledgers',Object.keys(m).length===2);
  let q={}; for(let i=0;i<40;i++){ recordLedger(q,{callSid:'C'+i,browserSessionId:'b',tseq:1},false); q[Object.keys(q).at(-1)].last=i; } chk('keeps only the newest 30 call ledgers',Object.keys(q).length===30&&!q['C0/b']&&q['C39/b'],Object.keys(q).length); }
// 10) browser side: counters and final flag through the real teleSend
{ const sent=[]; let mode='ok';
  ctx.fetch=(u,o)=>{ sent.push(JSON.parse(o.body)); return mode==='ok'?Promise.resolve({ok:true}):mode==='rej'?Promise.resolve({ok:false,status:400}):Promise.reject(new Error('net')); };
  ctx.navigator={userAgent:'t',sendBeacon:(u,b)=>{sent.push(JSON.parse(b));return true;}};
  vm.runInContext("callSid='CAl';teleSeq=0;teleRej=0;teleNet=0;teleFail=0;cur={turn:1};",ctx);
  vm.runInContext("teleSend(false)",ctx); mode='rej'; vm.runInContext("teleSend(false)",ctx); await new Promise(r=>setTimeout(r,5)); mode='net'; vm.runInContext("teleSend(false)",ctx); await new Promise(r=>setTimeout(r,5)); mode='ok';
  vm.runInContext("teleSend(false)",ctx); vm.runInContext("teleSend(true,true)",ctx);
  chk('browser: tseq increments per send attempt 1..5',sent.map(x=>x.tseq).join()==='1,2,3,4,5',sent.map(x=>x.tseq));
  chk('browser: HTTP rejection and network failure are counted separately and reported on later sends',sent[3].trej===1&&sent[3].tnet===1&&sent[4].trej===1&&sent[4].tnet===1,sent.map(x=>[x.trej,x.tnet]));
  chk('browser: only the end-of-call beacon carries final=true',sent.map(x=>!!x.tfinal).join()==='false,false,false,false,true',sent.map(x=>x.tfinal)); }
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
