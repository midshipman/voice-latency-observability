import { sessionOk, summarizeInsights, relayLegCoverage } from "./_lib.js";
// Read-only: Twilio credentials stay in the Pages environment, the browser only gets aggregates.
export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const u = new URL(request.url);
  const sid = u.searchParams.get("callSid") || "";
  if (!/^CA[0-9a-f]{32}$/.test(sid)) return Response.json({ error: "bad callSid" }, { status: 400 });
  const finals = Number(u.searchParams.get("finals"));
  const h = { authorization: "Basic " + btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`) };
  const [er, sr] = await Promise.all([
    fetch(`https://insights.twilio.com/v1/Voice/${sid}/Events?Edge=carrier_edge&PageSize=200`, { headers: h }),
    fetch(`https://insights.twilio.com/v1/Voice/${sid}/Summary?ProcessingState=partial`, { headers: h }),
  ]);
  if (!er.ok) return Response.json({ ready: false, status: er.status });
  const ej = await er.json();
  let sj = null; if (sr.ok) { try { sj = await sr.json(); } catch {} }
  const out = summarizeInsights(ej.events, finals, sj);
  let leg = null;
  try {
    const m = await env.METRICS.get(env.METRICS.idFromName("metrics-v1")).fetch("https://m/sessions");
    const mj = await m.json();
    const sess = (mj.sessions || []).find((x) => x.callSid === sid);
    leg = sess ? relayLegCoverage(ej.events, sess.events) : { decidable: false, note: "The Worker has no session record for this call: receive side unknown" };
  } catch { leg = { decidable: false, note: "Worker session read failed: receive side unknown" }; }
  out.relayLeg = leg;
  return Response.json({ ready: out.eventCount > 0, summaryHttp: sr.status, ...out });
}
