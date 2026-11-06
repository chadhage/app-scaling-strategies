'use strict';

// rev-C043 fixes, second tier: what the first tests of F1, F3 and F4 did not pin down. An effect that the step service
// holds differently, an OPEN run that is contradicted (resume and cancel must not drive it), the typed problem names of
// a tampered answer, and the page showing a contradicted run from facts (DOM stub).
const test = require('node:test');
const { validateResultEnvelope } = require('../envelope.js');
const { createDocument, networkFetch, runPage } = require('./dom-stub.cjs');
const { composeService } = require('../server.cjs');
const {
  assert, boot, clock, committed, createMemoryIo, doc, flaky, openEngine, openRunner, startService,
} = require('./support.cjs');

const CODE = 'PRESET_STEP_SERVICE_DISAGREES';
const KEY = 'preset-run-0001';
const body = (value) => Buffer.from(JSON.stringify(value));
const kept = (text, count) => text.split('\n').filter(Boolean).slice(0, count).map((line) => `${line}\n`).join('');
const memory = (text) => { const io = createMemoryIo(); io.append(text); return io; };
const failOn = (needle) => (text) => (text.includes(needle) ? 'lost' : false);

test('F3 an effect that the step service holds differently (another reservation came first) is not confirmed either: the per-step layer of the production composition', { timeout: 60000 }, async () => {
  const original = await boot();
  await original.runner.run(body(doc()));
  const other = await boot();
  await other.real.submit({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'manual-first-0001', leaseId: 'synthetic-lease-001', units: 5 });
  await other.runner.run(body(doc()));
  assert.equal(committed(other.real), 20);
  const ledgerOnly = await boot({ stepIo: memory(other.stepIo.read()), runIo: memory(original.runIo.read()) });
  assert.equal(ledgerOnly.runner.inspect(KEY).body.run.state, 'completed', 'the ledger layer alone cannot see it: the total (20) is not below any acknowledged reserved-after');
  const { runner } = await composeService({ stepIo: memory(other.stepIo.read()), runIo: memory(original.runIo.read()) });
  const answer = runner.inspect(KEY);
  assert.deepEqual([answer.body.error.code, answer.body.steps[0].status, answer.body.steps[0].code, answer.body.effects.length], [CODE, 'unknown', 'IDEMPOTENCY_KEY_CONFLICT', 0]);
  assert.equal(validateResultEnvelope(answer.body).ok, true);
});

test('F3 an OPEN run (no end record) whose acknowledged step is unconfirmed is not driven by resume or cancel', { timeout: 60000 }, async () => {
  const stepIo = createMemoryIo();
  const runIo = createMemoryIo();
  const lost = await boot({ stepIo, runIo: flaky(runIo, failOn('"type":"end"')) });
  assert.equal((await lost.runner.run(body(doc()))).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
  const stepText = stepIo.read();
  const runText = runIo.read();
  const intact = await boot({ stepIo: memory(stepText), runIo: memory(runText) });
  assert.deepEqual(intact.runner.inspect(KEY).body.recovery.allowed, ['resume', 'inspect'], 'control: an open run with confirmed steps offers resume');
  const world = await boot({ stepIo: memory(kept(stepText, 5)), runIo: memory(runText) });
  const inspected = world.runner.inspect(KEY);
  assert.deepEqual([inspected.body.run.state, inspected.body.error.code, inspected.body.steps.map((step) => step.status)], ['stopped', CODE, ['succeeded', 'succeeded', 'unknown']]);
  for (const action of ['resume', 'cancel']) {
    const answer = await world.runner[action](KEY);
    assert.deepEqual([answer.status, answer.body.error.code, answer.body.accepted], [503, CODE, false], action);
  }
  assert.equal(world.runIo.read(), runText, 'nothing was written to the preset journal');
  assert.equal(world.log.some((call) => call.method !== 'inspect'), false, 'the step service was only asked');
});

test('F3 an OPEN run that stopped part-way (steps left to do) with an unconfirmed acknowledged step is not cancelled either: no cancel record is written', { timeout: 60000 }, async () => {
  const stepIo = createMemoryIo();
  const runIo = createMemoryIo();
  const lost = await boot({ stepIo, runIo: flaky(runIo, failOn('"index":3')) });
  assert.equal((await lost.runner.run(body(doc()))).body.error.code, 'RUN_JOURNAL_UNCERTAIN');
  const stepText = stepIo.read();
  const runText = runIo.read();
  assert.equal(stepText.split('\n').filter(Boolean).length, 4, 'control: two steps were taken before the journal of the run lost the start of the third');
  const intact = await boot({ stepIo: memory(stepText), runIo: memory(runText) });
  assert.deepEqual(intact.runner.inspect(KEY).body.recovery.allowed, ['resume', 'cancel', 'inspect'], 'control: with confirmed steps an open run that is not finished offers resume and cancel');
  const world = await boot({ stepIo: memory(kept(stepText, 3)), runIo: memory(runText) });
  assert.deepEqual([world.runner.inspect(KEY).body.run.state, world.runner.inspect(KEY).body.error.code], ['stopped', CODE]);
  const answer = await world.runner.cancel(KEY);
  assert.deepEqual([answer.status, answer.body.error.code, answer.body.accepted], [503, CODE, false]);
  assert.equal(world.runIo.read(), runText, 'nothing was written to the preset journal');
  assert.equal(world.log.some((call) => call.method !== 'inspect'), false, 'the step service was only asked');
});

test('F3 a run driven in this process is answered from its own step answers: the ledger is not read for it, and is read for a later inspect', { timeout: 60000 }, async () => {
  const real = await openEngine({ io: createMemoryIo() });
  let reads = 0;
  const engine = new Proxy(real, {
    get(target, name) {
      const value = Reflect.get(target, name, target);
      if (name === 'leases') return (...args) => { reads += 1; return value.apply(target, args); };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const runner = await openRunner({ engine, io: createMemoryIo(), clock: clock().now });
  assert.equal((await runner.run(body(doc()))).body.run.state, 'completed');
  assert.equal(reads, 0, 'the answer of a fresh run is built from the step answers it just received');
  assert.equal(runner.inspect(KEY).body.run.state, 'completed');
  assert.equal(reads > 0, true, 'control: an answer for a run that is not driven here does read the ledger');
});

test('F4 the typed problem names the rule that failed: STEPS for a null step or an inherited status, USAGE for a null usage', { timeout: 60000 }, async () => {
  const world = await boot();
  const answer = (await world.runner.run(body(doc()))).body;
  const verdict = (change) => { const forged = JSON.parse(JSON.stringify(answer)); change(forged); return validateResultEnvelope(forged); };
  for (const change of [(b) => { b.steps[1] = null; }, (b) => { b.steps[0].status = '__proto__'; }, (b) => { b.steps[0].status = 'constructor'; }]) {
    assert.deepEqual(verdict(change).problems.includes('STEPS'), true);
  }
  const usage = verdict((b) => { b.usage = null; });
  assert.deepEqual([usage.ok, usage.problems.includes('USAGE'), usage.problems.includes('MALFORMED')], [false, true, false]);
  assert.deepEqual(verdict(() => {}).ok, true);
  const hostile = validateResultEnvelope(new Proxy({}, { ownKeys() { throw new Error('hostile'); } }));
  assert.deepEqual([hostile.ok, hostile.problems], [false, ['MALFORMED']]);
  const tail = verdict((b) => { b.stepJournalDiscardedTailBytes = -1; });
  assert.deepEqual([tail.ok, tail.problems.includes('STEP_JOURNAL_TAIL')], [false, true]);
});

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  for (let turn = 0; turn < 500; turn += 1) { if (await check()) return; await wait(); }
  return assert.fail(`never held: ${label}`);
}

test('F3 the page shows a contradicted run from facts: NOT CONFIRMED, the confirmed effects, the discarded tail and only the controls that work (DOM stub)', { timeout: 120000 }, async () => {
  const seeded = await boot();
  await seeded.runner.run(body(doc()));
  const stepText = seeded.stepIo.read();
  const service = await startService({ stepIo: memory(`${kept(stepText, 5)}{"seq":6,"prev":"torn`), runIo: memory(seeded.runIo.read()) });
  try {
    const { document } = runPage({ fetch: networkFetch(service.port), document: createDocument() });
    await until(() => /declared presets loaded|REJECTED/.test(document.element('catalog-status').textContent), 'catalog');
    document.element('key').value = KEY;
    await document.element('inspect').dispatch('click');
    const status = document.element('status').textContent;
    assert.match(status, /^NOT CONFIRMED — the step service does not confirm step 3 of 3 \(STEP_INTERRUPTED\); 2 effect\(s\) stand \(10 units\); nothing was undone\.$/);
    const rows = document.element('result').children.filter((child) => child.tagName === 'dd').map((child) => child.textContent);
    assert.equal(rows.at(-1), String('{"seq":6,"prev":"torn'.length), 'the discarded step-journal tail is shown');
    assert.deepEqual(document.element('recovery').labels(), ['Correct and resubmit', 'Inspect the preset'], 'only executable controls are drawn');
    assert.equal(document.element('listing-effects').children.length, 2);
    assert.equal(document.element('listing-notrun').children.length, 0, 'the unconfirmed step is not claimed to be unrun');
  } finally {
    await service.stop();
  }
});
