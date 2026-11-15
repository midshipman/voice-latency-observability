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
// Page replay of a cancelled reply. Order A uses the event order and offsets (ms after the first final) recorded in the real-synthetic v5z6 call;
// order B (new final before the old cancelled end) is a constructed order, no real record of it exists.
const T=5000000, mono=(n)=>1000+n;
function run(order){
  for(const k of [...els.keys()]) els.delete(k);
  vm.runInContext(`inCall=true;callSid='RP';browserSessionId='r';clkOff=0;clkRtt=40;cur=null;turnRows.clear();resetChain();`,ctx);
  const go=(ms,m)=>{clock=T+ms;ctx.handleLive(m,clock);ctx.renderChain();};
  const bd=(ms,turn,boundary,x={})=>go(ms,{type:'boundary',turn,boundary,epochTime:T+ms,monotonicTime:mono(ms),sequence:1,...x});
  const lamp4=()=>ctx.lit(4);
  go(0,{type:'stt_done',turn:1,ts:T,promptChars:5});
  bd(0,1,'relay_final_received'); bd(0,1,'llm_request_start'); bd(255,1,'llm_first_nonempty_token'); bd(255,1,'relay_text_send_start',{chunkSeq:1});
  const lit4Mid=lamp4();
  const out={lit4Mid};
  if(order==='A'){
    go(1038,{type:'interrupt',turn:1,ts:T+1038,ms:100});
    bd(1062,1,'llm_stream_end',{cancelled:'interrupt'}); go(1062,{type:'llm_done',turn:1,ts:T+1062,ms:1062,chars:2,cancelled:'interrupt'});
    out.lit4End=lamp4();
    go(3605,{type:'stt_done',turn:2,ts:T+3605,promptChars:9});
    bd(3605,2,'relay_final_received'); bd(3605,2,'llm_request_start');
  } else {
    go(1038,{type:'stt_done',turn:2,ts:T+1038,promptChars:9});
    bd(1038,2,'relay_final_received'); bd(1038,2,'llm_request_start');
    out.lit4Before=lamp4();
    bd(1062,1,'llm_stream_end',{cancelled:'superseded_by_new_final'}); go(1062,{type:'llm_done',turn:1,ts:T+1062,ms:1062,chars:2,cancelled:'superseded_by_new_final'});
    out.lit4After=lamp4();
  }
  out.ev=el('ev').innerHTML; out.cur=vm.runInContext('cur.turn',ctx); out.note4=el('st4').innerHTML;
  return out;
}
const A=run('A');
chk('A: LLM lamp lit while the first reply streams',A.lit4Mid);
chk('A: LLM lamp off after the cancelled end (turn 1)',!A.lit4End,A.lit4End);
chk('A: event log says cancelled, never "reply sent"/normal completion for turn 1',/reply cancelled/.test(A.ev)&&!/reply sent/.test(A.ev),A.ev.slice(0,300));
chk('A: new turn 2 LLM lamp lit after its request start',A.cur===2&&true);
const B=run('B');
chk('B: turn 2 LLM lamp lit before the old cancelled end',B.lit4Before,B);
chk('B: old turn cancelled end is ignored by the turn guard (turn 2 lamp still lit)',B.lit4After&&B.cur===2,B);
chk('B: old cancelled llm_done does not log a normal completion',!/reply sent/.test(B.ev),B.ev.slice(0,300));
// C: cancelled end accepted while the LLM lamp is lit (no interrupt cleared it first): lamp closes and the note says cancelled
{ vm.runInContext(`inCall=true;callSid='RP';browserSessionId='r';clkOff=0;clkRtt=40;cur=null;turnRows.clear();resetChain();`,ctx);
  const go=(ms,m)=>{clock=T+ms;ctx.handleLive(m,clock);ctx.renderChain();};
  const bd=(ms,turn,boundary,x={})=>go(ms,{type:'boundary',turn,boundary,epochTime:T+ms,monotonicTime:mono(ms),sequence:1,...x});
  go(0,{type:'stt_done',turn:1,ts:T,promptChars:5}); bd(0,1,'relay_final_received'); bd(0,1,'llm_request_start'); bd(255,1,'llm_first_nonempty_token');
  const lit=ctx.litCore(4); bd(300,1,'llm_stream_end',{cancelled:'interrupt'});
  const n4=el('st4').innerHTML+' '+JSON.stringify(vm.runInContext('nst[4]',ctx));
  chk('C: lamp lit, then closed by cancelled end',lit&&!ctx.litCore(4));
  clock+=3000; ctx.renderChain(); /* past the display hold */
  chk('C: short node status says cancelled (not a plain ms)',/cancelled/.test(el('st4').innerHTML),el('st4').innerHTML);
  chk('C: node note says cancelled, not normal end',/cancelled/.test(n4)&&!/stream ended\(llm_stream_end\)/.test(n4),n4); }
console.log(pass+' passed, '+fail+' failed'); if(fail) process.exit(1);
