# UI conventions

Display-only rules. They never change call logic or metric meaning.

## Color roles

| Role | Call page (dark) | Observability page (light) |
| --- | --- | --- |
| Background / card | #17181c / #1e2026 | #f5f4f1 / #ffffff |
| Text / secondary | #e8e6e1 / #9c988f | #25211e / #6f6a64 |
| Accent (only one) | #63b8a2 (button #2e7d6b) | #2e7d6b |
| Measured | teal chip | #e1efe9 / #276552 |
| Approximate | amber chip | #f4ead5 / #7d6227 |
| Blind spot / error | brick chip | #f3e1de / #96463d |

## Rules

1. One accent color. Pipeline nodes are not color-coded per stage: active = accent pulse, done = dimmed.
2. Color carries meaning only. Measured, approximate and blind-spot colors are never decorative.
3. Model info is a structured card (STT, LLM, TTS, voice, model, each with a source chip: explicit config,
   documented default, not configurable), never a long paragraph.
4. Mobile first (390 px and 320 px checked). Body text is never below about 0.68 rem.
5. Every caveat string (what "approximate" means, that physical sound output is unreachable, that interrupt
   means playback progress) stays verbatim. Demo mode always carries a "demo data" label.

## Budget display

Segment durations and end-to-end time are colored by budget state: green within budget, orange up to 1.5x,
red above 1.5x. Budgets map to the observed segments as: s1 300 ms, s2 350 ms, s3 300 ms, end to end 1000 ms.
This is an approximate mapping, not an industry standard. The component budget split is endpoint + ASR 300,
LLM first token 350, TTS first audio 150, network + playback 150, reserve 50 (total 1000 ms). Budget state is
not a timeout: the system never ends a call because of it. While a stage is in progress its halo changes color
with the waiting time (same thresholds); speaking and playback are not charged to the budget because their
duration is not latency. The LLM budget depends on the backend (memory, RAG, tools); the current model is a
small free one, so it is not representative of production.
