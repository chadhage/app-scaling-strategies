'use strict';

// page.js under Node: the real script runs in a vm context with a DOM stub built from the ids of the real index.html.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { produceTranscript } = require('../transcript.cjs');
const { createDocument, runPage } = require('./dom-stub.cjs');

const root = path.resolve(__dirname, '..');
let transcript;
before(async () => { transcript = await produceTranscript(); });

const clone = () => structuredClone(transcript);
const response = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const verifyWith = (mutate) => {
  const copy = clone();
  mutate(copy);
  return runPage({ fetch: async () => response(copy) }).context.C028Transcript.verify(copy);
};
const call = (copy, id) => copy.calls.find((item) => item.id === id);
// Rebuild event numbers after an edit so a mutation breaks exactly one rule.
const renumber = (item) => item.events.forEach((event, index) => { event.n = index + 1; });
const rejects = (mutate, code) => {
  const verdict = verifyWith(mutate);
  assert.equal(verdict.verified, false);
  assert.equal(verdict.code, code, verdict.message);
};

test('the page enables its button and every element id it uses exists in the real index.html', async () => {
  const { document } = runPage({ fetch: async () => response(transcript) });
  assert.equal(document.element('load').disabled, false);
  assert.equal(document.element('status').textContent, '');
  await document.element('load').click();
  for (const id of document.requested) assert.ok(document.elements.has(id), id);
  assert.deepEqual([...document.requested].sort(), ['calls', 'load', 'probes', 'status', 'summary']);
});

test('loading the real server transcript verifies it and shows calls, events, statuses, trailers and refused probes', async () => {
  const { document } = runPage({ fetch: async (url, options) => {
    assert.deepEqual([url, options.method, options.cache, options.credentials, options.redirect], ['/transcript.json', 'GET', 'no-store', 'omit', 'error']);
    return response(transcript);
  } });
  await document.element('load').click();
  assert.match(document.element('status').textContent, /^VERIFIED LOCAL TRANSCRIPT — 7 calls, 14 messages, 3 refused probes\. The browser observed this transcript, not native gRPC\.$/);
  const summary = JSON.parse(document.element('summary').textContent);
  assert.equal(summary.verified, true);
  assert.equal(summary.calls, 7);
  assert.ok(summary.outcomes.includes('watch-cancelled: cancelled / CANCELLED'));
  assert.ok(summary.outcomes.includes('watch-deadline: deadline-exceeded / DEADLINE_EXCEEDED'));
  const calls = document.element('calls').children;
  assert.equal(calls.length, 7);
  assert.equal(calls[0].className, 'call outcome-ok');
  assert.match(calls[0].text(), /Server streaming: five ordered ticks/);
  assert.match(calls[0].text(), /"seq":5/);
  assert.match(calls[0].text(), /\{"grpc-status":"0"\}/);
  assert.match(calls[2].text(), /CANCELLED \(1\) from client-cancel; server: CANCELLED via client-reset, produced 3/);
  assert.match(calls[3].text(), /DEADLINE_EXCEEDED \(4\) from server-trailers/);
  assert.match(calls[6].text(), /MESSAGE_TOO_LARGE/);
  assert.equal(calls[0].children[2].children[0].children.length, transcript.calls[0].events.length, 'one table row per event');
  assert.equal(document.element('probes').children.length, 3);
  assert.match(document.element('probes').text(), /HTTP\/1\.1 505/);
  assert.equal(document.element('load').disabled, false);
});

test('a missing, unreachable or unreadable transcript is REJECTED and clears the display', async () => {
  const outcomes = [];
  for (const behavior of [
    async () => response({}, { ok: false, status: 500 }),
    async () => { throw new Error('offline'); },
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }),
    async () => response(null),
    async () => response({ calls: [], probes: [] }),
    async () => response({ calls: [{ id: 'x', result: null }], probes: [] })
  ]) {
    const { document } = runPage({ fetch: behavior });
    document.element('summary').textContent = 'stale';
    await document.element('load').click();
    outcomes.push(document.element('status').textContent);
    assert.equal(document.element('summary').textContent, 'No verified transcript.');
    assert.equal(document.element('calls').children.length, 0);
    assert.equal(document.element('probes').children.length, 0);
  }
  assert.deepEqual(outcomes.map((text) => text.split(':')[0]), [
    'REJECTED — HTTP_500', 'REJECTED — TRANSCRIPT_UNAVAILABLE', 'REJECTED — TRANSCRIPT_UNAVAILABLE', 'REJECTED — TRANSCRIPT_MALFORMED',
    'REJECTED — TRANSCRIPT_MALFORMED', 'REJECTED — CALL_MALFORMED']);
  assert.match(outcomes[5], /\(x\)$/);
});

test('verification that throws unexpectedly is still a rejection, never a healthy page', async () => {
  const hostile = { calls: [{ id: 'x', result: { violations: [], status: { code: 0, origin: 'server-trailers' }, ok: true, messageCount: 0 }, server: {}, events: [{ n: 1, ev: 'request' }, { n: 2, ev: 'end' }] }], probes: [] };
  Object.defineProperty(hostile, 'calls', { get() { throw new Error('boom'); } });
  const { document } = runPage({ fetch: async () => response(hostile) });
  await document.element('load').click();
  assert.match(document.element('status').textContent, /^REJECTED — TRANSCRIPT_MALFORMED: The transcript could not be verified\./);
});

test('a click on a disabled button is ignored by the handler itself', async () => {
  let fetches = 0;
  const { document } = runPage({ fetch: async () => { fetches += 1; return response(transcript); } });
  document.element('load').disabled = true;
  await document.element('load').forceClick();
  assert.equal(fetches, 0);
});

test('verify rejects structurally broken transcripts and calls', () => {
  rejects((copy) => { copy.calls = []; }, 'TRANSCRIPT_MALFORMED');
  rejects((copy) => { copy.probes = 'x'; }, 'TRANSCRIPT_MALFORMED');
  rejects((copy) => { delete call(copy, 'watch-ok').server; }, 'CALL_MALFORMED');
  rejects((copy) => { call(copy, 'watch-ok').events = []; }, 'CALL_MALFORMED');
  rejects((copy) => { delete call(copy, 'watch-ok').id; }, 'CALL_MALFORMED');
  rejects((copy) => { call(copy, 'watch-ok').result.violations = null; }, 'CALL_MALFORMED');
  rejects((copy) => { call(copy, 'watch-ok').events[3].n = 99; }, 'EVENT_ORDER');
  rejects((copy) => { call(copy, 'watch-ok').events[3].ev = 'invented'; }, 'EVENT_ORDER');
  rejects((copy) => { call(copy, 'watch-ok').events[1] = null; }, 'EVENT_ORDER');
  rejects((copy) => { const item = call(copy, 'watch-ok'); item.events.push({ n: item.events.length + 1, ev: 'message' }); }, 'EVENT_ORDER');
  rejects((copy) => { const item = call(copy, 'watch-ok'); item.events.pop(); }, 'EVENT_ORDER');
  rejects((copy) => { const item = call(copy, 'watch-ok'); item.events[0].ev = 'headers'; }, 'EVENT_ORDER');
});

test('verify rejects forged order, counts, statuses and claims of success', () => {
  rejects((copy) => { call(copy, 'watch-ok').events.find((event) => event.ev === 'message').message.seq = 9; }, 'MESSAGE_ORDER');
  rejects((copy) => { call(copy, 'watch-ok').events.find((event) => event.ev === 'message').index = 2; }, 'MESSAGE_ORDER');
  rejects((copy) => { call(copy, 'watch-ok').events.find((event) => event.ev === 'message').message = null; }, 'MESSAGE_ORDER');
  rejects((copy) => {
    const item = call(copy, 'watch-ok');
    const trailers = item.events.findIndex((event) => event.ev === 'trailers');
    item.events.splice(2, 0, ...item.events.splice(trailers, 1));
    renumber(item);
  }, 'MESSAGE_AFTER_TRAILERS');
  rejects((copy) => { call(copy, 'watch-ok').result.messageCount = 4; }, 'MESSAGE_COUNT_MISMATCH');
  rejects((copy) => { call(copy, 'watch-ok').result.status = null; }, 'STATUS_MISMATCH');
  rejects((copy) => { call(copy, 'watch-ok').result.status.code = 'x'; }, 'STATUS_MISMATCH');
  rejects((copy) => { call(copy, 'watch-ok').result.status.origin = 7; }, 'STATUS_MISMATCH');
  rejects((copy) => { call(copy, 'watch-ok').result.ok = false; }, 'OK_MISMATCH');
  rejects((copy) => { call(copy, 'unknown-method').result.ok = true; }, 'OK_MISMATCH');
  rejects((copy) => {
    const item = call(copy, 'watch-ok');
    item.events.splice(item.events.findIndex((event) => event.ev === 'trailers'), 1);
    renumber(item);
  }, 'OK_WITHOUT_TRAILERS');
  rejects((copy) => {
    const item = call(copy, 'watch-ok');
    item.events.find((event) => event.ev === 'trailers').trailers['grpc-status'] = '14';
  }, 'OK_WITHOUT_TRAILERS');
  rejects((copy) => { call(copy, 'watch-deadline').result.status.code = 8; }, 'STATUS_MISMATCH');
  rejects((copy) => { call(copy, 'watch-ok').result.trailersOnly = true; }, 'TRAILERS_ONLY_WITH_MESSAGES');
});

test('verify rejects a cancel or a deadline the server record does not confirm', () => {
  rejects((copy) => { call(copy, 'watch-cancelled').server.outcome = 'OK'; }, 'CANCEL_NOT_OBSERVED');
  rejects((copy) => { call(copy, 'watch-cancelled').server.writesAfterFinish = 1; }, 'CANCEL_NOT_OBSERVED');
  rejects((copy) => { call(copy, 'watch-cancelled').server.produced = 0; }, 'CANCEL_NOT_OBSERVED');
  rejects((copy) => { call(copy, 'watch-cancelled').result.status.code = 4; }, 'CANCEL_NOT_OBSERVED');
  rejects((copy) => { call(copy, 'watch-deadline').server.outcome = 'OK'; }, 'DEADLINE_MISMATCH');
});

test('verify requires every expected call and proves what each one claims', () => {
  for (const id of ['watch-ok', 'chat-ok', 'watch-cancelled', 'watch-deadline', 'unknown-method', 'invalid-argument', 'message-too-large']) {
    rejects((copy) => { copy.calls = copy.calls.filter((item) => item.id !== id); }, 'EXPECTED_EVIDENCE_MISSING');
    rejects((copy) => {
      const donor = copy.calls.find((item) => item.id !== id && item.id !== 'chat-ok' && item.id !== 'watch-ok');
      Object.assign(call(copy, id), { result: donor.result, events: donor.events, server: donor.server });
    }, 'EXPECTED_EVIDENCE_MISSING');
  }
  const verdict = verifyWith(() => {});
  assert.deepEqual([verdict.verified, verdict.calls, verdict.messages, verdict.probes], [true, 7, 14, 3]);
});

test('verify requires the refused probes and refuses probes that were answered', () => {
  rejects((copy) => { copy.probes = copy.probes.filter((probe) => probe.id !== 'http1-request'); }, 'EXPECTED_EVIDENCE_MISSING');
  rejects((copy) => { copy.probes[0].refused = false; }, 'PROBE_NOT_REFUSED');
  rejects((copy) => { copy.probes[1].grpcStatusPresent = true; }, 'PROBE_NOT_REFUSED');
  rejects((copy) => { copy.probes.push(null, 'x'); copy.probes[2].refused = 'yes'; }, 'PROBE_NOT_REFUSED');
});

test('the page ships no inline script and its transcript script is the file that was measured', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]), ['<script defer src="page.js">']);
  assert.doesNotMatch(html, /\son[a-z]+=|javascript:/i);
  assert.match(pathToFileURL(path.join(root, 'page.js')).href, /^file:\/\/\/.*page\.js$/);
  const document = createDocument('<button id="a"></button><p id="b"></p>');
  assert.deepEqual([...document.elements.keys()], ['a', 'b']);
  assert.throws(() => document.element('missing'), /NO_SUCH_ELEMENT_IN_INDEX_HTML missing/);
});
