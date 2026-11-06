'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { startChild, pollState, readMem } = require('./child.cjs');

const startBody = (key) => ({ schemaVersion: 1, kind: 'start', key, ...s.attribution, expectedEpoch: 0 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a real process kill mid-action leaves a journal that tells the truth after restart', async (t) => {
  const made = s.scratch('k');
  t.after(() => made.remove());
  const first = startChild(t, { args: [`--dir=${made.dir}`, '--step-delay-ms=0', '--hold-in-step=3'] });
  const origin = await first.origin();
  const started = await h.post(origin, '/api/start', startBody('kill-start-0001'));
  assert.equal(started.status, 202);
  const actionId = started.json.action.actionId;
  await pollState(origin, (st) => st.journal.some((e) => e.type === 'step-intent' && e.step === 3), 'step 3 never began');
  const racing = h.post(origin, '/api/cancel', s.cancelCmd('kill-cancel-0001', actionId)).then((answer) => ({ answer }), (error) => ({ error }));
  await pollState(origin, (st) => st.action.cancel && st.action.cancel.key === 'kill-cancel-0001', 'the cancel was never journaled');
  const gone = await first.kill();
  assert.notEqual(gone.code, 0, 'the process was killed, not stopped');
  const lost = await racing;
  assert.ok(lost.error || lost.answer.status >= 500, 'the racing cancel was never answered with an outcome');

  const second = startChild(t, { args: [`--dir=${made.dir}`, '--step-delay-ms=0'] });
  const again = await second.origin();
  const state = (await h.get(again, '/api/state')).json;
  assert.equal(state.action.status, 'INTERRUPTED');
  assert.deepEqual(state.action.effectsStanding.map((e) => e.step), [1, 2]);
  assert.deepEqual(state.action.unknownSteps, [3]);
  assert.deepEqual(state.action.stepsNotRun, [4]);
  assert.equal(state.action.cancel.outcome, 'CANCEL_UNKNOWN');
  const replay = await h.post(again, '/api/cancel', s.cancelCmd('kill-cancel-0001', actionId));
  assert.equal(replay.status, 503);
  assert.equal(replay.json.outcome, 'CANCEL_UNKNOWN');
  assert.equal(replay.json.effective, false);
  const fresh = await h.post(again, '/api/cancel', s.cancelCmd('kill-cancel-0002', actionId));
  assert.equal(fresh.json.outcome, 'CANCEL_UNKNOWN');
  s.assertHonest(assert, replay.json, state.journal);
  const settled = await h.post(again, '/api/reconcile', s.reconcileCmd('kill-reconcile-01', actionId));
  assert.equal(settled.status, 200);
  assert.equal(settled.json.determination, 'CANCEL_UNKNOWN');
  assert.equal((await h.get(again, '/api/state')).json.action.status, 'RECONCILED');
  const next = await h.post(again, '/api/start', { ...startBody('kill-start-0002'), expectedEpoch: 1 });
  assert.equal(next.status, 202);
  await pollState(again, (st) => st.action.status === 'COMPLETED', 'the new epoch never completed');
  const stopped = await second.stop();
  assert.equal(stopped.code, 0);
});

test('a small-heap child stays bounded and responsive under floods, half-open and never-reading clients, and still stops promptly', async (t) => {
  const made = s.scratch('m');
  t.after(() => made.remove());
  const memFile = path.join(made.dir, 'mem.json');
  const kid = startChild(t, { nodeFlags: ['--max-old-space-size=48', '--expose-gc'], env: { C017_MEM_FILE: memFile }, args: [`--dir=${made.dir}`, '--step-delay-ms=0', '--hold-in-step=2'] });
  const origin = await kid.origin();
  const started = await h.post(origin, '/api/start', startBody('mem-start-0001'));
  const actionId = started.json.action.actionId;
  await pollState(origin, (st) => st.journal.some((e) => e.type === 'step-intent' && e.step === 2), 'step 2 never began');
  const host = `Host: ${new URL(origin).host}\r\n`;
  const body = JSON.stringify(s.cancelCmd('mem-cancel-0001', actionId));
  const silent = h.raw(origin, `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, { read: false });
  await pollState(origin, (st) => st.action.cancel && st.action.cancel.key === 'mem-cancel-0001', 'the never-reading cancel was not journaled');
  await sleep(400);
  const before = readMem(memFile);
  assert.ok(before, 'the child heap sampler wrote nothing');

  const burst = async (count, make) => { for (let i = 0; i < count; i += 40) await Promise.all(Array.from({ length: Math.min(40, count - i) }, make)); };
  const quiet = (promise) => promise.catch(() => null);
  await burst(240, () => quiet(h.request(origin, { method: 'POST', path: '/api/cancel', headers: h.jsonHeaders, body: 'x'.repeat(5000) })));
  await burst(240, () => quiet(h.post(origin, '/api/cancel', '{"bad":')));
  await burst(200, () => quiet(h.request(origin, { method: 'POST', path: '/api/cancel', headers: h.jsonHeaders, body: '' })));
  await burst(240, () => quiet(h.get(origin, '/api/state')));
  await burst(80, () => quiet(h.request(origin, { path: '/api/state', headers: { 'X-Big': 'z'.repeat(12000) } })));
  const tiny = `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${'1\r\na\r\n'.repeat(3000)}0\r\n\r\n`;
  const crowd = [...Array.from({ length: 40 }, () => h.raw(origin, tiny, { read: false })), ...Array.from({ length: 90 }, () => h.raw(origin, `GET /api/state HTTP/1.1\r\n${host}X-Partial: `, { read: false }))];
  await sleep(600);
  const after = readMem(memFile);
  assert.ok(after.heapUsed < before.heapUsed + 24 * 1024 * 1024, `heap grew from ${before.heapUsed} to ${after.heapUsed}`);
  assert.ok(after.rss < before.rss + 160 * 1024 * 1024, `rss grew from ${before.rss} to ${after.rss}`);
  crowd.forEach((client) => client.socket.destroy());
  await sleep(200);
  assert.equal((await h.get(origin, '/api/state')).status, 200, 'the child stopped answering');

  const stuck = [...Array.from({ length: 30 }, () => h.raw(origin, '', { read: false })), ...Array.from({ length: 10 }, () => h.raw(origin, `GET /api/state HTTP/1.1\r\n${host}X-Partial: `))];
  const stopped = await kid.stop();
  assert.equal(stopped.code, 0, `the child must exit cleanly: ${kid.errors()}`);
  assert.ok(kid.lines.some((e) => e.event === 'C017-local-closed' && e.listening === false));
  [silent, ...stuck].forEach((client) => client.socket.destroy());
});
