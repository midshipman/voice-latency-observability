# Roadmap

## Goal

A controllable, reusable voice foundation: speech recognition, speech synthesis, turn and decision control,
and end-to-end latency. The customer-side LLM, memory, RAG and tools differ per deployment and are treated as
an external variable, not a target of optimization. The small free model used here is intentional.

Status labels: **Implemented** (in this repo and covered by offline tests), **Unverified** (implemented or
configured but not confirmed on a real call), **Planned** (not started), **Lead** (a source to check, not a finding).

## Stage 1: observability (mostly done)

Goal: every segment of browser mic -> Twilio ConversationRelay -> Cloudflare -> LLM -> TTS -> playback has a
measured or explicitly approximate latency or event, and the pages show it faithfully. See `ARCHITECTURE.md`.

- Implemented: seven-node live chain, per-turn timeline, evidence levels, per-stage statistics (turn and median
  basis fixed after review), telemetry ledgers and self-checks, Twilio Voice Insights reconciliation scripts,
  single-call gate, fail-closed route protection, demo mode.
- Unverified: English speech recognition and voice on a real call with this deployment, event ledgers under
  long mobile calls, per-message subrequest budget.
- Open items:
  - Early final transcripts: the cause is undetermined. The Twilio-side configuration showed speech timeout 0 and
    turn detection off; this project's TwiML does not set either. Whether Twilio's documented `auto` is equivalent
    is unverified.
  - Intermediate text chunks are only counted, so Relay buffering behavior cannot be inspected afterwards. The
    hypothesis that Relay accumulates text before accounting the first token needs the first sentence-end chunk
    index and time to be recorded.
  - Telemetry coverage of at least 95 percent is not proven. Cross-clock offset is not calibrated.
  - Real disconnect and error injection are untested. Per-message Durable Object isolation tests are missing.
  - The Voice Insights summary card in the UI needs a real call to be checked.
- Exit criteria: trustworthy observation (no lost events, correct order and correlation, trustworthy times, faithful
  pages). Answer quality and barge-in behavior are not accepted in this stage.

## Stage 2: decision model (fast thinking)

Add a fast layer to the cascade that handles small judgments (whether to speak, when, whether to call a tool, which
filler to use) outside the main LLM: cheap, fast and observable. Internal layering:

- **L1**: the instrumented end-to-end proof of concept (this repo, Stage 1 closure).
- **L2**: an event-driven judgment model (noise versus speech, end-of-turn). Candidate families named in earlier
  research are leads, not selections, and none has been built or evaluated here.
- **L3**: a continuous control loop (tick of 50 to 100 ms, rules wake the fast model; the fast model does not write
  answer text, at most it picks a prepared bridge phrase; the slow LLM writes the answer). It supports proactive
  interruption to correct a mishearing.
- Constraints: STT text does not trigger the LLM by itself, LLM output is queued and released by the loop, stale
  callbacks never send a second reply.
- Wait bridging (planned): while the model or a tool takes seconds, output bridging phrases by wait length (a filler
  for short pauses, an explicit notice past a threshold, natural continuation when the result arrives). Cancel
  immediately on interruption, never overlap the real answer, never state progress that is not true.
- Audio-level decisions need raw audio (for example Twilio Media Streams), which ConversationRelay does not give.
  That is a different integration path and would be evaluated separately.

## Stage 3: full duplex plus reasoning voice model (research direction)

The target is true full duplex combined with a voice model that can reason. This is a research direction, not a
chosen architecture.

A counter-argument to evaluate (claims by its author, not reproduced here): after a year of building full duplex, the
author argued that thinking cannot be done in speech, that Moshi-style full-duplex models offload tool calls and
reasoning to a slower background model and pay a double latency, and proposed a "new three-stage" pipeline instead:
semantic VAD, a multimodal LLM and streaming TTS, where the semantic VAD sparsifies the acoustic signal in time and the
LLM decides when to speak, stop or revise. Treat the figures and conclusions as the author's.

Candidate routes (hypotheses, none validated):

- **A. Full duplex with delegation.** A foreground full-duplex model controls the conversation; a background reasoning
  model does deep thinking and tool calls. Tool-call latency is expected to be structurally higher (to be measured).
- **B. New three-stage pipeline** (semantic VAD + multimodal LLM + streaming TTS). Same lineage as the current cascade,
  so Stage 1 measurement points carry over. It needs direct audio access, so ConversationRelay is not enough. Whether it
  is better on latency and controllability is unverified.
- **Lead to verify:** arXiv 2510.05150 and arXiv 2510.07497, work on thinking while listening inside full-duplex
  models. Not read in depth here, no production evidence.

Evaluation dimensions: end-to-end latency with tool calls, controllability and observability, interruption and
self-correction, cost and local deployment path. Entry condition: Stage 2 is in place and its data gives a baseline for
comparing A and B.

## Invariants

- Do not optimize the customer LLM, memory, RAG or tools as a unified target.
- Every latency number names its measurement boundary and evidence level. Cross-clock approximations are never
  presented as model time.
- Plans, changes and acceptance results are documented in this repository.
- Access control: pages and token endpoint behind a passcode, Twilio signature on webhooks, shared token on the
  WebSocket, secrets only in server-side secret storage.
