# Voice latency observability

> **Status (2026-11-26): the experiment is stopped. This repository is a public historical record and is no longer maintained.**
>
> - The call page described below is not meant to be tested any more. Please do not place calls.
> - The deployment still exists and has not been deleted, but its dedicated call entry has been disabled on the telephony side (reversible). It is not fully offline.
> - The slow-wait problem in the English demo was never verified as fixed. It is a known open issue.
> - Everything below describes the project as it was while it ran. Setup and call instructions are kept for history, not as a current invitation to run or deploy it.

A small, honest instrument for a cascaded voice agent. It places a browser call through
Twilio ConversationRelay to a Cloudflare backend (Pages Functions, Durable Objects, Workers AI)
and shows, for every stage of the path, what was actually observed, what is only approximated,
and what cannot be measured.

The stack under test:

```
browser mic -> Twilio Voice SDK -> Twilio ConversationRelay (hosted STT + TTS)
            -> wss /ws (Cloudflare Pages Function) -> Workers AI LLM (streamed)
            -> text tokens back to Relay -> hosted TTS -> browser speaker
```

The LLM is deliberately a small, free model. The point of this project is the voice layer
(STT, TTS, turn handling, end-to-end latency), not answer quality.

## What it shows

- **Call page** (`/`): a seven-node live chain (microphone, STT, WS in, LLM, WS out, TTS, speaker)
  with a per-turn event timeline, evidence-level tags and a 1-second latency budget halo.
  `/?demo=1` plays a scripted animation (clearly labeled demo data, not a measurement).
- **Observability page** (`/obs`): per-turn cascade bars, per-stage mean/median/P70/P95,
  telemetry ledgers (what the browser sent vs what the Worker stored), reconciliation against
  Twilio Voice Insights, and a text-only baseline eval.
- **Evidence levels** on every number: E1 direct browser observation, E2 Relay real-time
  notification, E3 derived on one clock, E4 cross-clock approximation, E5 Twilio Insights
  post-call record. Cross-clock numbers are never presented as model time.

## What is verified and what is not

- Verified by the test suite in this repo (`npm test`, 22 files, no network, no Twilio account):
  event handling, turn counting, stall and cancel behavior, ledgers, lamp state machine,
  page rendering against recorded event shapes, call gate and storage limits.
- **Real-call check (synthetic audio, not a human):** on the reference deployment, three calls were placed with a
  synthetic English voice (`tests/e2e/`). Two ran to the end with two turns each. The final transcripts were 31 and 42 characters
  (the lengths of the two test sentences; text is not stored, so the wording itself was not checked), replies were
  played back, and the observability page filled from the server record. One call dropped after about 25 s with no recorded end event and
  the cause was not found (a rerun with the same audio completed). A human on a phone has not been tested, speech
  recognition quality on real accents and the actual ElevenLabs voice have not been listened to.
- Without the Twilio secrets listed in `docs/DEPLOYMENT.md`, `/voice`, `/ws` and `/token` fail closed, and demo mode
  (`/?demo=1`) and the observability pages still work without any call.
- The numbers in `docs/ARCHITECTURE.md` come from earlier real calls of the original Chinese
  prototype; the raw call records are not included.

## Layout

| Path | What |
| --- | --- |
| `pages/functions/` | Pages Functions: call page, `/obs`, `/voice` (TwiML), `/ws` (Relay WebSocket + LLM), `/live`, `/telemetry`, `/insights`, `/obs/data`, `/token` |
| `pages/public/` | static assets (`sdk-observer.js`, `robots.txt`) |
| `worker/` | Worker that hosts the Durable Objects (`CallGate`, `MetricsStore`, `LiveBus`) |
| `tests/` | offline tests; `npm test` runs all of them |
| `scripts/` | helpers, not part of `npm test`: `crosscheck-call.mjs` and `insights-calibrate.mjs` read Twilio Voice Insights data with your Twilio credentials; `validate-telemetry.mjs` POSTs simulated rows to your deployed site and needs a login cookie (its effect on live data and cost is unverified). All need network and your own accounts |
| `docs/ARCHITECTURE.md` | physical path, clocks, measurement points, what each proves and does not prove |
| `docs/ROADMAP.md` | plan as of when the project was active (historical, not being pursued) |
| `docs/DEPLOYMENT.md` | setup, secrets, call protections, rollback |
| `docs/DESIGN.md` | UI conventions and the budget display rules |

## Quick start

Requirements: Node.js 20 or newer (tested on 20.20 and 22.23; Node 18 fails some tests). There are
no npm dependencies, so no `npm install` is needed.

```
git clone https://github.com/midshipman/voice-latency-observability.git
cd voice-latency-observability
npm test        # runs every tests/*.test.mjs, each in its own process; expect "all test files passed"
```

The tests need no accounts or secrets.

**Cost warning before you deploy.** `pages/wrangler.toml` sets `REAL_CALL_ENABLED = "true"` and `worker/wrangler.toml` sets `DAILY_CALL_CAP_MS = "0"` (no daily cap). Deploying as-is opens real Twilio calls, which cost money, with only the per-call limit and idle protection. Set `REAL_CALL_ENABLED = "false"` first if you do not want real calls. `npm test` never touches the network. `tests/e2e/` places real calls and needs `puppeteer-core` installed separately (`npm i puppeteer-core`, see `tests/e2e/README.md`), which is the one exception to "no npm dependencies".

Deploy by following `docs/DEPLOYMENT.md`. Never commit credentials: they live in Cloudflare
secrets and are read on the server at run time.

## Privacy

Only timings and event metadata are stored. No audio and no transcript text are recorded
(`CONTENT_LOG` is off and set to false in code). The pages are behind a passcode, and the site
sends `Disallow: /` in `robots.txt`.

## License

No license file is included yet. Until the owner adds one, the default is all rights reserved.

> 做事方法、质量标准和禁区见 [SKILL.md](SKILL.md)。
