# Deployment

Everything runs on Cloudflare (free plan is enough for the demo) plus a Twilio account for real calls.

## Components

1. **Durable Object Worker** (`worker/`, name `voice-latency-obs-do`): hosts `CallGate`
   (single active call gate and leases), `MetricsStore` (per-call records) and `LiveBus`
   (live event fan-out). It serves no routes.
2. **Pages project** (`pages/`, name `voice-latency-obs`): all pages and routes. It binds the three
   Durable Objects from the Worker above by `script_name`.

Deploy the Worker first, then Pages. Both names are in the `wrangler.toml` files and can be changed
together (the Pages `script_name` must match the Worker `name`).

```
cd worker && npx wrangler deploy
cd ../pages && npx wrangler pages deploy public --project-name voice-latency-obs --branch main
```

Run the Pages deploy from `pages/` so `functions/` and `wrangler.toml` are included. From the repo
root only static files would upload and every route would 404.

## Secrets (never in the repo, never in the browser)

Cloudflare Pages secrets are encrypted values attached as bindings. They cannot be read back after
they are set and are available to Pages Functions only through `context.env`
(source: https://developers.cloudflare.com/pages/functions/bindings/ , "Secrets"). Set them before
the deployment that needs them:

```
npx wrangler pages secret put PAGE_PASSCODE     --project-name voice-latency-obs
npx wrangler pages secret put WS_TOKEN          --project-name voice-latency-obs
npx wrangler pages secret put TWILIO_ACCOUNT_SID    --project-name voice-latency-obs
npx wrangler pages secret put TWILIO_AUTH_TOKEN     --project-name voice-latency-obs
npx wrangler pages secret put TWILIO_API_KEY_SID    --project-name voice-latency-obs
npx wrangler pages secret put TWILIO_API_KEY_SECRET --project-name voice-latency-obs
npx wrangler pages secret put TWILIO_TWIML_APP_SID  --project-name voice-latency-obs
```

(The dashboard path is Settings > Variables and Secrets > Add > Encrypt.) Plain `[vars]` in
`pages/wrangler.toml` hold only non-secret settings: `LLM_MODEL`, `SYSTEM_PROMPT`,
`DAILY_CALL_CAP_MS`, `REAL_CALL_ENABLED`. For local development put secrets in `.dev.vars`
(git-ignored).

| Secret | Used for |
| --- | --- |
| `PAGE_PASSCODE` | login form for every page and API; session cookie is an HMAC of it |
| `WS_TOKEN` | shared token embedded only in the signed TwiML; `/ws` refuses without it |
| `TWILIO_AUTH_TOKEN` | validates `X-Twilio-Signature` on `/voice` and `/call-status`; Insights/billing reads |
| `TWILIO_ACCOUNT_SID` | Twilio REST reads (Insights, call status) |
| `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | signs the browser Voice SDK access token |
| `TWILIO_TWIML_APP_SID` | TwiML App the browser call is routed through |

## Twilio setup (needed for real calls)

1. Accept the Twilio terms for Conversational Intelligence / AI features that ConversationRelay needs.
2. Create an API key and a TwiML App whose Voice URL is `https://<your-pages-domain>/voice`.
3. Optionally point the TwiML App status callback to `/call-status` (the session-gated
   `POST /admin-twilio-status-callback` does this and refuses if the Voice URL is on another host).
4. Pricing and plan terms change; check Twilio's current pricing before testing
   (https://www.twilio.com/en-us/products/conversational-ai/pricing).

## Call protections

- Pages, `/token` and all data routes need the passcode session; `/voice` and `/call-status` need a valid
  Twilio signature; `/ws` needs `WS_TOKEN` plus a lease issued by `/voice`. Each fails closed when its
  secret is missing.
- One call at a time (`CallGate`), 10 minute per-call limit, 120 second idle watchdog, orphaned leases expire.
- `REAL_CALL_ENABLED = "false"` closes all real-call routes on the server.
- Publishing this code does not open anonymous access to paid calls: without the passcode and the Twilio
  signature nothing can place or answer a call.
- This deployment owns its own Durable Object namespaces (new Worker name), so it shares no stored call
  data with any other deployment.

## Verify after deploying

- `curl -s https://<domain>/obs/data` without a session cookie returns no call data (the passcode form or a rejection), and `curl -s -X POST https://<domain>/voice` without a Twilio signature is rejected.
- `https://<domain>/?demo=1` renders (demo data is labeled).
- The page footer shows the build string `en-1.0.0`.
- Search the deployed page source and responses for any secret value (there must be none).

## Rollback

Pages keeps every deployment: `npx wrangler pages deployment list --project-name voice-latency-obs`, then
`npx wrangler pages deployment promote <deployment-id> --project-name voice-latency-obs`. Durable Object data is
independent of Pages deployments; redeploying the Worker with unchanged event schemas does not touch it.
