'use strict';

// U040 fix 2 (addendum 2): recomputes the evidence of fix 2 against the bytes in the namespace. It cannot be part of the runs it verifies, so it
// runs after addendum 2 exists. It checks: the addendum chain (addendum 2 pins addendum 1 by the SHA-256 of its raw bytes and supersedes exactly the
// replaced bytes of server.cjs, README.md and tests\coverage-gate.cjs), every archived run (gzip, raw hash, byte count, expected exit code), the
// two REDs on the committed bytes (assertions only, the F24 crash with exit 134 in every variant), the control on the pre-U040 bytes, the replay of the
// RED command on the final code, the final runs (whole suite, syntax, per-file coverage of server.cjs, the real browser, the fresh trees, the loop)
// and the mutation report. A tampered archive, addendum or report fails by name.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const chain = require('./u040-chain.cjs');
const currentAuthority = require('./u055-authority.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const FILE = (name) => `capability\\C026\\${name}`;
const D2 = FILE('evidence\\u040-2');
const resolveRel = (relative) => path.join(repository, ...relative.split('\\'));
const readCurrent = (relative) => {
  try { return fs.readFileSync(resolveRel(relative)); } catch { return null; }
};
const read = currentAuthority.readerAtSequence(readCurrent, 2);
const live = (name) => chain.sha(read(FILE(name)));
const overlay = (changes) => (relative) => (changes.has(relative) ? changes.get(relative) : read(relative));
const flip = (bytes) => {
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  return changed;
};

const VERIFIERS = Object.freeze(['evidence-final.test.cjs', 'u040-evidence.test.cjs', 'u040-evidence-2.test.cjs']);
const REDS = Object.freeze(['f2-red-01-new-tests-committed-bytes', 'f2-red-02-final-tests-committed-bytes']);
const FINALS = Object.freeze(['f2-control-01-flood-pre-u040-bytes', 'f2-replay-01-red-unchanged', 'f2-green-01-whole-suite', 'f2-syntax-01', 'f2-coverage-server.cjs', 'f2-browser-01',
  'f2-fresh-01-archive-lf', 'f2-fresh-02-archive-crlf', 'f2-loop-03-20x4']);
// Failed attempts that stay archived: the first loop found that the documented limit m2 was asserted too exactly, the second that the quiet window of the
// exchange helper (400 ms) ended a fuzz case before an answer queued behind three earlier ones had arrived on a starved server (1 run of 20 each).
const RETAINED = Object.freeze(['f2-loop-01-20x4', 'f2-loop-02-20x4']);
const SUPERSEDED_TESTS = `${D2}\\superseded`;
const CAMPAIGN_BUDGET_COPY = `${SUPERSEDED_TESTS}\\campaign-tests\\u040-budget.test.cjs.txt`;
const CAMPAIGN_EXPECT_COPY = `${SUPERSEDED_TESTS}\\campaign-tests\\u040-expect.test.cjs.txt`;
const LOOP2_BUDGET_COPY = `${SUPERSEDED_TESTS}\\loop2-tests\\u040-budget.test.cjs.txt`;
const EXPECTED_RUNS = Object.freeze([...REDS, ...FINALS, ...RETAINED].sort());
const NEW_SUITES = Object.freeze(['u040-flood.test.cjs', 'u040-budget.test.cjs', 'u040-expect.test.cjs']);
const TRAPS = Object.freeze(['TypeError', 'ReferenceError', 'SyntaxError', 'MODULE_NOT_FOUND', 'Cannot find module', 'test timed out']);
const REPORT = `${D2}\\mutants\\f2-mutants-01.report.json`;
const STAGED = `${D2}\\mutants\\f2-mutants-01.staged.json`;
const assertionErrors = (text) => (text.match(/name: 'AssertionError'/g) ?? []).length;

const state = chain.verifyChain(read);
const addendum = JSON.parse(read(chain.addendumPath(2))?.toString('utf8') ?? '{"evidence":[],"amendments":[]}');
const manifestPaths = addendum.evidence.map((item) => item.path).filter((item) => /\\evidence\\u040-2\\(?:red|green)\\[^\\]+\.json$/.test(item));

// A run of this folder: the manifest, and the two transcripts decompressed after their gzip, raw hash and byte count were recomputed.
function openRun(relative, readBytes) {
  const bytes = readBytes(relative);
  if (bytes === null) return { errors: [`MISSING ${relative}`] };
  const manifest = JSON.parse(bytes.toString('utf8'));
  const errors = [];
  const texts = {};
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gzPath = `${relative.slice(0, relative.lastIndexOf('\\'))}\\${entry.path}`;
    const gz = readBytes(gzPath);
    if (gz === null || chain.sha(gz) !== entry.gzipSha256) { errors.push(`GZIP_MISMATCH ${gzPath}`); texts[stream] = ''; continue; }
    const raw = zlib.gunzipSync(gz);
    if (chain.sha(raw) !== entry.sha256 || raw.length !== entry.bytes) errors.push(`TRANSCRIPT_MISMATCH ${gzPath}`);
    texts[stream] = raw.toString('utf8').replace(/\r\n/g, '\n');
  }
  if (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut) errors.push(`EXIT_MISMATCH ${relative}`);
  return { relative, manifest, errors, ...texts };
}
// strict: every recorded input of a final run is a byte of the namespace as it is (the captures of fix 2 were made after the last edit).
function checkInputs(run, readBytes) {
  const errors = [];
  for (const entry of run.manifest.inputs) {
    const now = readBytes(entry.path);
    if (now === null || chain.sha(now) !== entry.rawSha256) errors.push(`INPUT_CHANGED ${entry.path}`);
  }
  return errors;
}
const opened = new Map();
const run = (name) => {
  const relative = manifestPaths.find((item) => path.basename(item, '.json') === name);
  assert.notEqual(relative, undefined, `${name} is not listed in addendum 2`);
  if (!opened.has(relative)) opened.set(relative, openRun(relative, read));
  return opened.get(relative);
};
const inputHash = (manifest, relative) => manifest.inputs.find((entry) => entry.path === relative)?.rawSha256;
const SERVER = FILE('server.cjs');
const COMMITTED_SERVER = FILE('evidence\\u040-2\\superseded\\server.cjs.txt');
const PRE_U040_SERVER = FILE('evidence\\u040\\superseded\\server.cjs.txt');

test('addendum 2 pins addendum 1 byte for byte and supersedes exactly the replaced bytes of three files, each with a byte-exact copy', () => {
  assert.deepEqual(state.errors, []);
  assert.deepEqual(addendum.previous, { path: chain.addendumPath(1), rawSha256: chain.sha(read(chain.addendumPath(1))) });
  const files = [SERVER, FILE('README.md'), FILE('tests\\coverage-gate.cjs')];
  assert.deepEqual(addendum.amendments.map((entry) => entry.path), files);
  for (const entry of addendum.amendments) {
    const hashes = state.hashes.get(entry.path);
    assert.equal(hashes.length >= 3, true, entry.path);
    assert.deepEqual([entry.previousRawSha256, entry.rawSha256], hashes.slice(-2), `${entry.path}: the chain names the replaced and the live bytes`);
    assert.equal(chain.sha(read(entry.supersededCopy)), entry.previousRawSha256, `${entry.path}: byte-exact copy of the replaced bytes`);
  }
  assert.equal(chain.sha(read(COMMITTED_SERVER)), 'db597b1c5d50cb151a6e901105fd3be1b4ef19dce67926d70a61f639062944d9', 'the replaced server is the one of commit 0d0538a8');
  assert.equal(state.hashes.get(SERVER)[0], chain.sha(read(PRE_U040_SERVER)), 'the chain starts at the pre-U040 bytes');
});

test('every archived run of fix 2 recomputes, finished at its expected exit code, is listed in addendum 2, and the runs are exactly the expected ones', () => {
  assert.deepEqual(manifestPaths.map((item) => path.basename(item, '.json')).sort(), [...EXPECTED_RUNS]);
  for (const name of EXPECTED_RUNS) {
    const relative = manifestPaths.find((item) => path.basename(item, '.json') === name);
    assert.deepEqual(run(name).errors, RETAINED.includes(name) ? [`EXIT_MISMATCH ${relative}`] : [], name);
  }
  for (const folder of ['red', 'green']) {
    for (const name of fs.readdirSync(path.join(root, 'evidence', 'u040-2', folder)).filter((entry) => entry.endsWith('.json'))) {
      assert.equal(manifestPaths.includes(`${D2}\\${folder}\\${name}`), true, `${name} is not listed in addendum 2`);
    }
  }
  for (const item of addendum.evidence) assert.equal(chain.sha(read(item.path)), item.rawSha256, item.path);
});

test('the REDs ran on the committed bytes and failed on assertions only: the F24 flood kills the child with exit 134 in every variant, and the m1 rows fail', () => {
  const [first, final] = REDS.map(run);
  for (const red of [first, final]) {
    assert.deepEqual([red.manifest.exitCode, red.manifest.expectedExitCode], [1, 1], red.relative);
    assert.equal(red.manifest.summary.fail > 0 && red.manifest.summary.pass > 0, true);
    assert.equal(assertionErrors(red.stdout), red.manifest.summary.fail, `${red.relative}: every failure is an assertion`);
    for (const trap of TRAPS) assert.equal(red.stdout.includes(trap), false, `${red.relative}: ${trap}`);
    const failed = red.manifest.summary.notOk;
    for (const variant of ['real', 'refuse', 'hold']) {
      assert.equal(failed.some((name) => name.startsWith(`flood ${variant}: `)), true, `${red.relative}: flood ${variant} fails`);
    }
    for (const variant of red === first ? ['real', 'refuse', 'hold'] : ['real', 'refuse', 'hold', 'expect']) assert.equal(failed.some((name) => name.startsWith(`budget ${variant}: `)), true, `${red.relative}: budget ${variant} fails`);
    for (const mode of ['in-process', 'separate']) {
      assert.equal(failed.some((name) => name.startsWith(`${mode}: GET with Expect: 100-continue followed by a valid upgrade`)), true, `${red.relative}: m1 ${mode} fails`);
      assert.equal(failed.some((name) => name.startsWith(`${mode}: the budget is exact`)), true, `${red.relative}: the exact budget ${mode} fails`);
    }
    assert.equal((red.stdout.match(/"code":134/g) ?? []).length >= 6, true, `${red.relative}: the server child died with exit 134 in the three variants of both probes`);
    assert.equal(red.stdout.includes('Last few GCs'), true, `${red.relative}: the V8 out-of-memory report of the dead child is in the failure message`);
  }
  assert.equal(inputHash(first.manifest, SERVER), state.hashes.get(SERVER).at(-2), 'red-01 ran on the committed server.cjs, which addendum 2 supersedes');
  assert.equal(inputHash(final.manifest, COMMITTED_SERVER), state.hashes.get(SERVER).at(-2), 'red-02 ran on the byte-exact copy of the committed server.cjs');
  const threeVariants = (red) => red.manifest.summary.notOk.filter((name) => /^(flood|budget) (real|refuse|hold): /.test(name)).sort();
  assert.deepEqual(threeVariants(final), threeVariants(first), 'the final tests fail the three flood variants like the first tests');
  assert.equal(final.manifest.environmentAdded?.includes('U040_SERVER_MODULE'), true, 'the committed bytes were selected through U040_SERVER_MODULE');
  assert.equal(read(`${D2}\\superseded\\first-tests\\u040-flood.test.cjs.txt`) !== null, true, 'the first versions of the tests are kept');
});

test('the control: the four flood tests that need nothing of the new behaviour pass on the pre-U040 bytes', () => {
  const control = run('f2-control-01-flood-pre-u040-bytes');
  assert.deepEqual([control.manifest.exitCode, control.manifest.summary.tests, control.manifest.summary.pass, control.manifest.summary.fail], [0, 4, 4, 0]);
  for (const variant of ['real', 'refuse', 'hold', 'expect']) assert.match(control.stdout, new RegExp(`^ok \\d+ - flood ${variant}: `, 'm'));
  assert.equal(inputHash(control.manifest, PRE_U040_SERVER), state.hashes.get(SERVER)[0], 'the control ran on the pre-U040 bytes');
  assert.equal(control.manifest.environmentAdded?.includes('U040_SERVER_MODULE'), true);
});

test('the RED command replayed unchanged on the final code passes, with the same tests', () => {
  const [, red] = REDS.map(run);
  const replay = run('f2-replay-01-red-unchanged');
  assert.deepEqual(replay.manifest.command, red.manifest.command, 'the replay is the RED command');
  assert.deepEqual([replay.manifest.summary.fail, replay.manifest.summary.tests], [0, red.manifest.summary.tests]);
  for (const entry of red.manifest.inputs.filter((item) => /\\tests\\u040-/.test(item.path))) assert.deepEqual(replay.manifest.inputs.find((item) => item.path === entry.path), entry, `${entry.path}: the RED tests are replayed unchanged`);
  assert.equal(inputHash(replay.manifest, SERVER), live('server.cjs'), 'the replay ran on the final server.cjs');
  assert.equal(replay.manifest.environmentAdded, undefined, 'no override: the tests load ..\\server.cjs');
});

test('the final runs: every input is the live byte, the whole suite passed, server.cjs is covered at 85/85/85, the browser ran, and the syntax check passed', () => {
  for (const name of FINALS) {
    const finished = run(name);
    assert.deepEqual(checkInputs(finished, read), [], name);
  }
  const whole = run('f2-green-01-whole-suite');
  const suites = whole.manifest.command.filter((argument) => argument.endsWith('.test.cjs')).map((argument) => path.basename(argument)).sort();
  const liveSuites = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs') && !name.startsWith('u055-') && !VERIFIERS.includes(name)).sort();
  assert.deepEqual(suites, liveSuites, 'every suite except the three verifiers');
  for (const name of NEW_SUITES) assert.equal(suites.includes(name), true, name);
  assert.deepEqual([whole.manifest.summary.fail, whole.manifest.summary.cancelled, whole.manifest.summary.skipped, whole.manifest.summary.todo, whole.manifest.summary.pass], [0, 0, 0, 0, whole.manifest.summary.tests]);
  assert.equal(whole.manifest.summary.tests >= 196, true, `the whole suite without the verifiers ran ${whole.manifest.summary.tests} tests`);
  const coverage = run('f2-coverage-server.cjs');
  const row = coverage.manifest.summary.coverageRows.find((entry) => entry.file === 'server.cjs' || entry.file.endsWith('/server.cjs'));
  assert.equal(Boolean(row) && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, true, JSON.stringify(row));
  assert.equal(coverage.manifest.command.includes('--test-coverage-include=capability/C026/server.cjs'), true, 'one L-0004 command for the file');
  assert.deepEqual(coverage.manifest.command.filter((argument) => argument.endsWith('.test.cjs')).map((argument) => path.basename(argument)).sort(), liveSuites);
  assert.equal(coverage.manifest.summary.tests, whole.manifest.summary.tests, 'the coverage run ran the same tests');
  assert.match(run('f2-browser-01').stdout, /C026 browser GREEN/);
  assert.match(run('f2-syntax-01').stdout, /C026 syntax: \d+ JavaScript files parsed/);
});

const LOOP_ROW = /^run (\d+)\/(\d+) exit=(\S+) tests=(\d+) pass=(\d+) fail=(\d+) cancelled=(\d+) skipped=(\d+) todo=(\d+) timedOut=(true|false) ms=\d+$/gm;
function checkLoop(text, { runs, parallel, burners, tests }) {
  const errors = [];
  if (!new RegExp(`^U040 loop 2: ${runs} runs of u040-flood\\.test\\.cjs \\+ u040-budget\\.test\\.cjs \\+ u040-expect\\.test\\.cjs, ${parallel} at once, ${burners} CPU burners, \\d+ logical processors$`, 'm').test(text)) errors.push('LOOP_HEADER');
  const started = /^U040 loop 2: burner pids (\[[\d,]*\])$/m.exec(text);
  const stopped = /^U040 loop 2: burners stopped by pid (\[[\d,]*\])$/m.exec(text);
  if (started === null || stopped === null || started[1] !== stopped[1] || JSON.parse(started[1]).length !== burners || new Set(JSON.parse(started[1])).size !== burners) errors.push('LOOP_BURNERS');
  const rows = new Map();
  for (const match of text.matchAll(LOOP_ROW)) rows.set(Number(match[1]), match.slice(2).join(' '));
  const clean = [runs, 0, tests, tests, 0, 0, 0, 0, 'false'].join(' ');
  for (let index = 1; index <= runs; index += 1) {
    if (!rows.has(index)) errors.push(`LOOP_RUN_MISSING ${index}`);
    else if (rows.get(index) !== clean) errors.push(`LOOP_RUN_NOT_CLEAN ${index}`);
  }
  if (text.includes('FAILED TESTS')) errors.push('LOOP_FAILED_TESTS');
  if (!new RegExp(`^U040 loop 2: runs=${runs} parallel=${parallel} burners=${burners} ok=${runs} failed=0 testsPerRun=\\[${tests}\\] `, 'm').test(text)) errors.push('LOOP_SUMMARY');
  return errors;
}
const FRESH_IMPORTS = Object.freeze(['capability/C001/approved-contract.js', 'capability/C001/contract-guard.js']);
function checkFresh(mode, manifest, text, { tests, suites }) {
  const errors = [];
  const prefix = `U040 fresh-tree 2 ${mode}: `;
  if (manifest.exitCode !== 0 || manifest.timedOut) errors.push(`FRESH_EXIT ${mode}`);
  if (manifest.command[1]?.endsWith('u040-fresh-tree-2.cjs') !== true || manifest.command[3] !== mode) errors.push(`FRESH_COMMAND ${mode}`);
  if ([manifest.summary.tests, manifest.summary.pass].some((value) => value !== tests) || [manifest.summary.fail, manifest.summary.cancelled, manifest.summary.skipped, manifest.summary.todo].some((value) => value !== 0)) errors.push(`FRESH_COUNTS ${mode}`);
  if (!new RegExp(`^${prefix}git archive of [0-9a-f]{40}: \\d+ files, each equal to its committed blob \\(core\\.autocrlf=false\\)$`, 'm').test(text)) errors.push(`FRESH_NOT_A_GIT_ARCHIVE ${mode}`);
  const listed = (kind) => [...text.matchAll(new RegExp(`^${prefix}  ${kind} (\\S+)$`, 'gm'))].map((match) => match[1].replace(/\//g, '\\')).sort();
  for (const amended of [SERVER, FILE('README.md'), FILE('tests\\coverage-gate.cjs')]) if (!listed('modified').includes(amended)) errors.push(`FRESH_OVERLAY_LACKS ${amended}`);
  if (listed('removed').length !== 0) errors.push(`FRESH_REMOVED ${mode}`);
  const converted = new RegExp(`^${prefix}converted to CRLF: (\\d+) files(?: \\((.+)\\))?$`, 'm').exec(text);
  const expected = mode === 'crlf' ? FRESH_IMPORTS : [];
  if (converted === null || Number(converted[1]) !== expected.length || JSON.stringify((converted[2] ?? '').split(', ').filter(Boolean).sort()) !== JSON.stringify(expected)) errors.push(`FRESH_CONVERSION ${mode}`);
  const ran = new RegExp(`^${prefix}running (\\d+) suites in the scratch tree`, 'm').exec(text);
  if (ran === null || Number(ran[1]) !== suites) errors.push(`FRESH_SUITES ${mode}`);
  if (!new RegExp(`^${prefix}the suites exited with 0$`, 'm').test(text)) errors.push(`FRESH_SUITES_EXIT ${mode}`);
  return errors;
}

test('the loop ran 20 times, 4 at a time, under 4 CPU burners that were stopped by pid, and every run was clean; the fresh trees passed in LF and CRLF', () => {
  const whole = run('f2-green-01-whole-suite');
  const loop = run('f2-loop-03-20x4');
  const options = { runs: 20, parallel: 4, burners: 4, tests: run('f2-replay-01-red-unchanged').manifest.summary.tests };
  assert.deepEqual(checkLoop(loop.stdout, options), []);
  assert.deepEqual([loop.manifest.command[1].endsWith('u040-loop-2.cjs'), ...loop.manifest.command.slice(2)], [true, '20', '4', '4']);
  const suites = whole.manifest.command.filter((argument) => argument.endsWith('.test.cjs')).length;
  for (const [mode, name] of [['lf', 'f2-fresh-01-archive-lf'], ['crlf', 'f2-fresh-02-archive-crlf']]) {
    const fresh = run(name);
    assert.deepEqual(checkFresh(mode, fresh.manifest, fresh.stdout, { tests: whole.manifest.summary.tests, suites }), [], name);
  }
});

// The retained failed attempts: in each exactly one run of 20 failed, on the named test and with the named message, every other run was clean, and the
// suites that ran are the byte-exact superseded copies; the clean loop ran on the final bytes.
function checkFailedLoop(text, stderr, { runs, tests, testPrefix, message }) {
  const errors = [];
  const rows = [...text.matchAll(LOOP_ROW)];
  if (rows.length !== runs) errors.push('LOOP_ROWS');
  const clean = [runs, 0, tests, tests, 0, 0, 0, 0, 'false'].join(' ');
  const unclean = rows.filter((match) => match.slice(2).join(' ') !== clean);
  if (unclean.length !== 1) return [...errors, `LOOP_UNCLEAN_RUNS ${unclean.length}`];
  const [, index, , exit, total, pass, fail, cancelled, skipped, todo, timedOut] = unclean[0];
  if (JSON.stringify([exit, Number(total), Number(pass), Number(fail), cancelled, skipped, todo, timedOut]) !== JSON.stringify(['1', tests, tests - 1, 1, '0', '0', '0', 'false'])) errors.push('LOOP_FAILED_RUN_SHAPE');
  const named = new RegExp(`^run ${index}/${runs} FAILED TESTS: (.+)$`, 'm').exec(text);
  const failedNames = named === null ? [] : JSON.parse(named[1]);
  if (failedNames.length !== 1 || !failedNames[0].startsWith(testPrefix)) errors.push('LOOP_FAILED_TEST_NAME');
  for (const needle of ["name: 'AssertionError'", message]) if (!stderr.includes(needle)) errors.push(`LOOP_FAILURE_EVIDENCE ${needle}`);
  return errors;
}

test('the two failed loops are retained: one run of 20 failed in each, on the named test, with the suites that the superseded copies keep, and the final loop ran on the final bytes', () => {
  const tests = run('f2-replay-01-red-unchanged').manifest.summary.tests;
  const budget = FILE('tests\\u040-budget.test.cjs');
  const expect = FILE('tests\\u040-expect.test.cjs');
  const cases = [
    ['f2-loop-01-20x4', 'separate: documented limit m2:', 'the second read answer is taken by the raw refusal', CAMPAIGN_BUDGET_COPY],
    ['f2-loop-02-20x4', 'separate: seeded hostile pipelines around the drop budget (seed 41', 'the connection ends (quiet)', LOOP2_BUDGET_COPY]
  ];
  for (const [name, testPrefix, message, budgetCopy] of cases) {
    const failed = run(name);
    assert.deepEqual(checkFailedLoop(failed.stdout, failed.stderr, { runs: 20, tests, testPrefix, message }), [], name);
    assert.equal(new RegExp(`^U040 loop 2: runs=20 parallel=4 burners=4 ok=19 failed=1 testsPerRun=\\[${tests}\\] `, 'm').test(failed.stdout), true, name);
    assert.equal(inputHash(failed.manifest, budget), chain.sha(read(budgetCopy)), `${name}: ran on the budget suite that the superseded copy keeps`);
    assert.equal(inputHash(failed.manifest, expect), chain.sha(read(CAMPAIGN_EXPECT_COPY)), `${name}: ran on the expect suite that the superseded copy keeps`);
    assert.equal(sameUpToTheEdits(read(budgetCopy).toString('utf8'), read(budget).toString('utf8'), { limits: true }), true, `${name}: the budget suite changed only in the documented-limit rows and the quiet window`);
    assert.equal(sameUpToTheEdits(read(CAMPAIGN_EXPECT_COPY).toString('utf8'), read(expect).toString('utf8'), { limits: false }), true, `${name}: the expect suite changed only in the quiet window`);
    assert.notEqual(inputHash(failed.manifest, budget), live('tests\\u040-budget.test.cjs'));
  }
  const final = run('f2-loop-03-20x4');
  assert.equal(inputHash(final.manifest, budget), live('tests\\u040-budget.test.cjs'), 'the final loop ran on the final budget suite');
  assert.equal(inputHash(final.manifest, expect), live('tests\\u040-expect.test.cjs'), 'the final loop ran on the final expect suite');
  const [firstCase] = cases;
  const failedOne = run(firstCase[0]);
  assert.equal(checkFailedLoop(failedOne.stdout.replace('run 18/20 exit=1', 'run 18/20 exit=0'), failedOne.stderr, { runs: 20, tests, testPrefix: firstCase[1], message: firstCase[2] }).length > 0, true);
  assert.deepEqual(checkFailedLoop(final.stdout, '', { runs: 20, tests, testPrefix: '', message: '' }), ['LOOP_UNCLEAN_RUNS 0'], 'a clean loop is not a retained failure');
});

// The suites changed after the mutation campaign and the first two loops had copied them: the two documented-limit rows of the budget suite were relaxed
// (the first loop found that they asserted too much) and the exchange wrapper of the budget and expect suites got a quiet window of 3 s (the second loop).
// Reversing exactly those edits on the live text gives the superseded copy.
const LIMITS_START = '  // Documented limits of U040 that stay true';
const LIMITS_END = "test('a failing assertion inside a fixture body";
function sameUpToTheEdits(oldText, newText, { limits }) {
  const quiet = (text) => text.replace(' A quiet window of 3 s\r\n', '\r\n').replace(/\/\/ \(instead of the helper's 400 ms\)[^\r\n]*\r\n/, '').replace('quietMs: 3000, ', '');
  const cut = (text) => {
    if (!limits) return text;
    const from = text.indexOf(LIMITS_START);
    const to = text.indexOf(LIMITS_END);
    return from < 0 || to < from ? null : text.slice(0, from) + text.slice(to);
  };
  const [before, after] = [cut(quiet(oldText)), cut(quiet(newText))];
  return before !== null && after !== null && before === after;
}

function checkReport(readBytes) {
  const report = JSON.parse(readBytes(REPORT).toString('utf8'));
  const errors = [];
  if (report.serverSha256 !== chain.sha(readBytes(SERVER))) errors.push('REPORT_FOR_OTHER_SERVER');
  // The suites changed after the campaign ended: the budget and expect suites got their quiet window of 3 s (the second loop found that 400 ms was too short);
  // the byte-exact copies keep the versions that the campaign ran and that the report hashed, and reversing exactly those edits on the live text gives them.
  const COPIES = {
    'u040-budget.test.cjs': [[CAMPAIGN_BUDGET_COPY, true], [LOOP2_BUDGET_COPY, true]], 'u040-expect.test.cjs': [[CAMPAIGN_EXPECT_COPY, false]]
  };
  const acceptable = (name, hash) => {
    const now = readBytes(FILE(`tests\\${name}`));
    if (chain.sha(now) === hash) return true;
    return (COPIES[name] ?? []).some(([copyPath, limits]) => {
      const copy = readBytes(copyPath);
      return copy !== null && chain.sha(copy) === hash && sameUpToTheEdits(copy.toString('utf8'), now.toString('utf8'), { limits });
    });
  };
  // the report's own claim: it hashes the live files when it ends
  for (const [name, hash] of Object.entries(report.testInputs)) if (!acceptable(name, hash)) errors.push(`REPORT_FOR_OTHER_TESTS ${name}`);
  // what ran: the SHA-256 of the test files in the staged trees of both workers
  const staged = JSON.parse(readBytes(STAGED).toString('utf8')).staged;
  for (const [name, hash] of Object.entries(staged)) if (!acceptable(name, hash)) errors.push(`CAMPAIGN_RAN_OTHER_TESTS ${name}`);
  if (report.controlPassed !== true) errors.push('CONTROL_FAILED');
  if (report.undecided.length > 0) errors.push('MUTANT_UNDECIDED');
  const equivalent = new Set(report.equivalent.map((entry) => entry.id));
  if (report.survived.some((id) => !equivalent.has(id))) errors.push('MUTANT_SURVIVED');
  const named = report.results.filter((entry) => /^N\d\d$/.test(entry.id));
  if (named.length < 8) errors.push('NAMED_MUTANTS_MISSING');
  for (const result of report.results.filter((entry) => entry.id !== 'control' && entry.outcome === 'killed')) if (result.failedTests.length === 0) errors.push(`NOT_KILLED_BY_A_NAMED_TEST ${result.id}`);
  for (const result of named) if (result.outcome !== 'killed') errors.push(`NAMED_MUTANT_NOT_KILLED ${result.id}`);
  if (report.killed + report.survived.length + report.invalid !== report.total) errors.push('REPORT_COUNTS');
  return errors;
}

test('the mutation report is for the shipped server.cjs and the shipped suites: the control passed, every named mutant and every generated mutant was killed by a named failing test or is a listed equivalent', () => {
  assert.deepEqual(checkReport(read), []);
  const report = JSON.parse(read(REPORT).toString('utf8'));
  assert.equal(report.total >= 40, true, `a systematic run: ${report.total} mutants`);
  assert.equal(report.changedLines.length >= 20, true, 'every changed line of server.cjs was considered');
  const output = read(`${D2}\\mutants\\f2-mutants-01.stdout.txt`).toString('utf8');
  assert.match(output, /U040 mutants 2: \d+ of \d+ valid mutants killed, \d+ invalid, survivors \[.*\], undecided \[\], control passed true/);
});

test('tampering is detected by name: addendum 1, a live file, a superseded copy, a transcript byte, an input, a loop row and the mutation report', () => {
  const first = read(chain.addendumPath(1)).toString('utf8');
  assert.deepEqual(chain.verifyChain(overlay(new Map([[chain.addendumPath(1), Buffer.from(first.replace('"item": "U040"', '"item": "U041"'))]]))).errors, [`CHAIN_BROKEN ${chain.addendumPath(2)}`], 'an edit of the informational fields of addendum 1 (m6)');
  assert.deepEqual(chain.verifyChain(overlay(new Map([[FILE('README.md'), flip(read(FILE('README.md')))]]))).errors, [`LIVE_BYTES_DIFFER_FROM_ADDENDUM ${FILE('README.md')}`]);
  const copy = addendum.amendments[0].supersededCopy;
  assert.deepEqual(chain.verifyChain(overlay(new Map([[copy, flip(read(copy))]]))).errors, [`EVIDENCE_MISMATCH ${copy}`]);
  const relative = run('f2-green-01-whole-suite').relative;
  const manifest = JSON.parse(read(relative).toString('utf8'));
  const gzPath = `${relative.slice(0, relative.lastIndexOf('\\'))}\\${manifest.transcripts.stdout.path}`;
  assert.deepEqual(openRun(relative, overlay(new Map([[gzPath, flip(read(gzPath))]]))).errors, [`GZIP_MISMATCH ${gzPath}`]);
  assert.deepEqual(checkInputs(run('f2-green-01-whole-suite'), overlay(new Map([[SERVER, flip(read(SERVER))]]))), [`INPUT_CHANGED ${SERVER}`]);
  assert.deepEqual(checkInputs(run('f2-green-01-whole-suite'), overlay(new Map([[FILE('README.md'), null]]))), [`INPUT_CHANGED ${FILE('README.md')}`]);
  const loop = run('f2-loop-03-20x4');
  const options = { runs: 20, parallel: 4, burners: 4, tests: run('f2-replay-01-red-unchanged').manifest.summary.tests };
  assert.deepEqual(checkLoop(loop.stdout.replace('run 07/20 exit=0 ', 'run 07/20 exit=1 '), options), ['LOOP_RUN_NOT_CLEAN 7']);
  assert.deepEqual(checkLoop(loop.stdout.replace(/^run 12\/20 .*\n/m, ''), options), ['LOOP_RUN_MISSING 12']);
  assert.deepEqual(checkLoop(loop.stdout.replace(', 4 CPU burners,', ', 0 CPU burners,'), options), ['LOOP_HEADER']);
  assert.deepEqual(checkLoop(loop.stdout.replace(/burners stopped by pid \[(\d+)/, 'burners stopped by pid [1$1'), options), ['LOOP_BURNERS']);
  const report = JSON.parse(read(REPORT).toString('utf8'));
  const survivor = Buffer.from(JSON.stringify({ ...report, killed: report.killed - 1, survived: [...report.survived, 'N01'] }));
  assert.deepEqual(checkReport(overlay(new Map([[REPORT, survivor]]))), ['MUTANT_SURVIVED']);
  assert.deepEqual(checkReport(overlay(new Map([[SERVER, Buffer.from('other')]]))), ['REPORT_FOR_OTHER_SERVER']);
  assert.deepEqual(checkReport(overlay(new Map([[FILE('tests\\u040-budget.test.cjs'), flip(read(FILE('tests\\u040-budget.test.cjs')))]]))), ['REPORT_FOR_OTHER_TESTS u040-budget.test.cjs', 'CAMPAIGN_RAN_OTHER_TESTS u040-budget.test.cjs']);
  assert.deepEqual(checkReport(overlay(new Map([[FILE('tests\\u040-flood.test.cjs'), flip(read(FILE('tests\\u040-flood.test.cjs')))]]))), ['REPORT_FOR_OTHER_TESTS u040-flood.test.cjs', 'CAMPAIGN_RAN_OTHER_TESTS u040-flood.test.cjs']);
  const fresh = run('f2-fresh-02-archive-crlf');
  const suites = run('f2-green-01-whole-suite').manifest.command.filter((argument) => argument.endsWith('.test.cjs')).length;
  const freshOptions = { tests: run('f2-green-01-whole-suite').manifest.summary.tests, suites };
  assert.deepEqual(checkFresh('crlf', fresh.manifest, fresh.stdout.replace('git archive of', 'copy of'), freshOptions), ['FRESH_NOT_A_GIT_ARCHIVE crlf']);
  assert.deepEqual(checkFresh('crlf', { ...fresh.manifest, exitCode: 1 }, fresh.stdout, freshOptions), ['FRESH_EXIT crlf']);
});
