import assert from 'node:assert/strict';
import {handleRelaySession} from '../pages/functions/_lib.js';
import {MetricsStore} from '../worker/worker.js';
const originalTimers={setTimeout,clearTimeout,setInterval,clearInterval};
globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
let count=0;const chk=(name,ok)=>{assert.ok(ok,name);console.log('PASS',name);count++;};
async function run(mode){
 const storage={};const db=new MetricsStore({storage:{get:async k=>structuredClone(storage[k]),put:async(k,v)=>{storage[k]=structuredClone(v);}}},{});
 const saved=[];const promises=[];const sent=[];let handler,closeH;const pub=[];
 const ws={accept(){},addEventListener(type,fn){if(type==='message')handler=fn;if(type==='close')closeH=fn;},send(body){const x=JSON.parse(body);if(mode==='send-fail'&&x.token==='hello')throw new Error('send failed');sent.push(x);},close(){}};
 const env={LLM_MODEL:'unchanged-model',SYSTEM_PROMPT:'test',AI:{run:async(model,payload)=>{
  chk(mode+' model/payload unchanged',model==='unchanged-model'&&payload.stream===true);
  if(mode==='ai-fail')throw new Error('test fail');
  const data=mode==='empty'?'data: [DONE]\n':'data: {"response":""}\ndata: {"response":"hello"}\ndata: {"response":"world"}\ndata: [DONE]\n';
  return new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(data));c.close();}});
 }}};
 const gate={fetch:async()=>Response.json({ok:true})};
 // Real handler emits through actual MetricsStore, write serialization imitates DO storage concurrency gate.
 let chain=Promise.resolve();const metrics={fetch:(u,i)=>{const task=chain.then(()=>db.fetch(new Request(u,i)));chain=task.catch(()=>{});return task;}};
 handleRelaySession(ws,env,{waitUntil:p=>promises.push(p)},gate,metrics,{fetch:async(u,i)=>{const b=JSON.parse(i.body);(Array.isArray(b)?b:[b]).forEach(x=>pub.push(x));return Response.json({ok:true});}},'lease');
 await handler({data:JSON.stringify({type:'setup',callSid:'SIM-SERVER-'+mode})});
 await handler({data:JSON.stringify({type:'prompt',last:true,voicePrompt:'DO NOT STORE THIS',lang:'en-US'})});
 await handler({data:JSON.stringify({type:'event',name:'agentSpeaking',value:true,token:'DO NOT STORE THIS',arbitrarySecret:'NEVER SAVE'})});
 await handler({data:JSON.stringify({type:'tokens-played',token:'DO NOT STORE THIS',turn:999})});
 closeH&&closeH(); /* v5y: records are batched; closing the socket flushes the last batch */ await Promise.all(promises);await chain;
 const result=await (await db.fetch(new Request('https://m/sessions'))).json();
 const events=result.sessions[0].events;
 const notices=events.filter(e=>e.event==='speaker'||e.event==='tokens_played');
 chk(mode+' notifications uncorrelated call-level',notices.length===2&&notices.every(e=>e.turn===null&&e.association==='call_only'));
 chk(mode+' minimal shape no values or unknown keys',notices.every(e=>e.shape.token==='string'&&!('arbitrarySecret'in e.shape))&&!JSON.stringify(notices).includes('DO NOT STORE THIS'));
 const b=events.filter(e=>e.event==='boundary');const names=b.map(e=>e.boundary);
 chk(mode+' actual final arrival persisted',b[0].boundary==='relay_final_received'&&b[0].receivedAt!=null);
 chk(mode+' request before any response',names.indexOf('llm_request_start')>=0);
 chk(mode+' clock/session/turn/seq persisted',b.every((e,i)=>e.clockDomain==='server'&&e.callSid==='SIM-SERVER-'+mode&&e.turn===1&&e.sequence===i+1&&Number.isFinite(e.monotonicTime)&&Number.isFinite(e.epochTime)));
 chk(mode+' protocol ids on every boundary',b.every(e=>e.utteranceId==='SIM-SERVER-'+mode+':u1'&&e.responseId==='SIM-SERVER-'+mode+':r1'&&e.source==='ws-server'));
 chk(mode+' no content in persisted boundaries',!JSON.stringify(events).includes('DO NOT STORE THIS')&&!b.some(e=>'token'in e||'text'in e));
 chk(mode+' live events retain source timestamp',pub.filter(e=>e.type==='boundary').every(e=>e.epochTime!=null&&e.sequence>=1&&e.utteranceId!=null));
 if(mode==='ai-fail')chk('AI failure is explicit, not fake first token',names.includes('llm_failed')&&!names.includes('llm_first_nonempty_token'));
 else if(mode==='send-fail')chk('send failure not attributed to model',names.includes('relay_text_send_failed')&&names.includes('turn_transport_failure')&&!names.includes('llm_failed'));
 else{
  chk(mode+' stream handle boundary present',names.includes('llm_response_stream_received'));
  chk(mode+' stream end explicit',names.includes('llm_stream_end'));
  const turn=events.find(e=>e.event==='turn');
  if(mode==='empty')chk('empty stream has no first token',turn.tLlmFirstToken===undefined&&turn.requestToFirstTokenMs===null);
  else {
   chk('first nonempty token only once',names.filter(n=>n==='llm_first_nonempty_token').length===1);
   chk('owned local intervals numeric',turn.finalHandlerToRequestMs>=0&&turn.requestToFirstTokenMs>=0);
   chk('six-metric server half computed',turn.forwardFirstChunkMs>=0&&turn.aiTotalGenMs>=0);
   chk('turn carries protocol ids',turn.utteranceId==='SIM-SERVER-'+mode+':u1'&&turn.responseId==='SIM-SERVER-'+mode+':r1');
   const sends=b.filter(e=>e.boundary==='relay_text_send_returned');
   chk('v5z4: only the first chunk and the last=true marker get boundary records; the middle chunk is folded into turn.textChunks (count, chars, returned)',sends.length===2&&sends[0].chunkSeq===1&&sends.at(-1).last===true&&turn.textChunks.chunks===3&&turn.textChunks.returned===3&&turn.textChunks.failed===0&&turn.textChunks.foldedBoundaries===2);
   chk('text return timestamp is not provider acknowledgment',!names.some(n=>n.includes('provider_received')));
  }
 }
}
try{for(const mode of ['success','empty','ai-fail','send-fail'])await run(mode);}finally{Object.assign(globalThis,originalTimers);}
console.log(count+' passed');
