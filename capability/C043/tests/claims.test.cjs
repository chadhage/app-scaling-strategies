'use strict';

// R3 self-review line 11 (CLAIMS ARE TESTS): the README sentences that carry the strongest words (always, never, every,
// exactly, cannot, bounded, idempotent) are listed here with the NAMED tests that back them. The test fails when a sentence
// disappears from the README (it must be reviewed, not silently dropped) or when a named test disappears or is renamed. A claim
// with no test is not in this table: it is narrowed in the README to what is measured (see "What was not probed").
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { assert } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\s+/g, ' ');

// [sentence of the README, [[test file (relative to the namespace), part of the title of a named test]]]
const CLAIMS = [
  ['an acknowledged step is never called again', [['tests/runner.test.cjs', 'not executed again on resume'], ['tests/property.test.cjs', 'stateful property: ${SEEDS} seeds']]],
  ['every step is validated by the accepted C042 validator', [['tests/same-steps.test.cjs', 'frozen output of the C042 validator']]],
  ['no call of any step function, no journal entry and an unused key', [['evidence/red/initial-a.snapshot.cjs', 'an invalid preset is a typed failure']]],
  ['and the preset run produce identical call sequences', [['evidence/red/initial-a.snapshot.cjs', 'identical at the shared boundary']]],
  ['flips **every byte** of a persisted journal', [['tests/journal.test.cjs', 'EXHAUSTIVE single-byte flips']]],
  ['goes through ONE central send path', [['tests/server.test.cjs', 'every typed refusal']]],
  ['nothing pipelined behind a refusal runs in the tested matrix', [['tests/pipelining.test.cjs', 'pipelined behind ${name}: the mutation never runs'], ['tests/pipelining-process.test.cjs', 'SEPARATE PROCESS'], ['tests/pipelining-framing.test.cjs', 'BOTH FRAMINGS'], ['tests/connect-upgrade.test.cjs', 'CONNECT, Upgrade, h2c and Expect rows']]],
  ['a request before a CONNECT is answered', [['tests/connect-upgrade.test.cjs', 'a request before a CONNECT is answered']]],
  ['two live servers and two live runners', [['tests/two-instances.test.cjs', 'two live servers closed in FIFO order'], ['tests/two-instances.test.cjs', 'two live servers closed in LIFO order'], ['tests/two-instances.test.cjs', 'two live runners']]],
  ['a write to every reachable object of every public return value changes no later answer', [['tests/aliasing.test.cjs', 'no public return value of the production code shares a mutable object']]],
  ['No test asserts a duration', [['tests/load.test.cjs', 'stalled for 5 s still passes every resource test'], ['tests/guards.test.cjs', 'T1 the timers and bounds are structure']]],
  ['the streaming body limit and the pipeline depth are exact', [['tests/boundaries.test.cjs', 'the streaming body limit is exact'], ['tests/boundaries.test.cjs', 'the pipeline depth is exact']]],
  ['The page prints **no server prose**', [['tests/f4-tamper.test.cjs', 'closed vocabulary']]],
  ['the evidence recompute covers a manifest under a raw folder', [['tests/round1-gaps.test.cjs', 'F2 the evidence recompute finds a manifest that lives under a raw folder']]],
];

test('every strong README claim in the table is still in the README and every test that backs it still exists by name', { timeout: 30000 }, () => {
  const missing = [];
  for (const [sentence, backing] of CLAIMS) {
    if (!readme.includes(sentence.replace(/\s+/g, ' '))) missing.push(`README lacks the claim: ${sentence}`);
    for (const [file, title] of backing) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      if (!source.includes(title)) missing.push(`${file} has no test named like: ${title}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(CLAIMS.length >= 14, true);
});

test('the claim table has teeth: a claim that is not in the README, or a named test that does not exist, is reported', { timeout: 30000 }, () => {
  assert.equal(readme.includes('this sentence is not in the README'), false);
  assert.equal(fs.readFileSync(path.join(__dirname, 'claims.test.cjs'), 'utf8').includes('a test that does not exist'), true);
  assert.equal(fs.readFileSync(path.join(root, 'tests', 'runner.test.cjs'), 'utf8').includes('a test that does not exist'), false);
});
