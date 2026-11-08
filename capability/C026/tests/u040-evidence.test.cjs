'use strict';

// U040: recomputes the evidence of this item against the bytes in the namespace (it cannot be part of the runs it verifies, so it runs
// after the addendum exists): the addendum chain, every archived run, the REDs against the superseded bytes of server.cjs, the replay
// of the RED unchanged, the per-file coverage rows and the mutation report. A tampered archive or addendum fails by name.
// Two generations of captures exist (U040.md, "Two generations of captures"). S1 ran with the first versions of five files that were
// changed later; it is kept as history and accepted with ONE exemption: the recorded hash of one of those five files is the hash of its
// byte-exact copy under evidence\u040\superseded, and every other recorded input is the live byte. S2 is the final set: every input of
// an S2 run is the live byte, no exemption.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const chain = require('./u040-chain.cjs');
const currentAuthority = require('./u055-authority.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const CHAIN_SHA256 = '937fe67978f005dff2a12440999a0e75f5171fe7cf8900ea0de65b174a3fa0e2';
const PRODUCTION = Object.freeze(['framing.cjs', 'stream.cjs', 'server.cjs', 'conversation.cjs', 'page.js', 'index.html', 'styles.css']);
const VERIFIERS = Object.freeze(['evidence-final.test.cjs', 'u040-evidence.test.cjs']);
const FILE = (name) => `capability\\C026\\${name}`;
const resolveRel = (relative) => path.join(repository, ...relative.split('\\'));
const readCurrent = (relative) => {
  try { return fs.readFileSync(resolveRel(relative)); } catch { return null; }
};
const read = currentAuthority.readerAtSequence(readCurrent, 2);
const live = (name) => chain.sha(read(FILE(name)));

const HELPER = 'tests\\u040-support.cjs';
const SUPERSEDED = FILE('evidence\\u040\\superseded\\');
// The ONE exemption of the S1 captures: these five files were changed after S1 ran; their byte-exact S1 copies are archived.
const SUPERSEDED_COPIES = Object.freeze({
  [FILE(HELPER)]: `${SUPERSEDED}u040-support.s1.cjs.txt`,
  [FILE('tests\\u040-node-own.test.cjs')]: `${SUPERSEDED}u040-node-own.test.s1.cjs.txt`,
  [FILE('README.md')]: `${SUPERSEDED}README.s1.md.txt`,
  [FILE('U040.md')]: `${SUPERSEDED}U040.s1.md.txt`,
  [FILE('U040.feature')]: `${SUPERSEDED}U040.s1.feature.txt`
});
// sha256 of the S1 copies through readBytes, so that a tamper test can change a copy without touching the namespace
const copyHashes = (readBytes) => new Map(Object.entries(SUPERSEDED_COPIES).map(([file, copy]) => [file, readBytes(copy) === null ? null : chain.sha(readBytes(copy))]));
const oldHash = (name) => copyHashes(read).get(FILE(name));
// The hash that a run must have recorded for a namespace file: the live byte, or, for an S1 run, the byte of the S1 copy where it was superseded.
const expectedHash = (name, history) => (history && oldHash(name) !== undefined ? oldHash(name) : live(name));

const COVERAGE_FILES = Object.freeze(['conversation.cjs', 'framing.cjs', 'page.js', 'server.cjs', 'stream.cjs']);
const S1_REDS = Object.freeze(['red-01-pipelined-behind-refusal-head', 'red-02-final-tests-head']);
const S1_FINAL = Object.freeze(['green-01-u040-suites', 'green-02-whole-suite-1', 'green-03-whole-suite-2', 'green-04-whole-suite-3', 'replay-01-red-unchanged', 'syntax-01', 'browser-01',
  ...COVERAGE_FILES.map((file) => `coverage-${file}`)]);
// Attempts that failed and stay archived: the two fresh-checkout attempts that hit the driver's path-length guard, and the 64 x 8 loop that
// found the flake of the first helper.
const RETAINED_FAILURES = Object.freeze(['fresh-01-archive-lf', 'fresh-02-archive-crlf', 'loop-01-64x8']);
const WHOLE_S2 = Object.freeze(['green-06-whole-suite-s2']);
const S2_FINAL = Object.freeze(['replay-02-red-unchanged', 'green-05-u040-suites', ...WHOLE_S2, 'syntax-02', 'browser-02', 'fresh-03-archive-lf', 'fresh-04-archive-crlf', 'loop-02-64x4',
  ...COVERAGE_FILES.map((file) => `coverage-s2-${file}`)]);
const OTHER_REDS = Object.freeze(['red-03-old-verifier-fixed-server', 'red-04-final-tests-head', 'red-05-exchange-old-helper']);
const EXPECTED_RUNS = Object.freeze([...S1_REDS, ...OTHER_REDS, ...S1_FINAL, ...RETAINED_FAILURES, ...S2_FINAL].sort());

const state = chain.verifyChain(read);
// Addendum 2 (fix 2) replaced three of these files after every capture of this file ran. A recorded input of such a capture is accepted when
// it is exactly the bytes that addendum 2 names as replaced and the file is exactly the bytes that it names as the live ones (a changed live
// file is never accepted: the chain itself reports it).
const FIX2_AMENDED = Object.freeze(['server.cjs', 'README.md', 'tests\\coverage-gate.cjs'].map(FILE));
const replacedByFix2 = (relative, recorded, liveBytes) => FIX2_AMENDED.includes(relative) && liveBytes !== null && state.hashes.has(relative)
  && state.hashes.get(relative).length >= 3 && state.hashes.get(relative).at(-2) === recorded && chain.supersedes(state.hashes, relative, recorded, chain.sha(liveBytes));
const shipped = (recorded, name) => recorded === live(name) || replacedByFix2(FILE(name), recorded, read(FILE(name)));
// The verifier of addendum 2 and the suites that fix 2 adds ran in no capture of this file.
const FIX2_SUITES = Object.freeze(['u040-evidence-2.test.cjs', 'u040-flood.test.cjs', 'u040-budget.test.cjs', 'u040-expect.test.cjs']);
const liveSuiteNames = () => fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs') && !name.startsWith('u055-') && !VERIFIERS.includes(name) && !FIX2_SUITES.includes(name)).sort();
const addendum = JSON.parse(read(chain.addendumPath(1))?.toString('utf8') ?? '{"evidence":[]}');
const manifestPaths = addendum.evidence.map((item) => item.path).filter((item) => /\\evidence\\u040\\(?:red|green)\\[^\\]+\.json$/.test(item));

const opened = new Map();
function open(relative) {
  if (opened.has(relative)) return opened.get(relative);
  const manifest = JSON.parse(read(relative).toString('utf8'));
  const texts = {};
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gz = fs.readFileSync(path.join(path.dirname(resolveRel(relative)), ...entry.path.split('\\')));
    assert.equal(chain.sha(gz), entry.gzipSha256, `${relative} ${stream}: gzip bytes changed`);
    const raw = zlib.gunzipSync(gz);
    assert.deepEqual([chain.sha(raw), raw.length], [entry.sha256, entry.bytes], `${relative} ${stream}: transcript changed`);
    texts[stream] = raw.toString('utf8').replace(/\r\n/g, '\n');
  }
  opened.set(relative, { manifest, ...texts });
  return opened.get(relative);
}
function run(name) {
  const relative = manifestPaths.find((item) => path.basename(item, '.json') === name);
  assert.notEqual(relative, undefined, `${name} is not listed in the addendum`);
  return { relative, ...open(relative) };
}
const inputHash = (manifest, name) => manifest.inputs.find((entry) => entry.path === FILE(name))?.rawSha256;
const assertionErrors = (text) => (text.match(/name: 'AssertionError'/g) ?? []).length;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TRAPS = Object.freeze(['TypeError', 'ReferenceError', 'SyntaxError', 'MODULE_NOT_FOUND', 'Cannot find module', 'test timed out']);

test('the helper that this test trusts is the pinned one, and the addendum chain verifies against the live namespace', () => {
  assert.equal(chain.sha(fs.readFileSync(path.join(__dirname, 'u040-chain.cjs'))), CHAIN_SHA256);
  assert.equal(read(chain.addendumPath(1)) !== null, true, 'evidence-index-addendum-1.json is missing');
  assert.deepEqual(state.errors, []);
  assert.deepEqual([...state.hashes.keys()].sort(), [...chain.AMENDABLE].sort());
  for (const [file, hashes] of state.hashes) assert.equal(hashes.length >= 2 && hashes[0] !== hashes[hashes.length - 1], true, file);
});

test('every archived run recomputes (gzip, raw hash, byte count), finished at its expected exit code, is listed in the addendum, and the runs are exactly the expected ones', () => {
  assert.deepEqual(manifestPaths.map((item) => path.basename(item, '.json')).sort(), [...EXPECTED_RUNS], 'the listed runs');
  for (const name of EXPECTED_RUNS) {
    const { manifest } = run(name);
    if (RETAINED_FAILURES.includes(name)) assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 0, false], `${name} is a retained failure`);
    else assert.deepEqual([manifest.exitCode, manifest.timedOut], [manifest.expectedExitCode, false], name);
  }
  for (const folder of ['red', 'green']) {
    const base = path.join(root, 'evidence', 'u040', folder);
    for (const name of fs.readdirSync(base).filter((entry) => entry.endsWith('.json'))) {
      const relative = FILE(`evidence\\u040\\${folder}\\${name}`);
      assert.equal(manifestPaths.includes(relative), true, `${relative} is not listed in the addendum`);
    }
  }
});

test('the REDs ran against the HEAD bytes of server.cjs that the addendum supersedes and failed on assertions only', () => {
  const head = state.hashes.get(FILE('server.cjs'))[0];
  const reds = [...S1_REDS, 'red-04-final-tests-head'].map(run);
  for (const red of reds) {
    assert.equal(red.manifest.exitCode, 1, red.relative);
    assert.equal(inputHash(red.manifest, 'server.cjs'), head, `${red.relative}: not the HEAD bytes`);
    assert.equal(red.manifest.summary.fail > 0 && red.manifest.summary.pass > 0, true, red.relative);
    assert.equal(assertionErrors(red.stdout), red.manifest.summary.fail, `${red.relative}: every failure is an assertion`);
    for (const trap of TRAPS) assert.equal(red.stdout.includes(trap), false, `${red.relative}: ${trap}`);
    assert.match(red.stdout, /1[0-5] of 15 variants created a session/);
  }
  const [first, second, final] = reds;
  for (const file of ['u040-support.cjs', 'u040-fixtures.cjs', 'u040-child.cjs', 'u040-pipelining.test.cjs', 'u040-node-own.test.cjs']) {
    assert.equal(inputHash(second.manifest, `tests\\${file}`), expectedHash(`tests\\${file}`, true), `${file}: the tests of red-02 (S1: the helper and the Node-own suite were changed afterwards)`);
    assert.equal(inputHash(final.manifest, `tests\\${file}`), live(`tests\\${file}`), `${file}: the final tests are the tests of red-04`);
  }
  assert.notEqual(inputHash(first.manifest, 'tests\\u040-fixtures.cjs'), inputHash(second.manifest, 'tests\\u040-fixtures.cjs'), 'red-01 is disclosed as the first version of the tests');
  const counts = (red) => [...red.stdout.matchAll(/(\d+) of 15 variants created a session/g)].map((match) => match[1]);
  assert.deepEqual(counts(final), counts(second), 'the final tests find the same sessions as the tests of red-02');
  // every finding of the third pipelining hole has a test that fails on the old bytes
  const rows = ['legitimate reads pipelined BEFORE a Node-own refusal', 'sockets that each send [G][G][X] in one write'];
  for (const mode of ['in-process', 'separate']) {
    for (const row of rows) assert.equal(final.manifest.summary.notOk.some((name) => name.startsWith(`${mode}: `) && name.includes(row)), true, `red-04 fails ${mode}: ${row}`);
  }
  const old = run('red-03-old-verifier-fixed-server');
  assert.equal(old.manifest.summary.fail, 1);
  assert.equal(shipped(inputHash(old.manifest, 'server.cjs'), 'server.cjs'), true);
  assert.equal(inputHash(old.manifest, 'tests\\evidence-final.test.cjs'), state.hashes.get(FILE('tests\\evidence-final.test.cjs'))[0], 'the old verifier ran');
  assert.match(old.stdout, /server\.cjs is not the shipped file/);
  assert.equal(assertionErrors(old.stdout), 1);
});

const FLAKE_TESTS = Object.freeze([
  'an answer that says Connection: close, followed by a close long after the quiet window, is a close by the server',
  'the last answer decides: a keep-alive answer followed by a refusal that says Connection: close waits for the close',
  'a server that promised Connection: close and never closes ends at the hang guard, and that is not a close'
]);

test('the helper flake: the failed loop ran on the previous helper, red-05 reproduces it deterministically on that helper, and every later capture ran on the fixed one', () => {
  const previous = oldHash(HELPER);
  assert.notEqual(previous, live(HELPER), 'the helper was changed');
  const red = run('red-05-exchange-old-helper');
  const { summary } = red.manifest;
  assert.deepEqual([red.manifest.exitCode, summary.tests, summary.pass, summary.fail, summary.cancelled, summary.skipped, summary.todo], [1, 5, 2, 3, 0, 0, 0]);
  assert.deepEqual(summary.notOk, [...FLAKE_TESTS]);
  assert.equal(assertionErrors(red.stdout), 3);
  for (const trap of TRAPS) assert.equal(red.stdout.includes(trap), false, trap);
  assert.match(red.stdout, /ended by quiet/);
  assert.equal(inputHash(red.manifest, HELPER), previous, 'the RED ran on the previous helper');
  assert.equal(inputHash(red.manifest, 'tests\\u040-exchange.test.cjs'), live('tests\\u040-exchange.test.cjs'));
  assert.equal(inputHash(red.manifest, 'framing.cjs'), live('framing.cjs'));
  assert.equal(inputHash(run('loop-01-64x8').manifest, HELPER), previous, 'the failed loop ran on the previous helper');
  assert.equal(inputHash(run('loop-02-64x4').manifest, HELPER), live(HELPER), 'the clean loop ran on the fixed helper');
  const completed = (name) => Date.parse(run(name).manifest.completedAtUtc);
  const started = (name) => Date.parse(run(name).manifest.startedAtUtc);
  assert.equal(completed('loop-01-64x8') < started('red-05-exchange-old-helper'), true, 'the RED was archived after the loop failed');
  for (const name of ['red-04-final-tests-head', ...S2_FINAL]) assert.equal(completed('red-05-exchange-old-helper') < started(name), true, `the RED was archived before ${name}`);
  const green = run('green-05-u040-suites');
  assert.equal(green.manifest.command.some((argument) => argument.endsWith('u040-exchange.test.cjs')), true, 'the regression test is part of the GREEN run');
  for (const name of FLAKE_TESTS) assert.match(green.stdout, new RegExp(`^ok \\d+ - ${escapeRegex(name)}$`, 'm'), `green-05 passes: ${name}`);
});

test('the final runs hashed the production files that ship, passed, and the replay runs the RED command and tests unchanged', () => {
  for (const name of S2_FINAL) {
    const { manifest } = run(name);
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [0, 0, false], name);
    for (const file of PRODUCTION) assert.equal(shipped(inputHash(manifest, file), file), true, `${name}: ${file} is not the shipped file`);
  }
  const wholes = WHOLE_S2.map(run);
  const coverageRuns = COVERAGE_FILES.map((file) => run(`coverage-s2-${file}`));
  const freshRuns = [run('fresh-03-archive-lf'), run('fresh-04-archive-crlf')];
  for (const whole of [...wholes, ...coverageRuns, ...freshRuns]) {
    const { summary } = whole.manifest;
    assert.deepEqual([summary.fail, summary.cancelled, summary.skipped, summary.todo, summary.pass], [0, 0, 0, 0, summary.tests], whole.relative);
    assert.equal(summary.tests > 150, true, whole.relative);
  }
  assert.equal(new Set([...wholes, ...coverageRuns, ...freshRuns].map((whole) => whole.manifest.summary.tests)).size, 1, 'eight whole-suite runs (one plain, five under coverage, two in a fresh tree) ran the same tests');
  const suitesOf = (manifest) => manifest.command.filter((argument) => argument.endsWith('.test.cjs')).map((argument) => path.basename(argument)).sort();
  const liveSuites = liveSuiteNames();
  for (const whole of [...wholes, ...coverageRuns]) assert.deepEqual(suitesOf(whole.manifest), liveSuites, `${whole.relative}: every suite except the two verifiers`);
  const behaviour = run('green-05-u040-suites');
  assert.deepEqual(suitesOf(behaviour.manifest), ['u040-amendment.test.cjs', 'u040-exchange.test.cjs', 'u040-node-own.test.cjs', 'u040-pipelining.test.cjs']);
  assert.deepEqual([behaviour.manifest.summary.fail, behaviour.manifest.summary.pass], [0, behaviour.manifest.summary.tests]);
  const replay = run('replay-02-red-unchanged');
  const red = run('red-04-final-tests-head');
  assert.deepEqual(replay.manifest.command, red.manifest.command, 'the replay is the RED command');
  const redTests = red.manifest.inputs.filter((entry) => /tests\\u040-/.test(entry.path));
  assert.equal(redTests.length, 5);
  for (const entry of redTests) assert.deepEqual(replay.manifest.inputs.find((candidate) => candidate.path === entry.path), entry, `${entry.path}: the RED tests are replayed unchanged`);
  assert.equal(replay.manifest.summary.tests, red.manifest.summary.tests);
  assert.equal(replay.manifest.summary.fail, 0);
  assert.match(run('syntax-02').stdout, /C026 syntax: \d+ JavaScript files parsed/);
  assert.match(run('browser-02').stdout, /C026 browser GREEN/);
});

test('the first generation of captures (S1) is history: it recomputes, passed or failed as recorded, and differs from the live bytes only by the five superseded files', () => {
  const replay = run('replay-01-red-unchanged');
  const red = run('red-02-final-tests-head');
  assert.deepEqual(replay.manifest.command, red.manifest.command, 'the S1 replay is the S1 RED command');
  const redTests = red.manifest.inputs.filter((entry) => /tests\\u040-/.test(entry.path));
  assert.equal(redTests.length, 5);
  for (const entry of redTests) assert.deepEqual(replay.manifest.inputs.find((candidate) => candidate.path === entry.path), entry, `${entry.path}: the S1 RED tests are replayed unchanged`);
  assert.deepEqual([replay.manifest.summary.tests, replay.manifest.summary.fail], [red.manifest.summary.tests, 0]);
  for (const name of S1_FINAL) {
    const { relative, manifest } = run(name);
    assert.deepEqual(checkRun(relative, read, { inputsLive: true, history: true }), [], name);
    for (const file of PRODUCTION) assert.equal(shipped(inputHash(manifest, file), file), true, `${name}: ${file} is not the shipped file`);
  }
  const suites = ['green-02-whole-suite-1', 'green-03-whole-suite-2', 'green-04-whole-suite-3'].map(run);
  for (const whole of suites) assert.deepEqual([whole.manifest.summary.fail, whole.manifest.summary.pass], [0, whole.manifest.summary.tests], whole.relative);
  assert.match(run('syntax-01').stdout, /C026 syntax: \d+ JavaScript files parsed/);
  assert.match(run('browser-01').stdout, /C026 browser GREEN/);
});

test('every production file has a per-file coverage run with its own row at 85/85/85 or better', () => {
  for (const [prefix, names] of [['coverage-s2-', COVERAGE_FILES.map((file) => `coverage-s2-${file}`)], ['coverage-', COVERAGE_FILES.map((file) => `coverage-${file}`)]]) {
    const rows = new Map();
    for (const name of names) {
      const coverage = run(name);
      const file = coverage.manifest.name.replace(new RegExp(`^${prefix}`), '');
      const row = coverage.manifest.summary.coverageRows.find((entry) => entry.file === file || entry.file.endsWith(`/${file}`));
      assert.equal(Boolean(row) && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, true, `${file}: ${JSON.stringify(row)}`);
      assert.equal(coverage.manifest.command.some((argument) => argument === `--test-coverage-include=capability/C026/${file}`), true, `${file}: one L-0004 command per file`);
      rows.set(file, row);
    }
    assert.deepEqual([...rows.keys()].sort(), [...COVERAGE_FILES], prefix);
  }
});

test('the mutation report is for the shipped server.cjs: the control passed and every mutant was killed by a named failing test', () => {
  const item = addendum.evidence.find((entry) => /mutants-01\.report\.json$/.test(entry.path));
  const report = JSON.parse(read(item.path).toString('utf8'));
  assert.equal(shipped(report.serverSha256, 'server.cjs'), true);
  assert.equal(report.controlPassed, true);
  assert.equal(report.total >= 20 && report.killed === report.total && report.survived.length === 0, true);
  for (const result of report.results.filter((entry) => entry.id !== 'control')) assert.equal(result.killed && result.failedTests.length > 0, true, result.id);
  const output = read(FILE('evidence\\u040\\mutants\\mutants-01.stdout.txt')).toString('utf8');
  assert.match(output, /U040 mutants: \d+ of \d+ killed, survivors \[\], control passed true/);
  assert.equal(addendum.evidence.some((entry) => /mutants-01\.stdout\.txt$/.test(entry.path)), true, 'the console output of the run is listed in the addendum');
});

// By-name checkers over a read function, so that the tamper tests below can feed changed bytes without touching the namespace.
const REPORT = FILE('evidence\\u040\\mutants\\mutants-01.report.json');
// history: accept, for the five superseded files, the hash of their S1 copy as the recorded input (the exemption of the S1 captures only).
function checkRun(relative, readBytes, { inputsLive, history = false }) {
  const bytes = readBytes(relative);
  if (bytes === null) return [`MISSING ${relative}`];
  const manifest = JSON.parse(bytes.toString('utf8'));
  const errors = [];
  if (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut) errors.push(`EXIT_MISMATCH ${relative}`);
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gzPath = `${relative.slice(0, relative.lastIndexOf('\\'))}\\${entry.path}`;
    const gz = readBytes(gzPath);
    if (gz === null || chain.sha(gz) !== entry.gzipSha256) { errors.push(`GZIP_MISMATCH ${gzPath}`); continue; }
    const raw = zlib.gunzipSync(gz);
    if (chain.sha(raw) !== entry.sha256 || raw.length !== entry.bytes) errors.push(`TRANSCRIPT_MISMATCH ${gzPath}`);
  }
  if (inputsLive) {
    const old = history ? copyHashes(readBytes) : new Map();
    for (const entry of manifest.inputs) {
      if (old.get(entry.path) === entry.rawSha256) continue;
      const now = readBytes(entry.path);
      if (now !== null && replacedByFix2(entry.path, entry.rawSha256, now)) continue;
      if (now === null || chain.sha(now) !== entry.rawSha256) errors.push(`INPUT_CHANGED ${entry.path}`);
    }
  }
  return errors;
}
function checkReport(readBytes) {
  const report = JSON.parse(readBytes(REPORT).toString('utf8'));
  const errors = [];
  const liveServer = readBytes(FILE('server.cjs'));
  if (!(report.serverSha256 === chain.sha(liveServer) || replacedByFix2(FILE('server.cjs'), report.serverSha256, liveServer))) errors.push('REPORT_FOR_OTHER_SERVER');
  if (report.controlPassed !== true) errors.push('CONTROL_FAILED');
  if (report.survived.length > 0 || report.killed !== report.total) errors.push('MUTANT_SURVIVED');
  for (const result of report.results.filter((entry) => entry.id !== 'control')) if (!(result.killed && result.failedTests.length > 0)) errors.push(`NOT_KILLED_BY_A_NAMED_TEST ${result.id}`);
  return errors;
}
const overlay = (changes) => (relative) => (changes.has(relative) ? changes.get(relative) : read(relative));
const flip = (relative) => {
  const changed = Buffer.from(read(relative));
  changed[changed.length - 1] ^= 1;
  return changed;
};

test('every recorded input of every final run (README, U040.md, the feature, every test file, every production file) is still the live byte', () => {
  for (const name of S2_FINAL) assert.deepEqual(checkRun(run(name).relative, read, { inputsLive: true }), [], name);
  for (const relative of ['red-01-pipelined-behind-refusal-head', 'red-02-final-tests-head', 'red-04-final-tests-head'].map((name) => run(name).relative)) assert.deepEqual(checkRun(relative, read, { inputsLive: false }), [], relative);
  assert.deepEqual(checkRun(run('red-05-exchange-old-helper').relative, read, { inputsLive: true, history: true }), [], 'red-05 ran on the previous helper and nothing else is changed');
  assert.deepEqual(checkReport(read), []);
});

test('the figures that the README states about the archives are the figures of the archives', () => {
  const readme = read(FILE('README.md')).toString('utf8');
  const one = run('red-01-pipelined-behind-refusal-head');
  const two = run('red-02-final-tests-head');
  const final = run('red-04-final-tests-head');
  const counts = (red) => [...red.stdout.matchAll(/(\d+) of 15 variants created a session/g)].map((match) => match[1]);
  const [a, b] = counts(one);
  const [c, d] = counts(two);
  assert.equal(readme.includes(`${a} of 15 variants creating a session in this process and ${b} of 15 in the separate process for \`red-01\`, and ${c} and ${d} for \`red-02\``), true, 'the RED counts of the README');
  assert.deepEqual(counts(final), [c, d], 'the final RED finds the same figures as red-02');
  const report = JSON.parse(read(REPORT).toString('utf8'));
  assert.equal(readme.includes(`${report.total} hand-chosen mutants of the added guard lines were all killed by named tests`), true, 'the mutant count of the README');
  assert.equal(two.manifest.summary.notOk.filter((name) => /^in-process: after a .+ nothing pipelined behind it upgrades or runs/.test(name)).length, 13);
  assert.equal(readme.includes('over 13 refusals'), true, 'the refusal count of the README');
  assert.equal(readme.includes('56 rows per mode'), true, 'the README states the rows for legitimate reads before a Node-own refusal');
  const replay = run('replay-02-red-unchanged');
  for (const mode of ['in-process', 'separate']) {
    assert.match(replay.stdout, new RegExp(`^ok \\d+ - ${mode}: legitimate reads pipelined BEFORE a Node-own refusal are answered in order, then the typed refusal, then the connection is closed$`, 'm'));
    assert.match(replay.stdout, new RegExp(`^ok \\d+ - ${mode}: 128 sockets that each send \\[G\\]\\[G\\]\\[X\\] in one write are all ended by the server, and a legitimate read is answered afterwards$`, 'm'));
  }
  assert.match(replay.stdout, /^ok \d+ - control: a plain node:http server also answers at most the first earlier read/m);
});

// The extra captures of the pre-publication self-review: a fresh checkout (a scratch tree built from git archive of the committed blobs,
// then the same tree with its source text converted to CRLF) and the two behaviour suites run 64 times, 8 at a time. Checkers over the
// transcript text, so that the tamper test below can feed changed text. Neither capture runs the two evidence verifiers: they need the
// addendum that lists these very captures.
const FRESH_IMPORTS = Object.freeze(['capability/C001/approved-contract.js', 'capability/C001/contract-guard.js']);
function checkFresh(mode, manifest, text, { tests, suites }) {
  const errors = [];
  const { summary } = manifest;
  const prefix = `U040 fresh-tree ${mode}: `;
  if (manifest.exitCode !== 0 || manifest.timedOut) errors.push(`FRESH_EXIT ${mode}`);
  if (manifest.command[1]?.endsWith('u040-fresh-tree.cjs') !== true || manifest.command[3] !== mode) errors.push(`FRESH_COMMAND ${mode}`);
  if ([summary.tests, summary.pass].some((value) => value !== tests) || [summary.fail, summary.cancelled, summary.skipped, summary.todo].some((value) => value !== 0)) errors.push(`FRESH_COUNTS ${mode}`);
  if (!new RegExp(`^${prefix}git archive of [0-9a-f]{40}: \\d+ files, each equal to its committed blob \\(core\\.autocrlf=false\\)$`, 'm').test(text)) errors.push(`FRESH_NOT_A_GIT_ARCHIVE ${mode}`);
  const listed = (kind) => [...text.matchAll(new RegExp(`^${prefix}  ${kind} (\\S+)$`, 'gm'))].map((match) => match[1].replace(/\//g, '\\')).sort();
  if (JSON.stringify(listed('modified')) !== JSON.stringify([...chain.AMENDABLE].sort()) || listed('removed').length !== 0) errors.push(`FRESH_OVERLAY_IS_NOT_THE_AMENDED_FILES ${mode}`);
  const converted = new RegExp(`^${prefix}converted to CRLF: (\\d+) files(?: \\((.+)\\))?$`, 'm').exec(text);
  const expected = mode === 'crlf' ? FRESH_IMPORTS : [];
  if (converted === null || Number(converted[1]) !== expected.length || JSON.stringify((converted[2] ?? '').split(', ').filter(Boolean).sort()) !== JSON.stringify(expected)) errors.push(`FRESH_CONVERSION ${mode}`);
  for (const file of FRESH_IMPORTS) {
    const counts = new RegExp(`^${prefix}${file.replace(/\./g, '\\.')}: (\\d+) CRLF lines, (\\d+) LF-only lines$`, 'm').exec(text);
    const [crlf, lf] = (counts ?? []).slice(1).map(Number);
    if (counts === null || !(mode === 'lf' ? crlf === 0 && lf > 0 : crlf > 0 && lf === 0)) errors.push(`FRESH_LINE_ENDINGS ${mode} ${file}`);
  }
  const ran = new RegExp(`^${prefix}running (\\d+) suites in the scratch tree`, 'm').exec(text);
  if (ran === null || Number(ran[1]) !== suites) errors.push(`FRESH_SUITES ${mode}`);
  if (!new RegExp(`^${prefix}the suites exited with 0$`, 'm').test(text)) errors.push(`FRESH_SUITES_EXIT ${mode}`);
  return errors;
}
const LOOP_ROW = /^run (\d+)\/(\d+) exit=(\S+) tests=(\d+) pass=(\d+) fail=(\d+) cancelled=(\d+) skipped=(\d+) todo=(\d+) timedOut=(true|false) ms=\d+$/gm;
const loopHeader = (runs, parallel) => new RegExp(`^U040 loop: ${runs} runs of u040-pipelining\\.test\\.cjs \\+ u040-node-own\\.test\\.cjs, ${parallel} at once, \\d+ logical processors$`, 'm');
function checkLoop(text, { runs, parallel, tests }) {
  const errors = [];
  if (!loopHeader(runs, parallel).test(text)) errors.push('LOOP_HEADER');
  const rows = new Map();
  for (const match of text.matchAll(LOOP_ROW)) rows.set(Number(match[1]), match.slice(2).join(' '));
  const clean = [runs, 0, tests, tests, 0, 0, 0, 0, 'false'].join(' ');
  for (let index = 1; index <= runs; index += 1) {
    if (!rows.has(index)) errors.push(`LOOP_RUN_MISSING ${index}`);
    else if (rows.get(index) !== clean) errors.push(`LOOP_RUN_NOT_CLEAN ${index}`);
  }
  if (text.includes('FAILED TESTS')) errors.push('LOOP_FAILED_TESTS');
  if (!new RegExp(`^U040 loop: runs=${runs} parallel=${parallel} ok=${runs} failed=0 testsPerRun=\\[${tests}\\] `, 'm').test(text)) errors.push('LOOP_SUMMARY');
  return errors;
}
// The retained failed loop: exactly one run failed, on one named assertion of the first helper, and every other run was clean.
const FAILED_LOOP_TEST = 'separate: controls that already held: an HTTP/1.0 refusal without keep-alive and a refused upgrade end the connection, nothing behind them is parsed';
function checkFailedLoop(text, stderr, { runs, parallel, tests }) {
  const errors = [];
  if (!loopHeader(runs, parallel).test(text)) errors.push('LOOP_HEADER');
  const rows = [...text.matchAll(LOOP_ROW)];
  if (rows.length !== runs) errors.push('LOOP_ROWS');
  const clean = [runs, 0, tests, tests, 0, 0, 0, 0, 'false'].join(' ');
  const unclean = rows.filter((match) => match.slice(2).join(' ') !== clean);
  if (unclean.length !== 1) return [...errors, `LOOP_UNCLEAN_RUNS ${unclean.length}`];
  const [, index, , exit, total, pass, fail, cancelled, skipped, todo, timedOut] = unclean[0];
  if (JSON.stringify([exit, Number(total), Number(pass), Number(fail), cancelled, skipped, todo, timedOut]) !== JSON.stringify(['1', tests, tests - 1, 1, '0', '0', '0', 'false'])) errors.push('LOOP_FAILED_RUN_SHAPE');
  const named = new RegExp(`^run ${index}/${runs} FAILED TESTS: (.+)$`, 'm').exec(text);
  if (named === null || JSON.stringify(JSON.parse(named[1])) !== JSON.stringify([FAILED_LOOP_TEST])) errors.push('LOOP_FAILED_TEST_NAME');
  for (const needle of [`--- run ${Number(index)} stdout`, "name: 'AssertionError'", 'u040-pipelining.test.cjs:94', 'false !== true']) if (!stderr.includes(needle)) errors.push(`LOOP_FAILURE_EVIDENCE ${needle}`);
  if (!new RegExp(`^U040 loop: runs=${runs} parallel=${parallel} ok=${runs - 1} failed=1 testsPerRun=\\[${tests}\\] `, 'm').test(text)) errors.push('LOOP_SUMMARY');
  return errors;
}

test('the fresh checkout: a scratch tree built from git archive passes every suite, in LF and again with the source text converted to CRLF', () => {
  const whole = run(WHOLE_S2[0]);
  const suites = whole.manifest.command.filter((argument) => argument.endsWith('.test.cjs')).length;
  assert.equal(suites, liveSuiteNames().length);
  assert.equal(suites, 16);
  const runs = [run('fresh-03-archive-lf'), run('fresh-04-archive-crlf')];
  assert.deepEqual(manifestPaths.filter((item) => /\\fresh-/.test(item)).map((item) => path.basename(item, '.json')).sort(), ['fresh-01-archive-lf', 'fresh-02-archive-crlf', 'fresh-03-archive-lf', 'fresh-04-archive-crlf']);
  runs.forEach((entry, position) => {
    const mode = ['lf', 'crlf'][position];
    assert.deepEqual(checkFresh(mode, entry.manifest, entry.stdout, { tests: whole.manifest.summary.tests, suites }), [], entry.relative);
    assert.deepEqual(checkRun(entry.relative, read, { inputsLive: true }), [], entry.relative);
    for (const name of [...PRODUCTION, 'tests\\u040-fresh-tree.cjs']) assert.equal(shipped(inputHash(entry.manifest, name), name), true, `${entry.relative}: ${name} is not the shipped file`);
  });
});

test('the loop: the two behaviour suites ran 64 times, 4 at a time, and every run was clean with the test count of the replay', () => {
  const replay = run('replay-02-red-unchanged');
  const loop = run('loop-02-64x4');
  assert.deepEqual(manifestPaths.filter((item) => /\\loop-/.test(item)).map((item) => path.basename(item)).sort(), ['loop-01-64x8.json', 'loop-02-64x4.json']);
  assert.deepEqual(checkLoop(loop.stdout, { runs: 64, parallel: 4, tests: replay.manifest.summary.tests }), []);
  assert.deepEqual([loop.manifest.command[1].endsWith('u040-loop.cjs'), loop.manifest.command[2], loop.manifest.command[3]], [true, '64', '4']);
  assert.deepEqual(checkRun(loop.relative, read, { inputsLive: true }), []);
  for (const name of [...PRODUCTION, 'tests\\u040-loop.cjs']) assert.equal(shipped(inputHash(loop.manifest, name), name), true, `${loop.relative}: ${name} is not the shipped file`);
});

test('the three failed attempts are retained: the fresh checkout hit the driver\'s path guard twice and the first loop failed one run on the first helper; the retries differ as stated', () => {
  const driver = 'tests\\u040-fresh-tree.cjs';
  for (const [first, second] of [['fresh-01-archive-lf', 'fresh-03-archive-lf'], ['fresh-02-archive-crlf', 'fresh-04-archive-crlf']]) {
    const failed = run(first);
    const retry = run(second);
    assert.deepEqual(checkRun(failed.relative, read, { inputsLive: true, history: true }), [`EXIT_MISMATCH ${failed.relative}`], 'only the exit code differs from the expected one');
    assert.deepEqual([failed.manifest.exitCode, failed.manifest.timedOut, failed.manifest.summary.tests], [1, false, undefined], `${failed.relative}: no suite ran`);
    assert.match(failed.stderr, /Error: the longest path in the scratch tree has 241 characters \(budget 240\): use a shorter scratch directory/);
    assert.match(failed.stdout, /git archive of [0-9a-f]{40}: \d+ files, each equal to its committed blob/);
    assert.deepEqual([retry.manifest.command[1], retry.manifest.command[3]], [failed.manifest.command[1], failed.manifest.command[3]], 'the same driver and mode');
    assert.equal(retry.manifest.command[2].length < failed.manifest.command[2].length, true, 'a shorter scratch directory');
    assert.equal(inputHash(retry.manifest, driver), inputHash(failed.manifest, driver), 'the same driver bytes');
  }
  const failedLoop = run('loop-01-64x8');
  const retryLoop = run('loop-02-64x4');
  assert.deepEqual(checkRun(failedLoop.relative, read, { inputsLive: true, history: true }), [`EXIT_MISMATCH ${failedLoop.relative}`]);
  assert.deepEqual(checkFailedLoop(failedLoop.stdout, failedLoop.stderr, { runs: 64, parallel: 8, tests: run('replay-01-red-unchanged').manifest.summary.tests }), []);
  assert.deepEqual([retryLoop.manifest.command[1], retryLoop.manifest.command[2], failedLoop.manifest.command[3], retryLoop.manifest.command[3]], [failedLoop.manifest.command[1], failedLoop.manifest.command[2], '8', '4'], 'the retry is the same driver and run count with the campaign limit of 4 workers instead of 8');
  assert.equal(inputHash(retryLoop.manifest, 'tests\\u040-loop.cjs'), inputHash(failedLoop.manifest, 'tests\\u040-loop.cjs'), 'the same driver bytes');
});

test('the one exemption of the S1 captures: exactly five superseded files, each pinned by its byte-exact copy, and nothing else may differ', () => {
  const files = Object.keys(SUPERSEDED_COPIES);
  assert.equal(files.length, 5);
  for (const file of files) {
    const name = file.replace('capability\\C026\\', '');
    assert.notEqual(oldHash(name), live(name), `${name} was superseded`);
    const recorded = S1_FINAL.map((item) => inputHash(run(item).manifest, name)).filter((hash) => hash !== undefined);
    assert.equal(recorded.length >= 10, true, `${name}: pinned by the S1 captures`);
    assert.deepEqual([...new Set(recorded)], [oldHash(name)], `${name}: every S1 capture recorded exactly the bytes of the archived copy`);
    for (const item of S2_FINAL) assert.equal(shipped(inputHash(run(item).manifest, name), name), true, `${item}: ${name} is the live byte, or the byte that addendum 2 names as replaced (no S1 exemption for S2)`);
  }
  const first = run('green-01-u040-suites').relative;
  assert.deepEqual(checkRun(first, read, { inputsLive: true, history: true }), []);
  assert.deepEqual(checkRun(first, read, { inputsLive: true }).sort(), files.map((file) => `INPUT_CHANGED ${file}`).sort(), 'without the exemption exactly the five files differ');
});

test('tampering with the extra captures is detected by name: a failed loop run, a missing one, another worker count, another test count, a tree that is not from git archive, a lost conversion', () => {
  const loop = run('loop-02-64x4');
  const replay = run('replay-02-red-unchanged');
  const whole = run(WHOLE_S2[0]);
  const [lf, crlf] = [run('fresh-03-archive-lf'), run('fresh-04-archive-crlf')];
  const n = replay.manifest.summary.tests;
  const loopOptions = { runs: 64, parallel: 4, tests: n };
  assert.deepEqual(checkLoop(loop.stdout, loopOptions), []);
  assert.deepEqual(checkLoop(loop.stdout.replace('run 07/64 exit=0 ', 'run 07/64 exit=1 '), loopOptions), ['LOOP_RUN_NOT_CLEAN 7']);
  assert.deepEqual(checkLoop(loop.stdout.replace(/^run 12\/64 .*\n/m, ''), loopOptions), ['LOOP_RUN_MISSING 12']);
  assert.deepEqual(checkLoop(loop.stdout.replace(', 4 at once,', ', 2 at once,'), loopOptions), ['LOOP_HEADER']);
  assert.deepEqual(checkLoop(loop.stdout.replace('failed=0 testsPerRun', 'failed=1 testsPerRun'), loopOptions), ['LOOP_SUMMARY']);
  assert.deepEqual(checkLoop(`${loop.stdout}run 03/64 FAILED TESTS: ["x"]\n`, loopOptions), ['LOOP_FAILED_TESTS']);
  const first = Number(/^run (\d+)\/64 /m.exec(loop.stdout)[1]);
  assert.deepEqual(checkLoop(loop.stdout.replace(/^(run \d+\/64 exit=0 tests=)\d+( pass=)\d+/m, `$1${n + 1}$2${n + 1}`), loopOptions), [`LOOP_RUN_NOT_CLEAN ${first}`]);
  const failed = run('loop-01-64x8');
  const failedOptions = { runs: 64, parallel: 8, tests: run('replay-01-red-unchanged').manifest.summary.tests };
  assert.deepEqual(checkFailedLoop(failed.stdout, failed.stderr, failedOptions), []);
  assert.deepEqual(checkFailedLoop(failed.stdout.replace('run 36/64 exit=1', 'run 36/64 exit=0'), failed.stderr, failedOptions), ['LOOP_FAILED_RUN_SHAPE']);
  assert.deepEqual(checkFailedLoop(failed.stdout.replace('controls that already held', 'another test'), failed.stderr, failedOptions), ['LOOP_FAILED_TEST_NAME']);
  assert.deepEqual(checkFailedLoop(failed.stdout, failed.stderr.replace('false !== true', 'true !== true'), failedOptions), ['LOOP_FAILURE_EVIDENCE false !== true']);
  assert.deepEqual(checkFailedLoop(loop.stdout, '', loopOptions).includes('LOOP_UNCLEAN_RUNS 0'), true, 'a clean loop is not a retained failure');
  const options = { tests: whole.manifest.summary.tests, suites: 16 };
  assert.deepEqual(checkFresh('lf', lf.manifest, lf.stdout, options), []);
  assert.deepEqual(checkFresh('crlf', crlf.manifest, crlf.stdout, options), []);
  assert.deepEqual(checkFresh('lf', lf.manifest, lf.stdout.replace('git archive of', 'copy of'), options), ['FRESH_NOT_A_GIT_ARCHIVE lf']);
  assert.deepEqual(checkFresh('crlf', crlf.manifest, crlf.stdout.replace(/converted to CRLF: 2 files \(.*\)/, 'converted to CRLF: 0 files'), options), ['FRESH_CONVERSION crlf']);
  assert.deepEqual(checkFresh('lf', lf.manifest, lf.stdout.replace('  modified capability/C026/server.cjs', '  modified capability/C026/framing.cjs'), options), ['FRESH_OVERLAY_IS_NOT_THE_AMENDED_FILES lf']);
  assert.deepEqual(checkFresh('crlf', { ...crlf.manifest, summary: { ...crlf.manifest.summary, pass: options.tests - 1 } }, crlf.stdout, options), ['FRESH_COUNTS crlf']);
  assert.deepEqual(checkFresh('crlf', { ...crlf.manifest, exitCode: 1 }, crlf.stdout, options), ['FRESH_EXIT crlf']);
  assert.equal(checkFresh('lf', crlf.manifest, crlf.stdout, options).length > 0, true, 'the CRLF transcript is not an LF run');
});

test('tampering with an archive is detected by name: a flipped transcript byte, a changed input, a changed manifest, a changed report, a changed superseded copy', () => {
  const relative = run('green-05-u040-suites').relative;
  const manifest = JSON.parse(read(relative).toString('utf8'));
  const gzPath = `${relative.slice(0, relative.lastIndexOf('\\'))}\\${manifest.transcripts.stdout.path}`;
  const flipped = Buffer.from(read(gzPath));
  flipped[flipped.length - 9] ^= 1;
  assert.deepEqual(checkRun(relative, overlay(new Map([[gzPath, flipped]])), { inputsLive: true }), [`GZIP_MISMATCH ${gzPath}`]);
  for (const file of ['README.md', 'U040.md', 'U040.feature', 'tests\\u040-fixtures.cjs', 'tests\\support.cjs', 'tests\\u040-support.cjs', 'tests\\u040-node-own.test.cjs', 'server.cjs']) {
    const changed = Buffer.concat([read(FILE(file)), Buffer.from(' ')]);
    assert.deepEqual(checkRun(relative, overlay(new Map([[FILE(file), changed]])), { inputsLive: true }), [`INPUT_CHANGED ${FILE(file)}`], file);
  }
  const wrongExit = Buffer.from(JSON.stringify({ ...manifest, exitCode: 1 }));
  assert.deepEqual(checkRun(relative, overlay(new Map([[relative, wrongExit]])), { inputsLive: true }), [`EXIT_MISMATCH ${relative}`]);
  assert.deepEqual(checkRun(`${relative}.missing`, read, { inputsLive: true }), [`MISSING ${relative}.missing`]);
  const first = run('green-01-u040-suites').relative;
  for (const [file, copy] of Object.entries(SUPERSEDED_COPIES)) {
    assert.deepEqual(checkRun(first, overlay(new Map([[copy, flip(copy)]])), { inputsLive: true, history: true }), [`INPUT_CHANGED ${file}`], `a changed copy of ${file}`);
  }
  const unexempt = Buffer.concat([read(FILE('server.cjs')), Buffer.from(' ')]);
  assert.deepEqual(checkRun(first, overlay(new Map([[FILE('server.cjs'), unexempt]])), { inputsLive: true, history: true }), [`INPUT_CHANGED ${FILE('server.cjs')}`], 'the exemption covers no other file');
  assert.deepEqual(checkRun(first, overlay(new Map([[SUPERSEDED_COPIES[FILE(HELPER)], null]])), { inputsLive: true, history: true }), [`INPUT_CHANGED ${FILE(HELPER)}`], 'a missing copy');
  const report = JSON.parse(read(REPORT).toString('utf8'));
  const survivor = Buffer.from(JSON.stringify({ ...report, killed: report.total - 1, survived: ['M03'] }));
  assert.deepEqual(checkReport(overlay(new Map([[REPORT, survivor]]))), ['MUTANT_SURVIVED']);
  const unnamed = JSON.parse(JSON.stringify(report));
  unnamed.results[2].failedTests = [];
  assert.deepEqual(checkReport(overlay(new Map([[REPORT, Buffer.from(JSON.stringify(unnamed))]]))), [`NOT_KILLED_BY_A_NAMED_TEST ${unnamed.results[2].id}`]);
  assert.deepEqual(checkReport(overlay(new Map([[FILE('server.cjs'), Buffer.from('other')]]))), ['REPORT_FOR_OTHER_SERVER']);
  assert.deepEqual(checkReport(overlay(new Map([[REPORT, Buffer.from(JSON.stringify({ ...report, controlPassed: false }))]]))), ['CONTROL_FAILED']);
});
