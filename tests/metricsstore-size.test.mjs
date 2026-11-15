// v5y: MetricsStore must keep recording when total session history exceeds the 2 MiB per-value storage limit.
// Mock DO storage enforces the limit on every put(); synthetic metadata events only. Negative control: run with the pre-v5y worker (WORKER_FILE).
import { MetricsStore } from '../worker/worker.js';
let pass=0,fail=0; const chk=(n,c,x)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x))); };
const LIMIT=2*1024*1024;
const mk=()=>{ const m=new Map(); return { m, async get(k){ const v=m.get(k); return v===undefined?undefined:JSON.parse(v); }, async put(k,v){ const s=JSON.stringify(v); if(s.length>LIMIT) throw new Error('Value too large: '+k); m.set(k,s); }, async delete(k){ m.delete(k); } }; };
const storage=mk(); const store=new MetricsStore({storage},{});
const post=(p,b)=>store.fetch(new Request('https://m'+p,{method:'POST',body:JSON.stringify(b)}));
let failed=0, ok=0;
// 50 earlier sessions, ~45 KB each (2.2 MB total), then one long call of 800 events
for(let s=0;s<50;s++){ for(let i=0;i<150;i++){ const r=await post('/event',{sessId:'old'+s,event:{event:'boundary',callSid:'CAold'+s,boundary:'x'.repeat(250),i,ts:'2026-11-03T00:00:00Z'}}); r.ok?ok++:failed++; } await post('/finish',{sessId:'old'+s,end:{turns:1}}); }
for(let i=0;i<800;i++){ const r=await post('/event',{sessId:'live1',event:{event:'boundary',callSid:'CAlive',boundary:'x'.repeat(250),i,ts:'2026-11-03T16:13:00Z'}}); r.ok?ok++:failed++; }
const fin=await post('/finish',{sessId:'live1',end:{turns:8}});
chk('no event write failed under 2 MiB-limit storage',failed===0,{failed,ok});
chk('/finish accepted',fin.ok,fin.status);
const r=await store.fetch(new Request('https://m/sessions')); const j=await r.json(); const live=j.sessions.find(x=>x.id==='live1');
chk('long call keeps all 800 events',live&&live.events.length===800,live&&live.events.length);
chk('long call has its end record',live&&live.end&&live.end.turns===8,live&&live.end);
chk('history capped at 50 sessions',j.sessions.length===50,j.sessions.length);
console.log(`metricsstore-size: ${pass} pass, ${fail} fail`); process.exit(fail?1:0);
