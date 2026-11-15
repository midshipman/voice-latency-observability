import { sessionOk } from './_lib.js';
// One-time setup (session-gated): point the TwiML App's StatusCallback at
// this host's /call-status. Reads the app first and refuses to write when its
// voice_url does not belong to this host; reports before/after.
export async function onRequestPost({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_TWIML_APP_SID: app } = env;
  if (!sid || !tok || !app) return Response.json({ ok: false, reason: "missing_twilio_env", have: { sid: !!sid, tok: !!tok, app: !!app } }, { status: 400 });
  const host = new URL(request.url).host;
  const auth = { authorization: "Basic " + btoa(`${sid}:${tok}`) };
  const appUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Applications/${app}.json`;
  const cur = await (await fetch(appUrl, { headers: auth })).json().catch(() => null);
  if (!cur || !cur.sid) return Response.json({ ok: false, reason: "app_read_failed" }, { status: 502 });
  let voiceOk = false;
  try { voiceOk = new URL(cur.voice_url).host === host; } catch {}
  if (!voiceOk) return Response.json({ ok: false, reason: "voice_url_mismatch", voice_url: cur.voice_url, host }, { status: 409 });
  const want = `https://${host}/call-status`;
  if (cur.status_callback === want) return Response.json({ ok: true, already: true, status_callback: cur.status_callback });
  const upd = await fetch(appUrl, { method: "POST",
    headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ StatusCallback: want, StatusCallbackMethod: "POST" }) });
  const uj = await upd.json().catch(() => ({}));
  return Response.json({ ok: upd.ok, before: cur.status_callback || null, after: uj.status_callback || null });
}
