'use strict';

// F4 of the independent review of U009: the glob matcher was a backtracking RegExp, so a long file name against a pattern with several stars
// froze the enumeration for hours (the per-run timeout wraps only the child test runs). Matching must take milliseconds.
// This file uses only matchesGlob and the CLI, which exist before and after the fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeScratch, dispose, writeTree } = require('./support.cjs');
const { runGateCli, relativeToRepository } = require('./clisupport.cjs');
const { matchesGlob } = require('../glob.cjs');

const globModule = path.join(__dirname, '..', 'glob.cjs');
const matchScript = `
const { matchesGlob } = require(process.argv[1]);
const [pattern, input] = JSON.parse(process.argv[2]);
const started = process.hrtime.bigint();
const result = matchesGlob(input, pattern);
process.stdout.write(JSON.stringify({ result, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
`;

// The patterns and names of the reviewer's reproduction: with the backtracking RegExp these took 10 seconds and more, then hours.
const hostile = [
  ['stars against a run of a (60 characters)', `${'*a'.repeat(10)}*b.cjs`, `${'a'.repeat(60)}.cjs`, false],
  ['stars against a run of a, matching', `${'*a'.repeat(10)}*.cjs`, `${'a'.repeat(60)}.cjs`, true],
  ['globstar segments against 44 folders', `${'**/'.repeat(8)}x.cjs`, `${'a/'.repeat(44)}q.cjs`, false],
  ['globstar segments against 44 folders, matching', `${'**/'.repeat(8)}q.cjs`, `${'a/'.repeat(44)}q.cjs`, true],
  ['double stars inside a segment', `${'**a'.repeat(9)}**b.cjs`, `${'a'.repeat(40)}.cjs`, false]
];

for (const [label, pattern, input, expected] of hostile) {
  test(`matching finishes in milliseconds: ${label}`, () => {
    const run = spawnSync(process.execPath, ['-e', matchScript, globModule, JSON.stringify([pattern, input])], { encoding: 'utf8', timeout: 6000, killSignal: 'SIGKILL', windowsHide: true });
    assert.equal(run.error, undefined, 'the matcher must not hang: it was still running after 6 seconds');
    assert.equal(run.status, 0, run.stderr);
    const outcome = JSON.parse(run.stdout);
    assert.equal(outcome.result, expected);
    assert.equal(outcome.ms < 1000, true, `took ${outcome.ms} ms`);
  });
}

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

test('ordinary patterns keep the semantics of the old translation (seeded differential test)', () => {
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
    assert.equal(matchesGlob(input, pattern), expected, `pattern ${JSON.stringify(pattern)} against ${JSON.stringify(input)}`);
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

  test.before(async () => {
    state.scratch = makeScratch('f4');
    const files = (extra = {}) => ({ [name]: "'use strict';\nfunction f(x) { return x + 1; }\nmodule.exports = { f };\n", 'tests/t.test.cjs': `'use strict';\nconst test = require('node:test');\nconst lib = require('../${name}');\ntest('t', () => { lib.f(1); });\n`, ...extra });
    const viaFlag = writeTree(path.join(state.scratch, 'flag'), files());
    const viaManifest = writeTree(path.join(state.scratch, 'manifest'), files({ 'coverage.manifest.json': JSON.stringify({ exclude: [{ file: pattern, reason: 'a hostile pattern that matches nothing' }] }) }));
    const scratchArgs = ['--scratch', path.join(state.scratch, 'gate-scratch')];
    const [flag, manifest] = await Promise.all([
      runGateCli(['--root', relativeToRepository(viaFlag), '--exclude', pattern, ...scratchArgs], { timeout: 30000 }),
      runGateCli(['--root', relativeToRepository(viaManifest), ...scratchArgs], { timeout: 30000 })
    ]);
    state.runs = { flag, manifest };
  });

  test.after(() => {
    if (state.scratch) dispose(state.scratch);
  });

  for (const channel of ['flag', 'manifest']) {
    test(`the pattern comes from the ${channel === 'flag' ? '--exclude flag' : 'coverage.manifest.json'}`, () => {
      const run = state.runs[channel];
      assert.equal(run.timedOut, false, 'the gate must finish: matching a 64 character name is bounded');
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.report.files[0].ok, true);
      assert.equal(fs.existsSync(path.join(state.scratch, channel)), true);
    });
  }
});
