import { handleRelaySession } from './_lib.js';
export async function onRequestGet(context) {
  // Pages Functions pass waitUntil on the context itself (there is no context.ctx).
  // Without it the lease release and metric writes at socket close were fire-and-forget
  // and could be dropped when the handler ended, leaving the gate busy for the next call.
  const { request, env } = context;
  const ctx = { waitUntil: (p) => context.waitUntil(p) };
  const url = new URL(request.url);
  // Fail closed: WS_TOKEN must be configured (it is embedded only in the signed TwiML).
  if (!env.WS_TOKEN || url.searchParams.get("tk") !== env.WS_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  const lease = url.searchParams.get("lease");
  if (!lease) return new Response("forbidden", { status: 403 });
  if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
  const gateStub = env.CALLGATE.get(env.CALLGATE.idFromName("singleton-v4"));
  const metricsStub = env.METRICS.get(env.METRICS.idFromName("metrics-v1"));
  const liveStub = env.LIVEBUS.get(env.LIVEBUS.idFromName("livebus-v1"));
  const pair = new WebSocketPair();
  const cf = request.cf || {};
  const nn = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
  // What Cloudflare measured for the Twilio ConversationRelay connection itself.
  const netInfo = { colo: cf.colo || null, country: cf.country || null, asn: nn(cf.asn), tcpRtt: nn(cf.clientTcpRtt),
    quicRtt: nn(cf.clientQuicRtt), proto: cf.httpProtocol || null, tls: cf.tlsVersion || null };
  handleRelaySession(pair[1], env, ctx, gateStub, metricsStub, liveStub, lease, netInfo);
  return new Response(null, { status: 101, webSocket: pair[0] });
}
