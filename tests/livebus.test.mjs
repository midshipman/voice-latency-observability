// LiveBus replay buffer (worker/worker.js) with mocked Durable Object runtime. Synthetic messages, no content.
import { LiveBus } from '../worker/worker.js';
let pass=0,fail=0; const chk=(n,c,x)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x))); };
globalThis.WebSocketPair = class { constructor(){ const mk=()=>({sent:[],att:null,send(m){this.sent.push(m)},serializeAttachment(a){this.att=a},deserializeAttachment(){return this.att}}); this[0]=mk(); this[1]=mk(); this[0].sent=this[1].sent; } };
const RealResponse=globalThis.Response;
globalThis.Response = class extends RealResponse { constructor(b,i){ if(i&&i.status===101){ super(null,{status:200}); this.webSocket=i.webSocket; this.fakeStatus=101; } else super(b,i); } static json(o){return RealResponse.json(o);} };
const mkState=()=>{ const socks=[]; return { socks, getWebSockets:()=>socks, acceptWebSocket:(w)=>socks.push(w) }; };
const pub=(bus,call,n,extra={})=>bus.fetch(new Request('https://lb/pub',{method:'POST',body:JSON.stringify({type:'partial',callSid:call,pseq:n,...extra})}));
const sub=async(bus,call,after)=>{ const r=await bus.fetch(new Request('https://lb/sub?callSid='+call+'&after='+after,{headers:{Upgrade:'websocket'}})); return r.webSocket; };
const seqs=ws=>ws.sent.map(m=>JSON.parse(m));
{ const st=mkState(), bus=new LiveBus(st,{}); for(let i=1;i<=5;i++) await pub(bus,'CA1',i); await pub(bus,'CA2',1);
  const ws=await sub(bus,'CA1',0); const m=seqs(ws);
  chk('late subscribe (after=0) gets all 5 earlier publishes of THIS call only, flagged replay',m.length===5&&m.every(x=>x.replay===true&&x.callSid==='CA1')&&m.map(x=>x.pseq).join()==='1,2,3,4,5',m.map(x=>x.pseq));
  const ws2=await sub(bus,'CA1',3); chk('after=3 replays only pseq>3 (4,5), no duplicates of already seen',seqs(ws2).map(x=>x.pseq).join()==='4,5',seqs(ws2).map(x=>x.pseq));
  const ws3=await sub(bus,'CA1',99); chk('after beyond max: nothing replayed',seqs(ws3).length===0);
  await pub(bus,'CA1',6); chk('live publish after subscribe is delivered once to subscribers of that call (and not flagged replay)',seqs(ws).at(-1).pseq===6&&!seqs(ws).at(-1).replay&&seqs(ws2).at(-1).pseq===6);
  chk('other call is isolated (CA2 buffer separate)',seqs(await sub(bus,'CA2',0)).length===1);
  await pub(bus,'CA1',7,{type:'call_end',pubTotal:7,pubFailed:0}); const w4=await sub(bus,'CA1',6); chk('call_end with total is replayable after the fact',seqs(w4).length===1&&seqs(w4)[0].type==='call_end'&&seqs(w4)[0].pubTotal===7,seqs(w4)); }
{ const bus=new LiveBus(mkState(),{}); for(let i=1;i<=450;i++) await pub(bus,'CB',i);
  const m=seqs(await sub(bus,'CB',0)); chk('buffer truncated to the newest 400: replay starts at pseq 51 (1-50 are unrecoverable)',m.length===400&&m[0].pseq===51&&m.at(-1).pseq===450,[m.length,m[0]&&m[0].pseq]); }
{ const bus=new LiveBus(mkState(),{}); for(let i=1;i<=3;i++) await pub(bus,'CC'+i,1);
  for(let i=4;i<=14;i++) await pub(bus,'CC'+i,1);
  chk('only the newest 12 calls are buffered (oldest evicted)',seqs(await sub(bus,'CC1',0)).length===0&&seqs(await sub(bus,'CC14',0)).length===1); }
{ const bus=new LiveBus(mkState(),{}); chk('DO rebuilt (new instance): no buffer, subscribe works and replays nothing (loss is detectable by the page via pseq gaps)',seqs(await sub(bus,'CA1',0)).length===0); }
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
