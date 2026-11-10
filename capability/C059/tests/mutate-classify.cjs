'use strict';

// Test tooling: how the mutation generator reads ONE run of `node --test` (fourth fix, review D2 and D3). A mutant is KILLED only when a NAMED test fails by an ASSERTION (ERR_ASSERTION) or by an
// error thrown inside the test, in a run that FINISHED (the TAP counters are there and add up). A per-test timeout of the runner, the failure of a whole file, a cancelled test, a failed hook,
// a crash and a run in which no named test failed are UNDECIDED: never a kill and never an equivalent, and an undecided mutant fails the campaign. A run that finished with every test passing is
// a SURVIVOR. The classes are read from the TAP the runner writes (failureType and code of every `not ok`), never from the exit code alone.
const COUNTERS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const KINDS = ['assertion', 'thrown', 'timeout', 'file', 'cancelled', 'hook', 'parent', 'other'];

// The final counters of the run (the last occurrence of each, at the start of a line); null when any is missing: the run did not finish.
function counters(text) {
  const found = {};
  for (const name of COUNTERS) {
    const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, 'gm'))];
    if (matches.length === 0) return null;
    found[name] = Number(matches.at(-1)[1]);
  }
  return found;
}

// Every `not ok` entry with the failureType and the error code of its own YAML block (the keys are indented two more spaces than the entry; nested subtests are deeper and read on their own).
function failures(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)not ok \d+ - (.*)$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const keys = {};
    for (let next = index + 1; next < lines.length; next += 1) {
      const lead = /^(\s*)/.exec(lines[next])[1].length;
      if (lines[next].trim() !== '' && lead <= indent) break;
      const pair = lead === indent + 2 ? /^\s*(failureType|code): '?([^'\r\n]*)'?\s*$/.exec(lines[next]) : null;
      if (pair) keys[pair[1]] = pair[2];
    }
    out.push({ name: match[2].trim(), failureType: keys.failureType ?? null, code: keys.code ?? null });
  }
  return out;
}

function kindOf(failure) {
  if (/^capability[\\/]/.test(failure.name)) return 'file';
  if (failure.failureType === 'testTimeoutFailure') return 'timeout';
  if (failure.failureType === 'cancelledByParent') return 'cancelled';
  if (failure.failureType === 'hookFailed') return 'hook';
  if (failure.failureType === 'subtestsFailed') return 'parent';
  if (failure.failureType === 'testCodeFailure') return failure.code === 'ERR_ASSERTION' ? 'assertion' : 'thrown';
  // The runner attributes an error that was thrown in the asynchronous work of a NAMED test (a rejected promise or an exception outside the test function) to that test: an error thrown inside the named test.
  if (failure.failureType === 'unhandledRejection' || failure.failureType === 'uncaughtException') return 'thrown';
  return 'other';
}

// run: { code, text } of one `node --test` process. status: 'killed' | 'survived' | 'undecided'. `unfinished` marks the run that died without its counters (the generator repeats it).
function classify({ code, text }) {
  const summary = counters(text);
  const entries = failures(text).map((failure) => ({ ...failure, kind: kindOf(failure) }));
  const kinds = Object.fromEntries(KINDS.map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]));
  const undecided = (reason, unfinished = false) => ({ status: 'undecided', reason, unfinished, kinds, named: [] });
  if (summary === null) return undecided('no TAP counters: the run did not finish (a crash, a hard stop or a killed process)', true);
  if (summary.tests === 0 || summary.pass + summary.fail + summary.cancelled + summary.skipped + summary.todo !== summary.tests) return undecided('the TAP counters do not add up');
  if (code === 0 && summary.fail === 0 && summary.cancelled === 0 && entries.length === 0) return { status: 'survived', reason: null, unfinished: false, kinds, named: [] };
  const causal = entries.filter((entry) => entry.kind === 'assertion' || entry.kind === 'thrown');
  if (code !== 0 && causal.length > 0) return { status: 'killed', reason: null, unfinished: false, kinds, named: [...new Set(causal.map((entry) => entry.name))] };
  const seen = KINDS.filter((kind) => kinds[kind] > 0).map((kind) => `${kinds[kind]} ${kind}`).join(', ');
  return undecided(`no named test failed by an assertion or by a thrown error (exit ${code}; ${seen || 'no failing test in the TAP'})`);
}

// The kind of proof of an equivalent mutant, read from the first words of its reason: IDENTITY (the replacement is the same text), DEMONSTRATED (tests\<file>): a test that passes on
// the real AND on the mutated file and shows the fact) or REASONING ONLY (code reading, nothing runnable). Anything else is not an accepted reason.
const DEMONSTRATED = /^DEMONSTRATED \(tests[\\/]([A-Za-z0-9._-]+)\):/;
function proofKind(reason) {
  if (typeof reason !== 'string') return null;
  if (/^IDENTITY:/.test(reason)) return 'identity';
  if (DEMONSTRATED.test(reason)) return 'demonstrated';
  if (/^REASONING ONLY:/.test(reason)) return 'reasoning';
  return 'unlabelled';
}
const demonstrationFile = (reason) => DEMONSTRATED.exec(reason ?? '')?.[1] ?? null;

module.exports = Object.freeze({ KINDS, classify, counters, demonstrationFile, failures, kindOf, proofKind });
