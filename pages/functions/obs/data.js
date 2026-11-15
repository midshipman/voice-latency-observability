import { sessionOk } from '../_lib.js';
export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const metricsStub = env.METRICS.get(env.METRICS.idFromName("metrics-v1"));
  const gateStub = env.CALLGATE.get(env.CALLGATE.idFromName("singleton-v4"));
  const [sessRes, gateRes] = await Promise.all([
    metricsStub.fetch("https://m/sessions"), gateStub.fetch("https://gate/state")]);
  const sessions = await sessRes.json().catch(() => ({ sessions: [], evals: [] }));
  const gate = await gateRes.json().catch(() => null);
  let twilioCalls = [], twilioNote = null;
  const now = Date.now();
  if (globalThis.__twCache && now - globalThis.__twCache.t < 60000) {
    ({ twilioCalls, twilioNote } = globalThis.__twCache.v);
  } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    try {
      // Cover the oldest stored session (cap 31d) so older real calls still reconcile;
      // a "today only" window silently mislabels past real calls as unmatched.
      const starts = (sessions.sessions || []).map(x => Date.parse(x.start)).filter(Number.isFinite);
      const oldest = starts.length ? Math.min(...starts) : now;
      const from = new Date(Math.max(oldest, now - 31 * 864e5)).toISOString().slice(0, 10);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json?PageSize=100&StartTime%3E=${from}`,
        { headers: { authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`) } });
      if (!r.ok) {
        twilioNote = "Twilio billing data is temporarily unavailable: HTTP " + r.status;
      } else {
        const j = await r.json();
        twilioCalls = (j.calls || []).map(c => ({
          start: c.start_time, status: c.status, duration: c.duration,
          price: c.price == null ? null : c.price + " " + c.price_unit, sid: c.sid }));
        globalThis.__twCache = { t: now, v: { twilioCalls, twilioNote } };
      }
    } catch (e) { twilioNote = "Twilio billing data is temporarily unavailable:" + String(e); }
  } else { twilioNote = "Twilio credentials not configured"; }
  return Response.json({ sessions: sessions.sessions || [], evals: sessions.evals || [], telemetry: sessions.telemetry || [], teleStats: sessions.teleStats || {}, teleLedger: sessions.teleLedger || {}, build: sessions.build || null, sdkEvents: sessions.sdkEvents || [], gate, twilioCalls, twilioNote });
}
