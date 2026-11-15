import { passcodeMatches, makeSessionCookie, GATE_PAGE } from './_lib.js';
export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  if (!form || !(await passcodeMatches(env, form.get("passcode")))) {
    return new Response(GATE_PAGE.replace("<form", "<p style=\"color:#b00\">Wrong passcode.</p><form"),
      { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response(null, { status: 303, headers: {
    location: "/", "set-cookie": await makeSessionCookie(env) } });
}
export async function onRequest() { return new Response("method not allowed", { status: 405 }); }
