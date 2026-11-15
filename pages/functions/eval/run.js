import { sessionOk, streamLLM, EVAL_SET_VERSION, EVAL_PROMPTS } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  if (!(await sessionOk(request, env))) return new Response("forbidden", { status: 403 });
  const metricsStub = env.METRICS.get(env.METRICS.idFromName("metrics-v1"));
  const begin = await metricsStub.fetch("https://m/eval/begin", { method: "POST" });
  if (begin.status === 429) {
    return new Response("The eval was just run or is in progress, try again in 60 seconds (quota protection).", { status: 429 });
  }
  // Bounded A/B: allowlisted candidate models via ?model=, default = active LLM.
  // Free-quota text-layer only; the active call path is never touched.
  const EVAL_MODEL_ALLOWLIST = ["@cf/qwen/qwen3-30b-a3b-fp8", "@cf/zai-org/glm-4.7-flash"];
  const qModel = new URL(request.url).searchParams.get("model");
  if (qModel && !EVAL_MODEL_ALLOWLIST.includes(qModel)) {
    return new Response("model not in eval allowlist", { status: 400 });
  }
  const evalModel = qModel || env.LLM_MODEL;
  const run = { id: crypto.randomUUID(), ts: new Date().toISOString(),
                model: evalModel, setVersion: EVAL_SET_VERSION, results: [] };
  for (const p of EVAL_PROMPTS) {
    const t0 = Date.now();
    let chars = 0, firstTokenAt = null, err = null, badChunks = 0;
    try {
      for await (const tok of streamLLM(env, [], p.q, evalModel)) {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        if (typeof tok === "string") chars += tok.length; else badChunks++;
      }
    } catch (e) { err = String(e).slice(0, 200); }
    run.results.push({ id: p.id, firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null,
                       totalMs: Date.now() - t0, replyChars: chars, nonStringChunks: badChunks, error: err });
  }
  await metricsStub.fetch("https://m/eval", { method: "POST", body: JSON.stringify({ run }) })
    .catch((e) => console.error("metrics eval error", String(e)));
  return Response.json(run);
}
export async function onRequest() { return new Response("method not allowed", { status: 405 }); }
