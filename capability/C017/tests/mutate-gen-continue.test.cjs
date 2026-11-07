'use strict';

// F28 of the fourth review: the generator used to stop at the FIRST test file that was cut, so a mutant that leaves a listener open (G083: closeOwned never
// closes the server, the process of server-guards.test.cjs never ends) stayed UNDECIDED although two-servers.test.cjs kills it by name, and the evidence of
// the third fix could never be complete. decide() runs the files one after the other through an injected runner (a FAKE runner here: no process, no clock):
// a file that fails by name kills the mutant and stops the run, a file that is cut decides nothing and the next one is tried, UNDECIDED means that nothing
// killed the mutant and something was cut, and a cut is never counted as a kill (controller rule 13).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./mutate-gen.cjs');

const FILES = ['a.test.cjs', 'b.test.cjs', 'c.test.cjs', 'd.test.cjs'];
const PASS = { code: 0, failing: [] };
const CUT = { code: null, failing: [] };
const FILE_ONLY = (file) => ({ code: 1, failing: [`capability\\C017\\tests\\${file}`] });
const KILL = (name) => ({ code: 1, failing: [name] });

function fake(script) {
  const asked = [];
  return { asked, run: async (file) => { asked.push(file); return script[file] || PASS; } };
}

test('a file that is cut (hard kill) decides nothing: the next file that fails by name kills the mutant, and the files after it are not run', async () => {
  const runner = fake({ 'a.test.cjs': CUT, 'b.test.cjs': KILL('two live servers in one process'), 'c.test.cjs': KILL('never reached') });
  const verdict = await G.decide(FILES, runner.run);
  assert.equal(verdict.killed, true);
  assert.equal(verdict.undecided, undefined);
  assert.equal(verdict.killedBy, 'b.test.cjs');
  assert.deepEqual(verdict.failingTests, ['two live servers in one process']);
  assert.deepEqual(verdict.cutBefore, ['a.test.cjs'], 'the cut file is recorded, never hidden');
  assert.deepEqual(runner.asked, ['a.test.cjs', 'b.test.cjs']);
});

test('a file that only reports itself as failing (no test name) is a cut as well, and a later file may still kill the mutant', async () => {
  const runner = fake({ 'a.test.cjs': FILE_ONLY('a.test.cjs'), 'c.test.cjs': KILL('resources: shutdown never hangs') });
  const verdict = await G.decide(FILES, runner.run);
  assert.equal(verdict.killed, true);
  assert.equal(verdict.killedBy, 'c.test.cjs');
  assert.deepEqual(verdict.cutBefore, ['a.test.cjs']);
  assert.deepEqual(runner.asked, ['a.test.cjs', 'b.test.cjs', 'c.test.cjs']);
});

test('UNDECIDED only when nothing killed the mutant and at least one file was cut: it is never counted as killed and names every cut file', async () => {
  const runner = fake({ 'a.test.cjs': CUT, 'c.test.cjs': FILE_ONLY('c.test.cjs') });
  const verdict = await G.decide(FILES, runner.run);
  assert.equal(verdict.killed, null);
  assert.equal(verdict.undecided, true);
  assert.deepEqual(verdict.cut, ['a.test.cjs', 'c.test.cjs']);
  assert.match(verdict.killedBy, /a\.test\.cjs, c\.test\.cjs \(cut, no named failing test, and no other file killed it\)/);
  assert.deepEqual(runner.asked, FILES, 'every file was tried before the verdict');
});

test('a mutant that every file passes SURVIVED, and one that the first file kills is decided at once', async () => {
  const survived = await G.decide(FILES, fake({}).run);
  assert.deepEqual([survived.killed, survived.killedBy, survived.exit], [false, null, 0]);
  const runner = fake({ 'a.test.cjs': KILL('the first file kills it') });
  const killed = await G.decide(FILES, runner.run);
  assert.deepEqual([killed.killed, killed.killedBy], [true, 'a.test.cjs']);
  assert.equal(killed.cutBefore, undefined);
  assert.deepEqual(runner.asked, ['a.test.cjs']);
});

test('the real runs end a file whose tests all finished although a listener stays open (--test-force-exit), so that a mutant cannot hang its first file', () => {
  const args = G.testArgs(['x.test.cjs']);
  assert.ok(args.includes('--test-force-exit'));
  assert.ok(args.includes('--test'));
  assert.ok(args.includes('--test-concurrency=1'));
  assert.ok(args.some((arg) => /^--test-timeout=\d+$/.test(arg)), 'the node:test timeout stays as the only clock for a mutant that really hangs a test');
  assert.equal(args[args.length - 1], 'x.test.cjs');
});
