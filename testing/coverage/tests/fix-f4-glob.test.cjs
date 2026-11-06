'use strict';

// F4 of the first independent review of U009: the glob matcher was a backtracking RegExp, so a long file name against a pattern with several stars froze
// the enumeration for hours. N1 of the second review: the first test of the fix measured seconds on the wall clock in freshly started node processes,
// which is flaky by design on a loaded machine. Nothing here measures time. The linear matcher reports its STEPS (glob.cjs measure) and the tests bound
// them structurally; a naive backtracking matcher that counts its calls is the control in the same test (a ratio of counts, never of seconds).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeScratch, dispose, writeTree } = require('./support.cjs');
const { runGateCli, relativeToRepository } = require('./clisupport.cjs');
const { compileGlob, matchesGlob } = require('../glob.cjs');
const { naiveMatch } = require('./naive-glob.cjs');

// One closure of the token table before the first character, then one scan and one closure per character: tokens x (1 + 2 x characters) at most.
const stepBound = (tokens, characters) => tokens * (1 + 2 * characters);
const BUDGET = 1000000;

// The patterns and names of the reviewer's reproduction (with the backtracking RegExp these took 10 seconds and more, then hours) and two long names.
// The last field says whether the naive control is run as well: for the two long names the linear steps alone are about a million, the size of its budget.
const hostile = [
  ['stars against a run of a (60 characters)', `${'*a'.repeat(10)}*b.cjs`, `${'a'.repeat(60)}.cjs`, false, true],
  ['stars against a run of a, matching', `${'*a'.repeat(10)}*.cjs`, `${'a'.repeat(60)}.cjs`, true, false],
  ['globstar segments against 44 folders', `${'**/'.repeat(8)}x.cjs`, `${'a/'.repeat(44)}q.cjs`, false, true],
  ['globstar segments against 44 folders, matching', `${'**/'.repeat(8)}q.cjs`, `${'a/'.repeat(44)}q.cjs`, true, false],
  ['double stars inside a segment', `${'**a'.repeat(9)}**b.cjs`, `${'a'.repeat(40)}.cjs`, false, true],
  ['stars against a name of 20,000 characters', `${'*a'.repeat(10)}*b.cjs`, `${'a'.repeat(20000)}.cjs`, false, false],
  ['twenty globstar segments against 5,000 folders', `${'**/'.repeat(20)}x.cjs`, `${'a/'.repeat(5000)}q.cjs`, false, false]
];

for (const [label, pattern, input, expected, explodes] of hostile) {
  test(`the work is linear in tokens times characters: ${label}`, () => {
    const matcher = compileGlob(pattern);
    assert.equal(typeof matcher.measure, 'function', 'the matcher reports its steps through measure(path)');
    const outcome = matcher.measure(input);
    assert.equal(outcome.matched, expected);
    assert.equal(outcome.matched, matcher.test(input), 'measure and test give the same answer');
    assert.equal(outcome.steps <= stepBound(outcome.tokens, input.length), true, `${outcome.steps} steps for ${outcome.tokens} tokens and ${input.length} characters`);
    if (explodes) {
      const control = naiveMatch(pattern, input, BUDGET);
      assert.equal(control.exhausted, true, `the naive matcher is still going after ${BUDGET} calls`);
      assert.equal(control.calls >= 100 * outcome.steps, true, `the control needs at least 100 times the steps: ${control.calls} calls against ${outcome.steps} steps`);
    }
  });
}

test('the naive cost grows polynomially with the name while the linear steps grow in proportion to it', () => {
  const run = (size) => {
    const pattern = `${'*a'.repeat(4)}*b.cjs`;
    const input = `${'a'.repeat(size)}.cjs`;
    return { naive: naiveMatch(pattern, input, 50 * BUDGET).calls, linear: compileGlob(pattern).measure(input).steps };
  };
  const small = run(8);
  const large = run(24);
  assert.equal(large.naive / small.naive > 20, true, `naive calls ${small.naive} then ${large.naive}`);
  assert.equal(large.linear / small.linear < 3, true, `linear steps ${small.linear} then ${large.linear}`);
});

test('the step count is exact on small cases, and a matcher with no live state stops reading', () => {
  const steps = (pattern, input) => compileGlob(pattern).measure(input);
  assert.deepEqual(steps('a', 'a'), { matched: true, steps: 3, tokens: 1, consumed: 1 });
  assert.deepEqual(steps('a', 'b'), { matched: false, steps: 2, tokens: 1, consumed: 1 });
  assert.deepEqual(steps('a', ''), { matched: false, steps: 1, tokens: 1, consumed: 0 });
  assert.deepEqual(steps('*', 'xyz'), { matched: true, steps: 7, tokens: 1, consumed: 3 });
  assert.deepEqual(steps('ab', 'abc'), { matched: false, steps: 12, tokens: 2, consumed: 3 });
  const early = steps('a', `b${'x'.repeat(100000)}`);
  assert.deepEqual([early.matched, early.steps, early.consumed], [false, 2, 1], 'a name that dies at its first character costs two steps, however long it is');
  const late = steps('*.cjs', `${'a'.repeat(1000)}.mjs`);
  assert.equal(late.matched, false);
  assert.equal(late.steps, stepBound(5, 1004), 'a long name that never dies is bounded and costs exactly tokens x (1 + 2 x characters)');
});

// The semantics of the old translation for ordinary patterns, kept here verbatim as the reference of a differential test.
function legacyRegExp(text) {
  let source = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '*') {
      if (text[index + 1] === '*') {
        if (text[index + 2] === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[.+^$|]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

test('ordinary patterns keep the semantics of the old translation, the naive control agrees, and the steps stay bounded (seeded differential test)', () => {
  let seed = 20260605;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const pieces = ['a', 'b', 'ab', '.', '/', '*', '**', '**/', '?', 'x/', '.cjs', 'a*', '*/'];
  const letters = ['a', 'b', '.', '/', 'c', 'x', 'j'];
  let checked = 0;
  let matched = 0;
  for (let round = 0; round < 6000; round += 1) {
    let pattern = '';
    for (let count = 1 + random(5); count > 0; count -= 1) pattern += pieces[random(pieces.length)];
    let input = '';
    for (let count = random(12); count > 0; count -= 1) input += letters[random(letters.length)];
    const expected = legacyRegExp(pattern).test(input);
    const outcome = compileGlob(pattern).measure(input);
    assert.equal(matchesGlob(input, pattern), expected, `pattern ${JSON.stringify(pattern)} against ${JSON.stringify(input)}`);
    assert.equal(outcome.matched, expected);
    assert.equal(naiveMatch(pattern, input).matched, expected, `the control is faithful: ${JSON.stringify(pattern)} against ${JSON.stringify(input)}`);
    assert.equal(outcome.steps <= stepBound(outcome.tokens, input.length), true, `${outcome.steps} steps for ${JSON.stringify(pattern)} against ${JSON.stringify(input)}`);
    checked += 1;
    if (expected) matched += 1;
  }
  assert.equal(checked, 6000);
  assert.equal(matched > 200, true, `the random cases must include real matches, got ${matched}`);
});

test.describe('through the real CLI a long file name and a hostile pattern no longer freeze the enumeration', () => {
  const state = { scratch: null, runs: {} };
  const name = `${'a'.repeat(60)}.cjs`;
  const pattern = `${'*a'.repeat(10)}*b.cjs`;
  // A hang detector only: the old matcher needed hours here, the linear one finishes at once; the deadline is far above any load of a shared machine.
  const HANG_DEADLINE_MS = 300000;

  test.before(async () => {
    state.scratch = makeScratch('f4');
    const files = (extra = {}) => ({ [name]: "'use strict';\nfunction f(x) { return x + 1; }\nmodule.exports = { f };\n", 'tests/t.test.cjs': `'use strict';\nconst test = require('node:test');\nconst lib = require('../${name}');\ntest('t', () => { lib.f(1); });\n`, ...extra });
    const viaFlag = writeTree(path.join(state.scratch, 'flag'), files());
    const viaManifest = writeTree(path.join(state.scratch, 'manifest'), files({ 'coverage.manifest.json': JSON.stringify({ exclude: [{ file: pattern, reason: 'a hostile pattern that matches nothing' }] }) }));
    const scratchArgs = ['--scratch', path.join(state.scratch, 'gate-scratch')];
    const [flag, manifest] = await Promise.all([
      runGateCli(['--root', relativeToRepository(viaFlag), '--exclude', pattern, ...scratchArgs], { timeout: HANG_DEADLINE_MS }),
      runGateCli(['--root', relativeToRepository(viaManifest), ...scratchArgs], { timeout: HANG_DEADLINE_MS })
    ]);
    state.runs = { flag, manifest };
  });

  test.after(() => {
    if (state.scratch) dispose(state.scratch);
  });

  for (const channel of ['flag', 'manifest']) {
    test(`the pattern comes from the ${channel === 'flag' ? '--exclude flag' : 'coverage.manifest.json'}`, () => {
      const run = state.runs[channel];
      assert.equal(run.timedOut, false, `the gate hung: it was still running after ${HANG_DEADLINE_MS / 1000} seconds (a hang, not slowness: the matcher is linear)`);
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.report.files[0].ok, true);
      assert.equal(fs.existsSync(path.join(state.scratch, channel)), true);
    });
  }
});
