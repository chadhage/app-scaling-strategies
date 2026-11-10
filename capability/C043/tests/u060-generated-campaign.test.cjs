'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { generate, judgeEquivalence } = require('./mutgen.cjs');
const table = require('./u060-generated-equivalence.json');

const trace = { family: 'fixture', observed: [{ status: 200 }], state: { stepJournal: '' } };
const outcome = (value = trace, applied = false) => ({
  code: 0, signal: null, error: null, timedOut: false, streamsClosed: true, cleanup: { clean: true },
  output: `${applied ? '# U060_MUTANT_APPLIED server.cjs\n' : ''}# U060_EQ_TRACE_BASE64 fixture ${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}\n`
    + '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
});

test('U060 generated campaign preserves every compiling whole-server position and binds every equivalence replacement', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  const plan = generate(source);
  assert.equal(plan.generated, 278);
  assert.equal(plan.mutants.length, 269);
  assert.equal(plan.sha256, table.sourceSha256);
  assert.equal(new Set(plan.mutants.map(({ id }) => id)).size, 269);
  assert.equal(new Set(table.proofs.map(({ id }) => id)).size, table.proofs.length);
  for (const proof of table.proofs) {
    const mutant = plan.mutants.find(({ id }) => id === proof.id);
    assert.ok(mutant, proof.id);
    assert.deepEqual([mutant.from, mutant.to], [proof.from, proof.to], proof.id);
    assert.ok(proof.reason.length > 40);
  }
});

test('U060 generated equivalence needs matching positive original/mutated traces, never a reasoning string', () => {
  const result = judgeEquivalence(outcome(), outcome(trace, true), 'fixture');
  assert.equal(result.decided, true);
  assert.match(result.traceSha256, /^[0-9a-f]{64}$/);
  const escaped = { ...trace, state: { stepJournal: '{"quoted":"back\\\\slash"}\n# literal TAP text\n' } };
  assert.equal(judgeEquivalence(outcome(escaped), outcome(escaped, true), 'fixture').decided, true);
  for (const changed of [
    { ...outcome(trace, true), timedOut: true },
    { ...outcome(trace, true), signal: 'SIGKILL' },
    { ...outcome(trace, true), streamsClosed: false },
    { ...outcome(trace, true), cleanup: { clean: false } },
    { ...outcome(trace, true), code: 1 },
    outcome(trace, false),
    outcome({ ...trace, observed: [] }, true),
    outcome({ ...trace, observed: [{ status: 500 }] }, true),
    { ...outcome(trace, true), output: outcome(trace, true).output.replace('# pass 1', '# pass 0') },
    { ...outcome(trace, true), output: outcome(trace, true).output.replace('# cancelled 0', '# cancelled 1') },
    { ...outcome(trace, true), output: outcome(trace, true).output.replace('# skipped 0', '# skipped 1') },
    { ...outcome(trace, true), output: outcome(trace, true).output.replace('# U060_EQ_TRACE_BASE64 fixture ', '# unrelated ') },
    { ...outcome(trace, true), output: outcome(trace, true).output.replace(/(U060_EQ_TRACE_BASE64 fixture )[^\n]+/, '$1not*base64') },
  ]) assert.equal(judgeEquivalence(outcome(), changed, 'fixture').decided, false);
  assert.equal(judgeEquivalence({ ...outcome(), timedOut: true }, outcome(trace, true), 'fixture').decided, false);
});
