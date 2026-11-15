import { sessionOk } from './_lib.js';
export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid") || "";
  if (!callSid) return new Response("missing callSid", { status: 400 });
  if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
  const liveStub = env.LIVEBUS.get(env.LIVEBUS.idFromName("livebus-v1"));
  return liveStub.fetch(new Request("https://lb/sub?callSid=" + encodeURIComponent(callSid) + "&after=" + encodeURIComponent(url.searchParams.get("after") || "0"), request));
}
