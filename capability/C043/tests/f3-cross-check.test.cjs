'use strict';

// rev-C043 F3: the system of record of every effect is the step service. An acknowledged step that it does not confirm
// is never trusted: the preset answers the typed refusal PRESET_STEP_SERVICE_DISAGREES with the honest listing (which
// steps are confirmed, which are not, which effects stand), never COMPLETED, on every inspect, run again, resume and
// cancel, and it reports the step journal's discarded tail. The damage is the inherited C042 one: a step journal that
// lost its tail (a flipped final newline, a cut at a record boundary) while the preset journal kept its acknowledgements.
const test = require('node:test');
const { validateResultEnvelope } = require('../envelope.js');
const { checkAnswer } = require('../verify.js');
const {
  assert, boot, committed, createMemoryIo, doc, methods, step,
} = require('./support.cjs');

const CODE = 'PRESET_STEP_SERVICE_DISAGREES';
const body = (value) => Buffer.from(JSON.stringify(value));
const records = (text) => text.split('\n').filter(Boolean).map((line) => `${line}\n`);
const kept = (text, count) => records(text).slice(0, count).join('');
const flipped = (text) => `${text.slice(0, -1)}X`;
const memory = (text) => { const io = createMemoryIo(); io.append(text); return io; };

// A completed three-step preset (6 step-journal records: begin and commit per step), then a restart over damaged journals.
async function completed(extra = {}) {
  const stepIo = createMemoryIo();
  const runIo = createMemoryIo();
  const world = await boot({ stepIo, runIo });
  const answer = await world.runner.run(body(doc(extra)));
  assert.equal(answer.status, 201);
  return { stepText: stepIo.read(), runText: runIo.read() };
}
const restart = (stepText, runText) => boot({ stepIo: memory(stepText), runIo: memory(runText) });

const DAMAGES = [
  ['the last commit is cut at a record boundary', (text) => kept(text, 5), 2, 'STEP_INTERRUPTED'],
  ['the final newline is flipped', flipped, 2, 'STEP_INTERRUPTED'],
  ['the last step lost its begin and its commit', (text) => kept(text, 4), 2, 'STEP_NOT_FOUND'],
  ['the journal kept only the first step and the begin of the second', (text) => kept(text, 3), 1, 'STEP_INTERRUPTED'],
  ['the step journal is empty', () => '', 0, 'STEP_NOT_FOUND'],
];

for (const [damage, change, confirmed, stepCode] of DAMAGES) {
  test(`${damage}: every answer about the run says so and none says COMPLETED`, { timeout: 60000 }, async () => {
    const { stepText, runText } = await completed();
    const world = await restart(change(stepText), runText);
    const listing = (answer) => {
      assert.equal(validateResultEnvelope(answer.body).ok, true, JSON.stringify(validateResultEnvelope(answer.body).problems));
      assert.equal(checkAnswer(answer.status, answer.body, undefined).ok, true);
      assert.notEqual(answer.body.run.state, 'completed');
      assert.notEqual(answer.body.outcome, 'succeeded');
      assert.equal(answer.body.error.code, CODE);
      assert.deepEqual(answer.body.steps.map((entry) => entry.status), ['succeeded', 'succeeded', 'succeeded'].map((status, index) => (index < confirmed ? status : index === confirmed ? 'unknown' : 'not-run')));
      assert.equal(answer.body.steps[confirmed].code, stepCode, 'the unconfirmed step carries the answer of the step service');
      assert.deepEqual(answer.body.effects.map((effect) => effect.index), [1, 2, 3].slice(0, confirmed), 'only the confirmed effects stand');
      assert.equal(answer.body.usage.units, committed(world.real), 'the listed effects are exactly what the ledger holds');
      assert.equal(answer.body.didNot.some((item) => item.code === 'NOT_CONFIRMED'), true);
      assert.deepEqual(answer.body.recovery.allowed, ['correct-and-resubmit', 'inspect'], 'only controls that are really executable');
      return answer;
    };
    const inspected = listing(world.runner.inspect('preset-run-0001'));
    assert.equal(inspected.status, 200, 'the read itself succeeded');
    assert.equal(inspected.body.run.state, 'stopped');
    for (const [label, ask] of [['run again with the same key', () => world.runner.run(body(doc()))], ['resume', () => world.runner.resume('preset-run-0001')], ['cancel', () => world.runner.cancel('preset-run-0001')]]) {
      const answer = listing(await ask());
      assert.deepEqual([answer.status, answer.body.accepted, answer.body.replayed], [503, false, label === 'run again with the same key'], label);
    }
    assert.equal(world.log.some((call) => call.method === 'submit'), false, 'nothing was submitted to the step service while it disagreed');
    assert.equal(world.runIo.read(), runText, 'the preset journal was not written');
    assert.equal(world.stepIo.read(), change(stepText).slice(0, world.stepIo.read().length), 'the step journal was not extended');
    assert.equal(world.runner.health().unconfirmedRuns, 1, 'the journal health names the unconfirmed run');
  });
}

test('exhaustive: a step journal cut after any number of records is COMPLETED only when every commit is still there', { timeout: 60000 }, async () => {
  const { stepText, runText } = await completed();
  for (let count = 0; count <= 6; count += 1) {
    const world = await restart(kept(stepText, count), runText);
    const answer = world.runner.inspect('preset-run-0001');
    const confirmed = Math.floor(count / 2);
    assert.equal(answer.body.run.state === 'completed', count === 6, `${count} records kept`);
    assert.equal(answer.body.effects.length, confirmed);
    assert.equal(answer.body.usage.units, committed(world.real));
    assert.equal(world.runner.health().unconfirmedRuns, count === 6 ? 0 : 1);
  }
});

test('no false positive: intact journals restart COMPLETED, and a run in this process never asks the step service again', { timeout: 60000 }, async () => {
  const { stepText, runText } = await completed();
  const world = await restart(stepText, runText);
  const answer = world.runner.inspect('preset-run-0001');
  assert.deepEqual([answer.status, answer.body.run.state, answer.body.error, answer.body.effects.length], [200, 'completed', null, 3]);
  assert.equal(answer.body.stepJournalDiscardedTailBytes, 0);
  const fresh = await boot();
  await fresh.runner.run(body(doc()));
  assert.deepEqual(methods(fresh.log), ['submit', 'submit', 'submit'], 'the answer of a fresh run is built from the step answers it just received');
});

test('the discarded step-journal tail is exposed in the inspect view, and a request without a run reports none', { timeout: 60000 }, async () => {
  const { stepText, runText } = await completed();
  const torn = await restart(flipped(stepText), runText);
  assert.equal(torn.real.tornTailBytes > 0, true);
  assert.equal(torn.runner.inspect('preset-run-0001').body.stepJournalDiscardedTailBytes, torn.real.tornTailBytes);
  const clean = await restart(kept(stepText, 5), runText);
  assert.equal(clean.runner.inspect('preset-run-0001').body.stepJournalDiscardedTailBytes, 0, 'a cut at a record boundary discards nothing: only the unconfirmed step shows it');
  const missing = clean.runner.inspect('abcdefgh');
  assert.deepEqual([missing.body.error.code, missing.body.stepJournalDiscardedTailBytes], ['RUN_NOT_FOUND', null]);
});

test('the controls the answer offers are executable: a new key replays the confirmed steps, resume finishes the rest and the old run is confirmed again', { timeout: 60000 }, async () => {
  for (const keep of [5, 4]) {
    const { stepText, runText } = await completed();
    const world = await restart(kept(stepText, keep), runText);
    assert.equal(world.runner.inspect('preset-run-0001').body.error.code, CODE);
    const retry = doc({ idempotencyKey: 'preset-run-0002' });
    let answer = await world.runner.run(body(retry));
    if (answer.body.run.state === 'interrupted') answer = await world.runner.resume('preset-run-0002');
    assert.deepEqual([answer.body.accepted, answer.body.run.state, answer.body.effects.length], [true, 'completed', 3], `kept ${keep}`);
    assert.equal(committed(world.real), 15, 'one effect per step, none twice');
    const old = world.runner.inspect('preset-run-0001');
    assert.deepEqual([old.body.run.state, old.body.error], ['completed', null], 'the step service confirms the old acknowledgements again');
  }
});

test('a conflicting key and an unsupported action keep their own refusal while the listing stays honest', { timeout: 60000 }, async () => {
  const { stepText, runText } = await completed();
  const world = await restart(kept(stepText, 5), runText);
  const conflict = await world.runner.run(body(doc({ steps: [step(1), step(2, { units: 6 }), step(3)] })));
  assert.deepEqual([conflict.status, conflict.body.error.code, conflict.body.steps[2].status], [409, 'IDEMPOTENCY_KEY_CONFLICT', 'unknown']);
  const unsupported = world.runner.unsupportedAction('preset-run-0001');
  assert.deepEqual([unsupported.status, unsupported.body.error.code, unsupported.body.steps[2].status], [422, 'UNSUPPORTED_ACTION', 'unknown']);
  for (const answer of [conflict, unsupported]) assert.equal(validateResultEnvelope(answer.body).ok, true, JSON.stringify(validateResultEnvelope(answer.body).problems));
});
