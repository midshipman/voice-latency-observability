import fs from 'node:fs'; import vm from 'node:vm';
let pass=0, fail=0; const chk=(n,c)=>{ if(c){pass++;console.log('PASS '+n);} else {fail++;console.log('FAIL '+n);} };
const ctx={performance,console}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../pages/public/sdk-observer.js',import.meta.url),'utf8'),ctx);
const mk=rows=>{ const o=new ctx.SdkObserver({emit(){},sessionId:'t'}); o.pc={connectionState:'connected',getStats:async()=>({forEach:f=>rows.forEach(f)})}; return o; };
let s=await mk([
 {type:'candidate-pair',selected:true,currentRoundTripTime:0.111},
 {type:'remote-inbound-rtp',kind:'audio',jitter:0.004,fractionLost:0.01,roundTripTime:0.12,packetsLost:2},
 {type:'inbound-rtp',kind:'audio',jitter:0.006,packetsLost:1,packetsReceived:500,jitterBufferDelay:2,jitterBufferEmittedCount:100,concealedSamples:10,totalSamplesReceived:1000},
 {type:'outbound-rtp',kind:'audio',packetsSent:480,bytesSent:40000}]).stats();
chk('pair rtt ms',Math.abs(s.pairRttMs-111)<1e-6);
chk('uplink from remote-inbound',s.up.jitterMs===4&&s.up.lossFraction===0.01&&s.up.rttMs===120);
chk('downlink from inbound',s.down.jitterMs===6&&s.down.packetsReceived===500&&Math.abs(s.down.jitterBufferMs-20)<1e-6);
chk('sent',s.sent.packets===480);
s=await mk([]).stats(); chk('missing fields stay null',s.pairRttMs===null&&s.up===null&&s.down===null);
chk('no pc -> null',await new ctx.SdkObserver({emit(){},sessionId:'t'}).stats()===null);
const {onRequestGet}=await import('../pages/functions/ping.js');
const r=await onRequestGet({request:Object.assign(new Request('https://m/ping'),{cf:{colo:'FRA',clientTcpRtt:23,country:'DE',asn:1}}),env:{},data:{}}).catch(e=>e);
chk('ping route returns response or guarded',r instanceof Response);
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
