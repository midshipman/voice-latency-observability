import { sessionOk, callsEnabled, mintAccessToken } from './_lib.js';
export async function onRequestGet({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  if (!callsEnabled(env)) return new Response("Real calls are not enabled: the server has closed calls.", { status: 403 });
  const identity = "browser-user";
  const token = await mintAccessToken(env, identity);
  return Response.json({ token, identity });
}
