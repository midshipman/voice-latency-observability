import { validTwilioSignature } from './_lib.js';
// Twilio StatusCallback endpoint (set on the TwiML App). Signature-validated
// like /voice; the DO force-release additionally binds the stored callSid, so
// only the exact call Twilio reports can be released. No public unsigned
// force-release exists.
export async function onRequestPost({ request, env }) {
  if (!env.TWILIO_AUTH_TOKEN || !(await validTwilioSignature(request, env.TWILIO_AUTH_TOKEN))) {
    console.log(JSON.stringify({ event: "call_status_rejected", reason: "bad_signature", ts: new Date().toISOString() }));
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const sid = form && form.get("CallSid"), st = form && form.get("CallStatus");
  console.log(JSON.stringify({ event: "call_status", callSid: sid, status: st, ts: new Date().toISOString() }));
  if (sid && ["completed", "failed", "busy", "no-answer", "canceled"].includes(st || "")) {
    const gateStub = env.CALLGATE.get(env.CALLGATE.idFromName("singleton-v4"));
    const fr = await gateStub.fetch("https://gate/force-release", { method: "POST", body: JSON.stringify({ callSid: sid }) });
    const fb = await fr.json().catch(() => ({}));
    console.log(JSON.stringify({ event: "call_status_release", callSid: sid, ok: !!fb.ok, ts: new Date().toISOString() }));
  }
  return new Response("ok");
}
