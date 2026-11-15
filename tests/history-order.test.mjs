// Code-level test of the LLM conversation history helpers (no network).
import assert from 'node:assert/strict';
import { historyAddUser, historyAddReply } from '../pages/functions/_lib.js';
const h = [];
const u1 = historyAddUser(h, 'first part');
const u2 = historyAddUser(h, 'second part');
const u3 = historyAddUser(h, 'question');
// replies complete out of order; turn 1 and 2 were cancelled with no text
assert.equal(historyAddReply(h, u1, ''), false);
assert.equal(historyAddReply(h, u2, ''), false);
assert.equal(historyAddReply(h, u3, 'answer'), true);
assert.deepEqual(h.map(m => m.role + ':' + m.content), ['user:first part', 'user:second part', 'user:question', 'assistant:answer']);
// a reply that completes late goes right after its own user line, not at the end
const h2 = []; const a = historyAddUser(h2, 'A'); const b = historyAddUser(h2, 'B');
historyAddReply(h2, b, 'rB'); historyAddReply(h2, a, 'rA');
assert.deepEqual(h2.map(m => m.content), ['A', 'rA', 'B', 'rB']);
// partial reply of an interrupted turn is kept
const h3 = []; const c = historyAddUser(h3, 'C'); historyAddReply(h3, c, 'partial');
assert.equal(h3.length, 2);
// no empty assistant message is ever stored
assert.ok(![...h, ...h2, ...h3].some(m => m.role === 'assistant' && !m.content));
console.log('PASS history order and no empty assistant messages');
