import { sessionOk } from './_lib.js';
// Browser <-> Cloudflare edge probe. Returns the server clock and what Cloudflare
// itself measured for THIS connection (TCP/QUIC RTT of the browser to the edge).
// Metadata only; no audio, no call state, never touches the call gate.
export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const cf = request.cf || {};
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
  const body = { s: Date.now(), colo: cf.colo || null, country: cf.country || null, asn: num(cf.asn),
    tcpRtt: num(cf.clientTcpRtt), quicRtt: num(cf.clientQuicRtt), proto: cf.httpProtocol || null };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
