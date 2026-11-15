import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { MetricsStore } from '../worker/worker.js';
import { onRequestPost } from '../pages/functions/telemetry.js';
import { makeSessionCookie } from '../pages/functions/_lib.js';
globalThis.crypto ||= webcrypto;
let pass=0;
const chk=(n,f)=>{assert.ok(f,n); console.log('PASS',n); pass++;};
const data={};
const db=new MetricsStore({storage:{get:async k=>structuredClone(data[k]),put:async(k,v)=>{data[k]=structuredClone(v);}}},{});
const env={PAGE_PASSCODE:'test-only', METRICS:{idFromName:n=>n,get:()=>({fetch:(u,i)=>db.fetch(new Request(u,i))})}};
const cookie=(await makeSessionCookie(env)).split(';')[0];
const post=body=>onRequestPost({env,request:new Request('https://test/telemetry',{method:'POST',headers:{cookie},body:JSON.stringify(body)})});
const fields={srvSpeakerOffTs:1000,srvSttDoneTs:1001,srvLlmFirstTs:1200,srvTokensPlayedTs:1400,clkOffsetMs:-250,clkRttMs:32,rtcRttMs:65,rtcJitterMs:12,rtcLostPkts:0,rtcMosX100:430,rtcCodec:'opus',pageBuild:'test',browserSessionId:'session-one'};
chk('two-layer POST accepted',(await post({callSid:'SIM-RELIABILITY',turn:1,v:2,sim:true,...fields})).status===200);
let stored=(await (await db.fetch(new Request('https://m/sessions'))).json()).telemetry[0];
for(const [k,v] of Object.entries(fields)) chk('two-layer stored '+k,stored[k]===v);
await post({callSid:'SIM-RELIABILITY',turn:1,sim:true,browserSessionId:'session-one',llmDoneRecvTs:1900});
stored=(await (await db.fetch(new Request('https://m/sessions'))).json()).telemetry[0];
chk('late field merged',stored.llmDoneRecvTs===1900);
chk('missing update cannot erase clock',stored.clkOffsetMs===-250);
await post({callSid:'SIM-RELIABILITY',turn:1,sim:true,browserSessionId:'session-two',sttRecvTs:2200});
chk('browser sessions cannot overwrite each other',data.telemetry.length===2);
await post({callSid:'SIM-RELIABILITY',turn:2,sim:true,clkOffsetMs:999999,rtcCodec:'opus',raw:'secret-content'});
chk('invalid offset fails closed',data.telemetry[2].clkOffsetMs===undefined || data.telemetry[2].clkOffsetMs===null);
chk('unknown content discarded',!('raw' in data.telemetry[2]));
// Execute the actual page JavaScript, including actual WebSocket event handlers.
let source=fs.readFileSync(new URL('../pages/functions/index.js',import.meta.url),'utf8');
source=source.replace(/^import .*;\n/,'').replace('const CALL_PAGE =','globalThis.CALL_PAGE =');
source=source.slice(0,source.indexOf('export async function'));
const template={PAGE_BUILD:'test'};vm.createContext(template);vm.runInContext(source,template);
const html=template.CALL_PAGE;
const script=html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const els=new Map();
const el=id=>{if(!els.has(id)) els.set(id,{textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},classList:{toggle(){}},querySelector:()=>({style:{}})});return els.get(id);};
const posts=[];
class WS {constructor(){WS.last=this; this.readyState=1;} send(){} close(){}}
const ctx={console,URLSearchParams,location:{search:'',protocol:'https:',host:'test'},document:{getElementById:el,querySelectorAll:()=>[1,2,3,4,5,6,7].map(n=>({...el('node'+n),dataset:{s:String(n)}}))},WebSocket:WS,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,Date,crypto:webcrypto,navigator:{userAgent:'test'},fetch:async(u,i)=>{posts.push(JSON.parse(i.body));return{ok:true};}};
vm.createContext(ctx);vm.runInContext(script,ctx);
vm.runInContext("callSid='SIM-BROWSER';browserSessionId='one';connectLive();",ctx);
const send=e=>WS.last.onmessage({data:JSON.stringify(e)});
send({type:'stt_done',turn:1,ts:1000});
send({type:'llm_first',turn:1,ts:1100,ms:100});
vm.runInContext('teleSend(false)',ctx); // former premature flush
send({type:'stt_done',turn:2,ts:2000});
send({type:'llm_done',turn:1,ts:2100,ms:1100,chars:5});
chk('late completion remains on original round',posts.at(-1).turn===1&&Number.isFinite(posts.at(-1).llmDoneRecvTs));
chk('late completion does not replace active round',vm.runInContext('cur.turn',ctx)===2);
chk('round 2 cannot borrow round 1 first-token stamp',posts.filter(p=>p.turn===2).every(p=>!p.srvLlmFirstTs));
vm.runInContext("tl=[];clkOff=null;tlPush('s',2000,'server','');tlPush('b',1000,'browser','');",ctx);
chk('missing sync never claims cross-clock delta',!el('tl').innerHTML.includes('Δ'));
vm.runInContext('clkOff=1000;renderTl()',ctx);
chk('server-minus-browser offset subtracted',el('tl').innerHTML.includes('Δ+0ms'));
vm.runInContext('clkOff=-1000;tl=[];tlPush(\'s\',1000,\'server\',\'\');tlPush(\'b\',2000,\'browser\',\'\');',ctx);
chk('negative clock offset direction correct',el('tl').innerHTML.includes('Δ+0ms'));
chk('no B-point fields without volume events',posts.every(p=>!('speechEndTs'in p)&&!('playStartTs'in p)));
// B points: volume-driven tick produces B1/B2/B3/B4 stamps and they reach the turn row.
posts.length=0;
vm.runInContext('inVol=0.3;tick(1000);',ctx);            // B1 at 1000
vm.runInContext('tick(1200);',ctx);                       // still speaking, lastAbove=1200
vm.runInContext('inVol=0;tick(1800);',ctx);               // quiet 600ms -> B2 stamped at 1200
chk('B1/B2 detected from volume',vm.runInContext('bSpeechStartTs',ctx)===1000&&vm.runInContext('bSpeechEndTs',ctx)===1200);
send({type:'stt_done',turn:3,ts:2000,utteranceId:'SIM-BROWSER:u3'});
chk('B1/B2 attached to turn row',posts.some(p=>p.turn===3&&p.speechStartTs===1000&&p.speechEndTs===1200));
vm.runInContext("bnd.relay_text_send_start={epoch:2500,mono:2500};",ctx); // corroboration: text-send boundary for the current round
vm.runInContext('outVol=0.4;tick(3000);',ctx);            // B3 at 3000
chk('B3 attached to turn row as explicit candidate',posts.some(p=>p.turn===3&&p.playStartTs===3000&&p.playAssocCandidate===true));
vm.runInContext('outVol=0;tick(3900);tick(4800);',ctx);   // quiet past window -> B4
chk('B4 attached to turn row',posts.some(p=>p.turn===3&&p.playEndTs===3900));
// chain states: after B3 the speaker node waits, after B4 it is done
chk('chain node states follow events',vm.runInContext('nst[7].st',ctx)==='done'&&vm.runInContext('nst[6].st',ctx)==='done');
console.log(pass+' passed');
const observerSource=fs.readFileSync(new URL('../pages/public/sdk-observer.js',import.meta.url),'utf8');
const scope={};vm.createContext(scope);vm.runInContext(observerSource,scope);
const events=[];let ticks=0,pcCount=0;
const observer=new scope.SdkObserver({sessionId:'session-test',emit:r=>events.push(r),wall:()=>1000+ticks,mono:()=>++ticks});
const track={kind:'audio'}, stream={getAudioTracks:()=>[track]}, sender={id:'same-sender'};
let receivedConfig,receivedArgs;
class NativePC {constructor(config){pcCount++;receivedConfig=config;} addTrack(...args){receivedArgs=args;return sender;}}
const constraints={audio:true};let receivedConstraints;
const options=observer.options(c=>{receivedConstraints=c;return Promise.resolve(stream);},NativePC);
const returned=await options.getUserMedia(constraints);
chk('gUM returns exact original stream',returned===stream&&receivedConstraints===constraints);
const config={iceServers:[]};const pc=new options.RTCPeerConnection(config);
const result=pc.addTrack(track,stream);
chk('one native PC, exact configuration',pcCount===1&&receivedConfig===config&&pc instanceof NativePC);
chk('addTrack forwards exact track stream and sender',result===sender&&receivedArgs[0]===track&&receivedArgs[1]===stream);
chk('pre-SID events buffered',events.length===0);
observer.bind('SIM-SDK');
chk('pre-SID events bound to correct session and call',events.length===4&&events.every(e=>e.callSid==='SIM-SDK'&&e.browserSessionId==='session-test'));
observer.sample({timestamp:1000,packetsSent:10,bytesSent:300,totals:{packetsSent:10,bytesSent:300}});
chk('first outbound sample has no invented window',events.at(-1).sampleWindowMs===undefined);
observer.sample({timestamp:2500,packetsSent:20,bytesSent:600,totals:{packetsSent:30,bytesSent:900}});
chk('sample records actual 1500ms interval, not fixed second',events.at(-1).sampleWindowMs===1500&&events.at(-1).packetsSent===20);
observer.sample({timestamp:2400,packetsSent:0,bytesSent:0});
chk('nonmonotonic stats timestamp does not invent window',events.at(-1).sampleWindowMs===undefined);
const error=new Error('test-only');const rejecting=observer.options(()=>Promise.reject(error),NativePC);
let caught;try{await rejecting.getUserMedia(constraints);}catch(e){caught=e;}
chk('gUM failure preserves exact rejection',caught===error);
for(const event of events) {
 const response=await post({sdkEvent:event,sim:true,pageBuild:'sdk-test'});
 chk('SDK event traverses both whitelists '+event.event,response.status===200);
}
let read=await (await db.fetch(new Request('https://m/sessions'))).json();
chk('SDK event persisted with sequence and dual timestamps',read.sdkEvents.length===events.length&&read.sdkEvents.every(e=>e.clockDomain==='browser'&&e.browserTs!=null&&e.browserMonoMs!=null));
const before=read.sdkEvents.length;
await post({sdkEvent:events[0],sim:true,pageBuild:'sdk-test'});
read=await (await db.fetch(new Request('https://m/sessions'))).json();
chk('retry is idempotent by session/call/eventSeq',read.sdkEvents.length===before);
chk('SDK stats preserve counter data and measured window',read.sdkEvents.find(e=>e.sampleWindowMs===1500)?.totalPacketsSent===30);
chk('SDK stats remain explicitly simulated',read.sdkEvents.every(e=>e.sim===true));

// ---- 10/31 v2: obs page three-way classification + six-metric full chain ----
import { OBS_PAGE } from '../pages/functions/_lib.js';
import { onRequestGet as obsDataGet } from '../pages/functions/obs/data.js';
const obsScript = OBS_PAGE.match(/<script>\n([\s\S]*)<\/script>\s*<\/body>/)[1];
const mkObsCtx = (payload) => {
  const els2 = new Map();
  const el2 = id => { if (!els2.has(id)) els2.set(id, { id, textContent:'', innerHTML:'', style:{}, dataset:{}, classList:{toggle(){}}, setAttribute(){}, addEventListener(){}, onclick:null }); return els2.get(id); };
  const c = { console, Date, Intl, JSON, Math, Number, String, Set, Map, Array, Object, RegExp, Error, Promise, isFinite, parseInt, parseFloat,
    setInterval: () => 1, setTimeout: () => 1, clearInterval(){},
    document: { getElementById: el2, querySelectorAll: () => [] },
    fetch: async (u) => ({ ok: true, json: async () => structuredClone(payload) }) };
  vm.createContext(c); vm.runInContext(obsScript, c);
  return { c, el2 };
};
const SID = 'CA' + 'a1'.repeat(16);
const fullTurn = { event:'turn', turn:1, promptChars:10, replyChars:20, llmFirstTokenMs:250, replyTotalMs:1600,
  requestToFirstTokenMs:230, forwardFirstChunkMs:20, aiTotalGenMs:1500, tPromptRecv:1700 };
const w4Ev = { event:'boundary', turn:1, boundary:'relay_text_send_start', chunkSeq:1, epochTime:1720, monotonicTime:900, sequence:4 };
const fullTele = { callSid:SID, turn:1, pageBuild:'2026-10-31.bw-baseline-v2', clkOffsetMs:-100,
  speechStartTs:200, speechEndTs:1500, sttRecvTs:1750, llmFirstRecvTs:1980, llmDoneRecvTs:3300, playStartTs:2100, playEndTs:5000 };
const realSess = { id:'s1', start:'2026-10-31T10:00:00.000Z', callSid:SID, events:[{event:'setup',callSid:SID,ts:'2026-10-31T10:00:00.000Z'}, fullTurn, w4Ev] };

// 1) reconciled real session: six metrics all populated, lands in real section
{
  const payload = { sessions:[realSess], evals:[], telemetry:[fullTele], teleStats:{}, build:'b', sdkEvents:[], gate:null, twilioCalls:[{sid:SID,start:'2026-10-31T10:00:00Z',status:'completed',duration:'60',price:null}], twilioNote:null };
  const { c, el2 } = mkObsCtx(payload);
  await vm.runInContext('load()', c);
  const realHtml = el2('sessions').innerHTML;
  chk('reconciled call lands in real section', realHtml.includes(SID.slice(-6)));
  chk('unverified section empty when reconciled', el2('pendsessions').innerHTML.includes('None'));
  chk('synthetic section empty when reconciled', el2('simsessions').innerHTML.includes('None'));
  const six = ['AI TTFT W3-W2','forwarding overhead W4-W3','AI total generation W5-W2','STT+uplink W1-B2','TTS+downlink B3-W4','perceived latency B3-B2'];
  for (const label of six) chk('six-metric populated '+label, realHtml.includes(label) && !new RegExp(label + ' not measured').test(realHtml));
  chk('real session metrics keep measured/approx tags', !realHtml.includes('>simulated</span>'));
}
// 2) same session, Twilio list unavailable: unverified, never simulated
{
  const payload = { sessions:[realSess], evals:[], telemetry:[fullTele], teleStats:{}, build:'b', sdkEvents:[], gate:null, twilioCalls:[], twilioNote:'Twilio billing data is temporarily unavailable:HTTP 401' };
  const { c, el2 } = mkObsCtx(payload);
  await vm.runInContext('load()', c);
  chk('unmatched Twilio-format sid is unverified, not sim', el2('pendsessions').innerHTML.includes(SID.slice(-6)) && el2('pendsessions').innerHTML.includes('unverified'));
  chk('unverified session not counted as real', el2('sessions').innerHTML.includes('No real call records yet'));
  chk('unverified session not dumped into sim', el2('simsessions').innerHTML.includes('None'));
  chk('unverified metrics keep measured/approx tags, not simulated', !el2('pendsessions').innerHTML.includes('>simulated</span>'));
  chk('unverified note surfaces fetch failure', el2('calls').innerHTML.includes('HTTP 401'));
}
// 3) explicit synthetic session: sim bucket, metric tags simulated
{
  const simSess = { id:'s2', start:'2026-10-31T11:00:00.000Z', callSid:'SIM-VAL-X', events:[{event:'setup',callSid:'SIM-VAL-X',ts:'2026-10-31T11:00:00.000Z'}, fullTurn, w4Ev] };
  const simTele = { ...fullTele, callSid:'SIM-VAL-X', sim:true };
  const payload = { sessions:[simSess], evals:[], telemetry:[simTele], teleStats:{}, build:'b', sdkEvents:[], gate:null, twilioCalls:[{sid:SID,start:'x',status:'completed',duration:'5',price:null}], twilioNote:null };
  const { c, el2 } = mkObsCtx(payload);
  await vm.runInContext('load()', c);
  chk('synthetic session in sim section', el2('simsessions').innerHTML.includes('VAL-X'));
  chk('sim session metric tags say simulated', el2('simsessions').innerHTML.includes('>simulated</span>'));
  chk('sim session not in real/unverified', el2('sessions').innerHTML.includes('No real call records yet') && el2('pendsessions').innerHTML.includes('None'));
}
// 4) obs/data endpoint: reconciliation window covers oldest session, HTTP error surfaced
{
  let fetchedUrl = null;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { fetchedUrl = String(u); return { ok:false, status:401, json: async()=>({}) }; };
  const env2 = { PAGE_PASSCODE:'test-only', TWILIO_ACCOUNT_SID:'ACx', TWILIO_AUTH_TOKEN:'y',
    METRICS:{idFromName:n=>n,get:()=>({fetch:async()=>({json:async()=>({sessions:[{start:'2026-10-22T19:21:57.285Z',events:[]}],evals:[]})})})},
    CALLGATE:{idFromName:n=>n,get:()=>({fetch:async()=>({json:async()=>null})})} };
  const res = await obsDataGet({ env:env2, request:new Request('https://test/obs/data',{headers:{cookie}}) });
  const body = await res.json();
  globalThis.fetch = oldFetch;
  chk('reconciliation window covers oldest session, not today-only', /StartTime%3E=2026-10-22/.test(fetchedUrl));
  chk('HTTP failure surfaces as note, not silent empty', typeof body.twilioNote === 'string' && body.twilioNote.includes('401'));
}
// 5) demo mode: timeline deltas and footer say synthetic, never measured
{
  const src2 = fs.readFileSync(new URL('../pages/functions/index.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/,'').replace('const CALL_PAGE =','globalThis.CALL_PAGE =');
  const t2 = { PAGE_BUILD:'test' }; vm.createContext(t2); vm.runInContext(src2.slice(0, src2.indexOf('export async function')), t2);
  const script2 = t2.CALL_PAGE.match(/<script>\n([\s\S]*)<\/script>/)[1];
  const els3 = new Map();
  const el3 = id => { if(!els3.has(id)) els3.set(id,{textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},classList:{toggle(){}},querySelector:()=>({style:{}})}); return els3.get(id); };
  const ctx3 = { console, URLSearchParams, location:{search:'?demo=1',protocol:'https:',host:'test'},
    document:{getElementById:el3,querySelectorAll:()=>[1,2,3,4,5,6,7].map(n=>({...el3('node'+n),dataset:{s:String(n)}}))},
    WebSocket:WS, setInterval:()=>1, clearInterval(){}, setTimeout:()=>1, Date, crypto:webcrypto, navigator:{userAgent:'test'}, fetch:async()=>({ok:true}) };
  el3('tlf').innerHTML = t2.CALL_PAGE.match(/<div class="tlf" id="tlf">([\s\S]*?)<\/div>/)[1]; // seed static footer (mock DOM does not parse HTML)
  vm.createContext(ctx3); vm.runInContext(script2, ctx3);
  vm.runInContext("clkOff=0;tl=[];tlPush('s',2000,'x','');tlPush('s',2300,'y','');renderTl();", ctx3);
  const tlHtml = el3('tl').innerHTML;
  chk('demo timeline delta tagged synthetic', tlHtml.includes('synthetic') && !tlHtml.includes('measured'));
  chk('demo timeline header says synthetic', el3('tlh').textContent.includes('synthetic'));
  chk('demo footer declares synthetic values', el3('tlf').innerHTML.includes('scripted synthetic') && el3('tlf').innerHTML.includes('not actually observed'));
  chk('demo badge visible', el3('demotag').style.display === '');
  vm.runInContext("rtc={rtt:96,jitter:12,lost:0};renderNet();", ctx3);
  chk('demo net line tagged synthetic, never measured', el3('net2').innerHTML.includes('synthetic') && !el3('net2').innerHTML.includes('measured'));
  chk('demo edge RTT chip relabeled synthetic', el3('ev1t').textContent === 'synthetic');
  vm.runInContext("inCall=true;for(let i=1;i<=7;i++) nst[i]={st:'idle'};nst[7]={st:'wait',since:1000};playActive=true;outVol=0.3;renderChain();", ctx3);
  chk('speaker wait card says playing, not waiting', el3('dt').textContent.includes('playing') && !el3('dt').textContent.includes('waiting'));
  vm.runInContext("for(let i=1;i<=7;i++) nst[i]={st:'idle'};nst[3]={st:'wait',since:1000};renderChain();", ctx3);
  chk('mid-chain in-progress card says working (two-state)', el3('dt').textContent.includes('working') && !el3('dt').textContent.includes('waiting'));
}
// 6) interrupt fixes: orphan B4 settles to old turn, residual turns flagged, stall watchdog
{
  posts.length=0;
  vm.runInContext("inCall=true;callSid='SIM-BROWSER';tl=[];bnd={relay_text_send_start:{epoch:100,mono:100}};resetChain();cur={turn:9};turnRows.set(9,cur);playActive=false;orphanPlayTurn=null;playOwnerTurn=null;suspectSpeech=false;attrSpeechStartTs=null;stallMode=false;inVol=0;outVol=0;speaking=false;bSpeechStartTs=null;bSpeechEndTs=null;bPlayStartTs=null;bPlayEndTs=null;outBelowSince=null;",ctx);
  // replay of real call 3628502a turn-1 failure path: local mic volume DURING playback, no STT, normal completion
  vm.runInContext("outVol=0.2;tick(1000);",ctx);                       // B3 at 1000, node7 waits
  chk('B3 arms playback',vm.runInContext('playActive',ctx)===true);
  vm.runInContext("inVol=0.2;tick(1100);",ctx);                        // mic volume at 1100 while playing
  chk('playback-time mic volume never arms orphan',vm.runInContext('orphanPlayTurn',ctx)===null);
  chk('playback-time mic volume flags suspected speech',vm.runInContext('suspectSpeech',ctx)===true);
  chk('chain stays intact on suspected speech',vm.runInContext('nst[7].st',ctx)==='wait');
  vm.runInContext("relayAgentOn=true;renderChain();",ctx);              // Relay agentSpeaking anchors the speaker light
  chk('status card keeps playing during suspected speech',el('dt').textContent.includes('playing'));
  chk('local mic volume lights node1 (local is primary); Relay clientSpeaking only corroborates: unconfirmed',vm.runInContext('lit(1)',ctx)===true && el('cnotes').innerHTML.includes('Relay not confirmed'));
  chk('suspected speech logged as unconfirmed',el('ev').innerHTML.includes('suspected speech (unconfirmed)'));
  vm.runInContext("inVol=0;tick(1800);",ctx);                          // quiet 700ms -> suspected B2
  chk('dead-end suspicion opens no STT wait',vm.runInContext('nst[2].st',ctx)!=='wait');
  chk('suspicion consumed at its own B2',vm.runInContext('suspectSpeech',ctx)===false);
  chk('node7 still playing after dead-end suspicion',vm.runInContext('nst[7].st',ctx)==='wait');
  vm.runInContext("outVol=0;tick(1900);tick(2901);",ctx);              // playback actually ends -> B4
  chk('completed playback settles normally after dead-end suspicion',posts.some(p=>p.turn===9&&Number.isFinite(p.playEndTs)&&p.orphanPlayEnd!==true));
  chk('volume playback tied to a round only as explicit candidate',posts.some(p=>p.turn===9&&p.playAssocCandidate===true));
  chk('no false orphan flag anywhere',posts.every(p=>p.orphanPlayEnd!==true));
  chk('node7 lights done on real completion',vm.runInContext('nst[7].st',ctx)==='done');
  chk('B4 back on the timeline',el('tl').innerHTML.includes('B4'));
  chk('no false interruption claim in log',!el('ev').innerHTML.includes('interrupted by new speech / overlapped, assigned to the original turn'));
}
{
  // server-confirmed barge-in: interrupt event switches rounds; without takeover B4 settles normally
  posts.length=0;
  vm.runInContext("inCall=true;callSid='SIM-BROWSER';tl=[];bnd={relay_text_send_start:{epoch:100,mono:100}};resetChain();cur={turn:9};turnRows.set(9,cur);playActive=false;orphanPlayTurn=null;playOwnerTurn=null;suspectSpeech=false;attrSpeechStartTs=null;stallMode=false;inVol=0;outVol=0;speaking=false;bSpeechStartTs=null;bSpeechEndTs=null;bPlayStartTs=null;bPlayEndTs=null;outBelowSince=null;",ctx);
  el('ev').innerHTML='';
  vm.runInContext("outVol=0.2;tick(1000);",ctx);                       // B3 playback of turn 9
  send({type:'interrupt',turn:9,ts:1500,ms:500});                      // server confirms barge-in
  chk('server interrupt arms orphan for playing round',vm.runInContext('orphanPlayTurn',ctx)===9);
  chk('server interrupt resets the chain',vm.runInContext('nst[7].st',ctx)==='idle');
  chk('interrupt marked on round row',posts.some(p=>p.turn===9&&p.interrupted===true));
  vm.runInContext("outVol=0;tick(1600);tick(2501);",ctx);              // playback cut short -> B4, still same round
  chk('interrupted playback without takeover settles normally',posts.some(p=>p.turn===9&&Number.isFinite(p.playEndTs)&&p.orphanPlayEnd!==true));
  chk('orphan disarmed after settle',vm.runInContext('orphanPlayTurn',ctx)===null);
}
{
  // new-utterance transcript takeover mid-playback orphans the playing round
  posts.length=0;
  vm.runInContext("inCall=true;callSid='SIM-BROWSER';tl=[];bnd={relay_text_send_start:{epoch:100,mono:100}};resetChain();cur={turn:9};turnRows.set(9,cur);playActive=false;orphanPlayTurn=null;playOwnerTurn=null;suspectSpeech=false;attrSpeechStartTs=null;stallMode=false;inVol=0;outVol=0;speaking=false;bSpeechStartTs=null;bSpeechEndTs=null;bPlayStartTs=null;bPlayEndTs=null;outBelowSince=null;",ctx);
  vm.runInContext("outVol=0.2;tick(1000);",ctx);                       // B3 playback of turn 9
  vm.runInContext("inVol=0.2;tick(1200);",ctx);                        // fresh speech mid-playback (suspected)
  send({type:'stt_done',turn:10,ts:2000});                             // server confirms NEW utterance as turn 10
  chk('fresh transcript takeover arms orphan',vm.runInContext('orphanPlayTurn',ctx)===9);
  chk('takeover switches the active round',vm.runInContext('cur.turn',ctx)===10);
  chk('takeover confirms and clears suspicion',vm.runInContext('suspectSpeech',ctx)===false);
  vm.runInContext("inVol=0;outVol=0;tick(2100);tick(3001);",ctx);      // old playback bleeds out -> B4
  chk('orphaned playback settles to its original round',posts.some(p=>p.turn===9&&p.orphanPlayEnd===true&&Number.isFinite(p.playEndTs)));
  chk('taking-over round does not steal playback end',posts.filter(p=>p.turn===10).every(p=>!('playEndTs' in p)));
}
{
  posts.length=0;
  vm.runInContext("tl=[];bnd={};resetChain();attrSpeechStartTs=null;bSpeechStartTs=5000;bSpeechEndTs=6000;",ctx);
  el('ev').innerHTML='';
  send({type:'stt_done',turn:21,ts:7000});
  send({type:'stt_done',turn:22,ts:9000}); // same VAD episode split into two finals by the provider (real call 7d8773e0 t7/t8) -> shared continuation, not residual
  const p21=posts.filter(p=>p.turn===21), p22=posts.filter(p=>p.turn===22);
  chk('fresh utterance attributed to its turn',p21.some(p=>p.speechStartTs===5000&&p.speechEndTs===6000));
  chk('continuation final shares the episode times',p22.some(p=>p.speechStartTs===5000&&p.speechEndTs===6000&&p.speechSharedWithPrev===true));
  chk('continuation never flagged residual or unassociated',p22.every(p=>p.residual!==true&&p.speechUnassociated!==true));
  chk('continuation logged as candidate, not fact',el('ev').innerHTML.includes('continued transcript')&&el('ev').innerHTML.includes('attribution is a candidate')&&el('ev').innerHTML.includes('protocol has no same-segment confirmation')&&!el('ev').innerHTML.includes('interrupt remnant trigger'));
  vm.runInContext("bSpeechStartTs=9500;bSpeechEndTs=9800;",ctx);
  send({type:'stt_done',turn:23,ts:10500});
  chk('next fresh utterance attributed again',posts.some(p=>p.turn===23&&p.speechStartTs===9500&&!p.speechSharedWithPrev));
}
{
  // no browser volume evidence at all: honestly unassociated, never fabricated (user constraint 2026-10-31)
  posts.length=0;
  vm.runInContext("tl=[];bnd={};resetChain();attrSpeechStartTs=null;bSpeechStartTs=null;bSpeechEndTs=null;",ctx);
  el('ev').innerHTML='';
  send({type:'stt_done',turn:24,ts:7000});
  const p24=posts.filter(p=>p.turn===24);
  chk('no-evidence turn flagged speechUnassociated',p24.some(p=>p.speechUnassociated===true));
  chk('no-evidence turn gets no fabricated speech times',p24.every(p=>!('speechStartTs' in p)&&!('speechEndTs' in p)));
  chk('unassociation logged without content inference',el('ev').innerHTML.includes('not linked')&&el('ev').innerHTML.includes('not inferred'));
}
{
  // real call 7d8773e0 t9: brief downlink blip after an UNCONFIRMED round switch, then the real episode; B4 must follow the episode owner and a later episode must clear the stale end
  posts.length=0;
  vm.runInContext("inCall=true;callSid='SIM-BROWSER';tl=[];bnd={relay_text_send_start:{epoch:100,mono:100}};resetChain();cur={turn:9};turnRows.set(9,cur);playActive=false;orphanPlayTurn=null;playOwnerTurn=null;suspectSpeech=false;attrSpeechStartTs=null;stallMode=false;inVol=0;outVol=0;speaking=false;bSpeechStartTs=null;bSpeechEndTs=null;bPlayStartTs=null;bPlayEndTs=null;outBelowSince=null;",ctx);
  el('ev').innerHTML='';
  vm.runInContext("outVol=0.2;tick(1000);outVol=0;tick(1500);tick(2501);",ctx); // turn 9 completes pair (1000 -> 1500)
  chk('turn 9 complete pair settled',posts.some(p=>p.turn===9&&p.playStartTs===1000)&&posts.some(p=>p.turn===9&&p.playEndTs===1500));
  send({type:'stt_done',turn:10,ts:3000});                                    // server establishes turn 10, no speech evidence; bnd resets
  chk('round switch without volume evidence is unassociated, not residual',posts.some(p=>p.turn===10&&p.speechUnassociated===true));
  vm.runInContext("outVol=0.2;tick(4000);",ctx);                              // blip B3 while cur=10 but NO text-send boundary for turn 10
  chk('uncorroborated playback binds no owner',vm.runInContext('playOwnerTurn',ctx)===null);
  vm.runInContext("outVol=0;tick(4100);tick(5001);",ctx);                     // blip B4
  chk('uncorroborated episode writes no turn-level play fields',posts.filter(p=>p.turn===10).every(p=>!('playStartTs' in p)&&!('playEndTs' in p)));
  chk('uncorroborated episode logged call-level unassociated',el('ev').innerHTML.includes('not linked to a turn'));
  chk('turn 9 candidate pair untouched by the blip',posts.filter(p=>p.turn===9&&'playEndTs' in p).every(p=>p.playEndTs===1500));
  vm.runInContext("bnd.relay_text_send_start={epoch:5500,mono:5500};outVol=0.2;tick(6000);outVol=0;tick(6100);tick(7001);",ctx); // corroborated candidate episode on turn 10
  chk('corroborated episode settles as explicit candidate',posts.some(p=>p.turn===10&&p.playStartTs===6000&&p.playAssocCandidate===true)&&posts.some(p=>p.turn===10&&p.playEndTs===6100));
  vm.runInContext("bnd.relay_text_send_start={epoch:8500,mono:8500};outVol=0.2;tick(9000);",ctx); // second candidate episode; feed dies before its end (like t9 +125.7s)
  const merged10=posts.filter(p=>p.turn===10).reduce((a,p)=>Object.assign(a,p),{});
  chk('new episode supersedes: latest start wins',merged10.playStartTs===9000);
  chk('page row stale end cleared locally',vm.runInContext('turnRows.get(10).playEndTs',ctx)==null);
  chk('field clear rides the wire explicitly',posts.some(p=>p.turn===10&&p.playEndClear===true));
  chk('episode count keeps prior segment visible',merged10.playEpisodes===2);
  chk('no inverted pair can stand on any post',posts.every(p=>!(p.playStartTs!=null&&p.playEndTs!=null&&p.playEndTs<p.playStartTs)));
}
{
  // unbound playback episode: no current round at B3 -> owner stays null -> B4 writes nothing, honestly unassociated
  posts.length=0;
  vm.runInContext("inCall=true;callSid='SIM-BROWSER';tl=[];bnd={};resetChain();cur=null;playActive=false;orphanPlayTurn=null;playOwnerTurn=null;suspectSpeech=false;stallMode=false;inVol=0;outVol=0;bSpeechStartTs=null;bSpeechEndTs=null;outBelowSince=null;",ctx);
  el('ev').innerHTML='';
  vm.runInContext("outVol=0.2;tick(1000);",ctx);
  chk('B3 with no current round binds no owner',vm.runInContext('playOwnerTurn',ctx)===null);
  vm.runInContext("outVol=0;tick(1500);tick(2501);",ctx);
  chk('unbound episode end written nowhere',posts.every(p=>!('playEndTs' in p)));
  chk('unbound end logged as unassociated',el('ev').innerHTML.includes('no linked turn')&&el('ev').innerHTML.includes('not written into any turn'));
}
{
  // node6 (TTS+downlink) without a server W4 stamp: ms must stay null and the card must not invent a number
  vm.runInContext("inCall=true;callSid='SIM-BROWSER';tl=[];bnd={};resetChain();cur={turn:50};turnRows.set(50,cur);playActive=false;playOwnerTurn=null;outVol=0;outBelowSince=null;",ctx);
  vm.runInContext("outVol=0.2;tick(1000);",ctx);
  const st6=vm.runInContext("document.getElementById('st6').innerHTML+document.getElementById('cnotes').innerHTML",ctx);
  chk('node6 ms is null without W4',vm.runInContext("nst[6].ms",ctx)===null);
  chk('node6 without W4 renders unassociated, not a pass',st6.includes('not linked')&&!st6.includes('passed')&&!/\d/.test(st6.replace('downlink energy detected; no text send record for this turn, turn link not measured','')));
}
{
  posts.length=0;
  vm.runInContext("relayClientOn=false;relayAgentOn=false;inCall=true;stallMode=false;resetChain();cur={turn:31};turnRows.set(31,cur);nst[2]={st:'wait',since:1};lastRelayEventTs=Date.now()-31000;stallCheck(Date.now());renderChain();",ctx);
  chk('server-wait stall flagged',vm.runInContext('stallMode',ctx)===true);
  chk('stall recorded with last-event stamp',posts.some(p=>p.turn===31&&p.stalled===true&&Number.isFinite(p.stallLastEventTs)));
  chk('stall status card honest',el('dt').textContent.includes('events stalled'));
  chk('stall node tagged',(el('st2').innerHTML+el('cnotes').innerHTML).includes('stalled'));
  vm.runInContext("lastRelayEventTs=Date.now();stallCheck(Date.now());renderChain();",ctx);
  chk('stall clears on event recovery',vm.runInContext('stallMode',ctx)===false);
  // Relay-reported speaking: server silence is expected, never a stall (real call 66c1c1: client speaking 8-27s with no events)
  vm.runInContext("relayClientOn=true;resetChain();nst[2]={st:'wait',since:1};lastRelayEventTs=Date.now()-31000;stallCheck(Date.now());",ctx);
  chk('Relay clientSpeaking: 31s silence is not a stall',vm.runInContext('stallMode',ctx)===false);
  vm.runInContext("relayClientOn=false;relayAgentOn=true;stallCheck(Date.now());",ctx);
  chk('Relay agentSpeaking: silence is not a stall',vm.runInContext('stallMode',ctx)===false);
  vm.runInContext("relayAgentOn=false;stallCheck(Date.now());",ctx);
  chk('no Relay speaking + 31s silence while waiting server: stall flagged',vm.runInContext('stallMode',ctx)===true);
  vm.runInContext("lastRelayEventTs=Date.now();stallCheck(Date.now());",ctx);
  // two-state lights anchored on Relay speaker-events
  vm.runInContext("relayClientOn=false;relayAgentOn=false;inCall=true;resetChain();",ctx);
  send({type:'speaker',who:'client',on:true});
  chk('Relay clientSpeaking alone does not light mic node: gray with Relay reports speech/no local volume',vm.runInContext('lit(1)',ctx)===false && (el('st1').innerHTML+el('cnotes').innerHTML).includes('Relay reports speech') && (el('st1').innerHTML+el('cnotes').innerHTML).includes('no local volume'));
  chk('node classes are only st-on / st-off (two states)',vm.runInContext("Object.values(nodes).length===7&&Object.values(nodes).every(n=>/^node st-(on|off)$/.test(n.className))",ctx)&&vm.runInContext("nodes[1].className",ctx)==='node st-off'&&vm.runInContext("nodes[7].className",ctx)==='node st-off');
  send({type:'speaker',who:'client',on:false});
  chk('Relay clientSpeaking=false leaves mic node gray',vm.runInContext('lit(1)',ctx)===false);
  send({type:'speaker',who:'agent',on:true});
  chk('Relay agentSpeaking alone does not light speaker (local playback is primary): gray, Relay speaking · not detected locally · needs calibration',vm.runInContext('lit(7)',ctx)===false && vm.runInContext('relayAgentOn',ctx)===true && (el('st7').innerHTML+el('cnotes').innerHTML).includes('not detected locally') && (el('st7').innerHTML+el('cnotes').innerHTML).includes('needs calibration'));
  send({type:'speaker',who:'agent',on:null});
  chk('unparsed speaker event leaves state unchanged',vm.runInContext('relayAgentOn',ctx)===true);
  send({type:'speaker',who:'client',on:true}); send({type:'speaker',who:'agent',on:false});
  chk('interrupt pair: Relay client on + agent off at once, no local audio: both gray',vm.runInContext('!lit(1)&&!lit(7)&&relayClientOn&&!relayAgentOn',ctx));
  vm.runInContext("outVol=0.3;playActive=false;tick(5000);",ctx);
  vm.runInContext("nst[7]={st:'wait',since:1};renderChain();",ctx);
  chk('local playback lights speaker even when Relay agent off, text says Relay not confirmed',vm.runInContext('lit(7)',ctx)===true && (el('st7').innerHTML+el('cnotes').innerHTML).includes('local playback approx') && (el('st7').innerHTML+el('cnotes').innerHTML).includes('Relay not confirmed'));
  // waiting is not working: only event-anchored stages light up
  vm.runInContext("relayClientOn=false;relayAgentOn=false;stallMode=false;inCall=true;resetChain();nst[2]={st:'wait',since:Date.now()-3000};nst[6]={st:'wait',since:Date.now()-2000};renderChain();",ctx);
  chk('node2 (STT) merged wait is green as INFERRED, not STT latency',vm.runInContext('lit(2)',ctx)===true && (el('st2').innerHTML+el('cnotes').innerHTML).includes('inferred') && (el('st2').innerHTML+el('cnotes').innerHTML).includes('merged wait') && !(el('st2').innerHTML+el('cnotes').innerHTML).includes('latency'));
  chk('node6 (TTS) text-sent wait is green as INFERRED merged until Relay opens',vm.runInContext('lit(6)',ctx)===true && (el('st6').innerHTML+el('cnotes').innerHTML).includes('inferred · merged') && (el('st6').innerHTML+el('cnotes').innerHTML).includes('text sent → speaking starts'));
  vm.runInContext('relayAgentOn=true;renderChain();',ctx);
  chk('Relay agent opening ends the inferred TTS wait (core)',vm.runInContext('litCore(6)',ctx)===false);
  chk('short TTS stage is held visibly and labelled display held, not a duration',vm.runInContext('lit(6)',ctx)===true&&(el('st6').innerHTML+el('cnotes').innerHTML).includes('display held')&&(el('st6').innerHTML+el('cnotes').innerHTML).includes('passed'));
  vm.runInContext('holdUntil={};',ctx);
  vm.runInContext('relayAgentOn=false;renderChain();',ctx);
  vm.runInContext("resetChain();nst[1]={st:'wait',since:1};suspectSpeech=false;renderChain();",ctx);
  chk('STT lit as inferred streaming while the user is speaking',vm.runInContext('lit(1)&&lit(2)',ctx)&&(el('st2').innerHTML+el('cnotes').innerHTML).includes('inferred · streaming'));
  vm.runInContext("resetChain();bSpeechEndTs=31870;bPlayStartTs=null;renderChain();",ctx);
  chk('e2e shows no future value before downlink audio is detected',el('e2e').innerHTML.includes('pending')&&!/\d\.\d\ds/.test(el('e2e').innerHTML));
  vm.runInContext("bPlayStartTs=34690;renderChain();",ctx);
  chk('e2e = B3-B2 only once both exist, labelled local/approx and not STT/TTS latency',el('e2e').innerHTML.includes('2.82s')&&el('e2e').innerHTML.includes('approx')&&el('e2e').innerHTML.includes('not STT/TTS internal time'));
  vm.runInContext("bSpeechEndTs=null;bPlayStartTs=null;",ctx);
  vm.runInContext("resetChain();nst[4]={st:'wait',since:Date.now()-500};renderChain();",ctx);
  chk('LLM (3-5 real request start, end outstanding) is green',vm.runInContext('lit(4)',ctx)===true && (el('st4').innerHTML+el('cnotes').innerHTML).includes('working'));
  vm.runInContext("lastRelayEventTs=Date.now()-31000;stallCheck(Date.now());renderChain();",ctx);
  chk('stalled LLM wait turns gray with events stalled + status unconfirmed',vm.runInContext('stallMode&&!lit(4)',ctx) && (el('st4').innerHTML+el('cnotes').innerHTML).includes('events stalled') && (el('st4').innerHTML+el('cnotes').innerHTML).includes('status unconfirmed'));
  vm.runInContext("stallMode=false;lastRelayEventTs=Date.now();nst[4]={st:'done',ms:279};renderChain();",ctx);
  chk('LLM first token (end event) turns it gray, measured ms kept',vm.runInContext('lit(4)',ctx)===false && (el('st4').innerHTML+el('cnotes').innerHTML).includes('279ms'));
  // hangup: nothing stays green
  vm.runInContext("resetChain();relayClientOn=true;relayAgentOn=true;nst[3]={st:'wait',since:1};inCall=false;renderChain();",ctx);
  chk('after call ends no node is lit',vm.runInContext('[1,2,3,4,5,6,7].every(i=>!lit(i))',ctx));
  // interrupt with no browser playback episode: unfinished waits of the interrupted round are cleared, nothing invented
  vm.runInContext("inCall=true;relayClientOn=false;relayAgentOn=false;playActive=false;resetChain();nst[5]={st:'wait',since:1};nst[6]={st:'wait',since:1};cur={turn:77};turnRows.set(77,cur);renderChain();",ctx);
  send({type:'interrupt',turn:77,ts:Date.now(),ms:1200});
  chk('interrupt clears unfinished waits (no stuck green)',vm.runInContext("[2,3,4,5,6].every(i=>nst[i].st!=='wait')&&[1,2,3,4,5,6,7].every(i=>!lit(i))",ctx));
  chk('interrupt clearing logged, no fabricated done',el('ev').innerHTML.includes('end event on the interrupted turn was cleared')&&vm.runInContext("[5,6].every(i=>nst[i].st==='idle')",ctx));
  vm.runInContext("relayClientOn=false;relayAgentOn=false;outVol=0;playActive=false;resetChain();",ctx);
  vm.runInContext("resetChain();nst[7]={st:'wait',since:1};lastRelayEventTs=Date.now()-20000;stallCheck(Date.now());",ctx);
  chk('playback wait is not a server stall',vm.runInContext('stallMode',ctx)===false);
  vm.runInContext("resetChain();nst[1]={st:'wait',since:1};lastRelayEventTs=Date.now()-20000;stallCheck(Date.now());",ctx);
  chk('speaking is not a server stall',vm.runInContext('stallMode',ctx)===false);
}
{
  await post({callSid:'SIM-RELIABILITY',turn:41,v:2,sim:true,residual:true,orphanPlayEnd:true,stalled:true,stallLastEventTs:123456,browserSessionId:'session-one',speechSharedWithPrev:true,speechUnassociated:true,playEpisodes:3,playAssocCandidate:true});
  const st=(await (await db.fetch(new Request('https://m/sessions'))).json()).telemetry;
  const r41=st.find(r=>r.turn===41);
  chk('interrupt-fix fields traverse whitelist',r41&&r41.residual===true&&r41.orphanPlayEnd===true&&r41.stalled===true&&r41.stallLastEventTs===123456);
  chk('turn-association fields traverse whitelist',r41.speechSharedWithPrev===true&&r41.speechUnassociated===true&&r41.playEpisodes===3&&r41.playAssocCandidate===true);
  await post({callSid:'SIM-RELIABILITY',turn:42,v:2,sim:true,playStartTs:1000,playEndTs:2000,browserSessionId:'session-one'});
  await post({callSid:'SIM-RELIABILITY',turn:42,v:2,sim:true,playStartTs:5000,playEndClear:true,playEpisodes:2,browserSessionId:'session-one'});
  const st2=(await (await db.fetch(new Request('https://m/sessions'))).json()).telemetry;
  const r42=st2.find(r=>r.turn===42);
  chk('playEndClear deletes the superseded end server-side',r42&&r42.playStartTs===5000&&r42.playEndTs==null&&r42.playEpisodes===2);
}
console.log('TOTAL '+pass+' passed');
