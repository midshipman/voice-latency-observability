import { validTwilioSignature, conversationRelayTwiML, rejectTwiML, callsEnabled } from './_lib.js';
export async function onRequestPost({ request, env }) {
  // Fail closed: without TWILIO_AUTH_TOKEN the Twilio signature cannot be checked, so refuse.
  if (!env.TWILIO_AUTH_TOKEN || !(await validTwilioSignature(request, env.TWILIO_AUTH_TOKEN))) {
    return new Response("forbidden", { status: 403 });
  }
  if (!callsEnabled(env)) {
    console.log(JSON.stringify({ event: "call_blocked", reason: "calls_disabled", ts: new Date().toISOString() }));
    return new Response(rejectTwiML("calls_disabled"), { headers: { "content-type": "text/xml; charset=utf-8" } });
  }
  const gateStub = env.CALLGATE.get(env.CALLGATE.idFromName("singleton-v4"));
  let acq = await gateStub.fetch("https://gate/acquire");
  let acqBody = null; // a Response body can be read once: keep it for the reject reason below
  if (acq.status === 409) {
    const b0 = acqBody = await acq.clone().json().catch(() => ({}));
    if (b0.reason === "stale_unverified" && b0.callSid && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      // Heartbeats stopping never proves the call ended: ask Twilio for the
      // actual call status before evicting the lease. Unknown = still active.
      let live = true;
      try {
        const cr = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls/${b0.callSid}.json`,
          { headers: { authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`) } });
        if (cr.ok) {
          const cj = await cr.json();
          live = !["completed", "failed", "busy", "no-answer", "canceled"].includes(cj.status);
        } else if (cr.status === 404) { live = false; }
      } catch (e) { console.error("twilio status check error", String(e)); }
      if (!live) {
        await gateStub.fetch("https://gate/force-release", { method: "POST", body: JSON.stringify({ callSid: b0.callSid }) });
        acq = await gateStub.fetch("https://gate/acquire"); acqBody = null;
      } else {
        console.log(JSON.stringify({ event: "call_rejected", reason: "busy_verified", callSid: b0.callSid, ts: new Date().toISOString() }));
        return new Response(rejectTwiML("busy"), { headers: { "content-type": "text/xml; charset=utf-8" } });
      }
    }
  }
  if (acq.status !== 200) {
    const body = (acqBody && acqBody.reason ? acqBody : await acq.json().catch(() => ({})));
    const reason = body.reason || "gate";
    console.log(JSON.stringify({ event: "call_rejected", reason, status: acq.status, holderCallSid: body.callSid || undefined, ts: new Date().toISOString() }));
    return new Response(rejectTwiML(reason), { headers: { "content-type": "text/xml; charset=utf-8" } });
  }
  const { lease } = await acq.json();
  const url = new URL(request.url);
  // experiment switch (default unchanged = partialPrompts true): a signed call parameter exp=nopartial turns partialPrompts off for that call only
  let expNoPartial = false;
  if (url.searchParams.get("exp") === "nopartial") expNoPartial = true;
  try { if (!expNoPartial && (await request.clone().formData()).get("exp") === "nopartial") expNoPartial = true; } catch {}
  console.log(JSON.stringify({ event: "experiment_probe", method: request.method, ct: request.headers.get("content-type"), q: [...url.searchParams.keys()], exp: expNoPartial }));
  if (expNoPartial) console.log(JSON.stringify({ event: "experiment", name: "partialPrompts", value: false, ts: new Date().toISOString() }));
  return new Response(conversationRelayTwiML(url.host, env.WS_TOKEN, lease, !expNoPartial),
    { headers: { "content-type": "text/xml; charset=utf-8" } });
}
