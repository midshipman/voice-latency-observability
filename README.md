# Voice latency observability

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
| `scripts/` | offline cross-check and calibration helpers for Twilio Voice Insights data |
| `docs/ARCHITECTURE.md` | physical path, clocks, measurement points, what each proves and does not prove |
| `docs/ROADMAP.md` | current plan |
| `docs/DEPLOYMENT.md` | setup, secrets, call protections, rollback |
| `docs/DESIGN.md` | UI conventions and the budget display rules |

## Quick start

```
npm test
```

Deploy by following `docs/DEPLOYMENT.md`. Never commit credentials: they live in Cloudflare
secrets and are read on the server at run time.

## Privacy

Only timings and event metadata are stored. No audio and no transcript text are recorded
(`CONTENT_LOG` is off and set to false in code). The pages are behind a passcode, and the site
sends `Disallow: /` in `robots.txt`.

## License

No license file is included yet. Until the owner adds one, the default is all rights reserved.
