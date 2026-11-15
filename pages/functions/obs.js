import { sessionOk, GATE_PAGE, OBS_PAGE } from './_lib.js';
export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) {
    return new Response(GATE_PAGE, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response(OBS_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
}
