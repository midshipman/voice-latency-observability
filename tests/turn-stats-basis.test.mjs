// v5z9: unified median basis + turn counting by Relay final trigger + Worker recording self-check.
// Synthetic and anonymized timing-only fixtures; no content, no identifiers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { medianOf, turnTriggerStats, recSelfCheck, summarizeInsights, ledgerSummary } from '../pages/functions/_lib.js';

let pass = 0;
const chk = (n, c, x) => { c ? pass++ : (() => { throw new Error(n + ' ' + JSON.stringify(x)); })(); console.log('PASS', n); };

// ---------- 1) medianOf: conventional median everywhere ----------
chk('median odd', medianOf([5, 1, 3]) === 3);
chk('median even = mean of two middles', medianOf([3393, 3457]) === 3425);
chk('median even 8-sample (11-04 call shape)', medianOf([1665, 2815, 3391, 3393, 3457, 3521, 3841, 6656]) === 3425);
chk('median empty null', medianOf([]) === null && medianOf(null) === null);
chk('median ignores non-numbers', medianOf([100, 'x', null, 300, 200]) === 200);

// summarizeInsights stat now uses the same basis (was upper-median: 8 samples would give 3457)
const ins = summarizeInsights([
  { group: 'conversation_relay', name: 'stt_latency', timestamp: 't1', conversation_relay_data: { stt_latency: { latency_ms: 100 } } },
  { group: 'conversation_relay', name: 'stt_latency', timestamp: 't2', conversation_relay_data: { stt_latency: { latency_ms: 200 } } },
  { group: 'conversation_relay', name: 'stt_latency', timestamp: 't3', conversation_relay_data: { stt_latency: { latency_ms: 300 } } },
  { group: 'conversation_relay', name: 'stt_latency', timestamp: 't4', conversation_relay_data: { stt_latency: { latency_ms: 400 } } },
], 4, null);
chk('insights stat median conventional (100..400 -> 250, not 300)', ins.stt.median === 250, ins.stt);

// ---------- 2) turnTriggerStats: final-trigger basis ----------
const bnd = (turn) => ({ event: 'boundary', boundary: 'relay_final_received', turn });
const trec = (turn) => ({ event: 'turn', turn });
chk('match: no mismatch flags', (() => { const t = turnTriggerStats({ events: [bnd(1), trec(1), bnd(2), trec(2)], end: { turns: 2 } }); return t.count === 2 && t.basis === 'finals' && !t.recMismatch && !t.endMismatch; })());
chk('missing records listed by turn number', (() => { const t = turnTriggerStats({ events: [bnd(1), bnd(2), bnd(3), trec(1), trec(3)] }); return t.count === 3 && t.recMismatch && t.missingRecords.length === 1 && t.missingRecords[0] === 2; })());
chk('extra record flagged', (() => { const t = turnTriggerStats({ events: [bnd(1), trec(1), trec(2)] }); return t.recMismatch && t.extraRecords[0] === 2; })());
chk('end count mismatch flagged', (() => { const t = turnTriggerStats({ events: [bnd(1), trec(1)], end: { turns: 2 } }); return t.endMismatch === true; })());
chk('legacy: no trigger boundary -> records basis, not mismatched', (() => { const t = turnTriggerStats({ events: [trec(1), trec(2)] }); return t.count === 2 && t.basis === 'records' && !t.recMismatch; })());
chk('duplicate boundary for same turn counts once per turn number', (() => { const t = turnTriggerStats({ events: [bnd(1), bnd(1), trec(1)] }); return t.finals === 1 && t.count === 1; })());

// ---------- 3) recSelfCheck ----------
chk('balanced: 11-04 shape (154 rec, 0 dropped, 165 stored, 11 netlog)', (() => { const c = recSelfCheck({ events: [...Array(154)].map(() => ({ event: 'x' })), ...[...Array(11)].map(() => ({ event: 'browser_net' })), end: { recordedEventsByType: { x: 154 }, subrequestDropped: 0 } }); return c && c.missing === 0; })());
chk('loss detected: rec counted but not stored', (() => { const c = recSelfCheck({ events: [...Array(10)].map(() => ({ event: 'x' })), end: { recordedEventsByType: { x: 13 }, subrequestDropped: 1 } }); return c.missing === 2; })());
chk('legacy without recBy -> null (not decidable)', recSelfCheck({ events: [], end: { turns: 3 } }) === null);


console.log('turn-stats-basis: ' + pass + ' pass, 0 fail');
