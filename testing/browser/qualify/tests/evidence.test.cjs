'use strict';

// Evidence integrity of the second fix (review R3) on top of the first (R2): recomputes every hash of every archive of both fixes
// and fails when anything is tampered with. The first-publication evidence is immutable and is not touched here.
// THE TRUST ANCHORS ARE CONSTANTS OF THIS FILE (L-0103), never read from the data they check: the sealed list qualified.json, the
// verifier addendum.cjs and the version parser it uses are pinned by hash (CRLF turned into LF). The live addendum
// qualified.addendum.jsonl is verified by its hash chain through that pinned verifier and never by its bytes: a newly qualified
// major is APPENDED with addendum.cjs --report and this test stays green, while an edited, deleted or reordered earlier line, an
// edited sealed list or an edited verifier fails it by name. Tamper cases run on a scratch copy.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { scratchDir, removeDir } = require('./harness.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const NAMESPACE = path.join(REPO, 'testing', 'browser', 'qualify');
const EVIDENCE = path.join(NAMESPACE, 'evidence');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

const PIN = {
  'qualified.json': '4adcb09ecbbc4da65f9854d64c2cff80dff869f7ded1f52f7b4926391d4ace6c',
  'addendum.cjs': 'bed1169ef8a5ed9bfdfdf31bf00ef715d0ecf8cc15c2164c5cf7383529682623',
  'version.cjs': '96223af0f23a683dabe3c9aaceb535e12725bb7d4c586831983925a5aeff6265',
};

// The archives of this very test and of the proof that runs it cannot exist while they are being captured, so they are optional.
const OPTIONAL = ['green-fix2-04-evidence-tests', 'green-fix2-05-amend-proof'];
// A retained failed attempt is kept as it was recorded (never rewritten) and its successful retry carries the next number.
const RETAINED_FAILED = {
  'coverage-adapters': 'a shell that hangs past the timeout is ended and fails with SHELL_TIMEOUT',
  'fix-cli-02-requalify-current-edge': null,
  // the second fix: one timing-sensitive test of the hung shell failed on a machine that three heavy runs and a mutation run shared:
  // the outer bound (2000 ms) fired before the shell bound (1500 ms) because the spawn itself took longer than 500 ms; the retry passed
  'coverage-fix2-adapters': 'the option shortens both waits: a hung shell is ended at 75 percent of the outer bound and both answers time out',
};
// The first RED archive of the helper pinned a test file whose crash scenario reused a refused report (a test bug found when the
// real module was written); it is kept, and the retry pins the corrected bytes.
const RETAINED_SUPERSEDED_RED = { 'red-fix2-n1-addendum-module': 'red-fix2-n1-addendum-module-retry' };
const EXPECTED = {
  red1: ['red-fix-f1-subject-lookalike', 'red-fix-f2-requalify-verdict', 'red-fix-f3-f6-cli-contract', 'red-fix-f4-second-digest'],
  red2: ['red-fix2-n1-addendum-module', 'red-fix2-n1-addendum-module-retry', 'red-fix2-n1-qualify-addendum', 'red-fix2-n1-evidence-amend', 'red-fix2-n3-timeouts', 'red-fix2-n5-cli-catch'],
  fix1: ['green-fix-01-hermetic-suite', 'green-fix-02-replay-f1', 'green-fix-02-replay-f2', 'green-fix-02-replay-f3-f6', 'green-fix-02-replay-f4',
    'green-fix-03-machine-test', 'green-fix-04-evidence-test', 'green-fix-05-survivor-tests', 'coverage-adapters', 'coverage-adapters-2', 'coverage-cli', 'coverage-qualify',
    'coverage-requalify', 'coverage-subject', 'coverage-version', 'fix-cli-01-qualify-current-edge', 'fix-cli-02-requalify-current-edge', 'fix-cli-03-requalify-current-edge',
    'fix-mutation-run'],
  fix2: ['coverage-fix2-adapters', 'coverage-fix2-adapters-2', 'coverage-fix2-addendum', 'coverage-fix2-cli', 'coverage-fix2-qualify', 'coverage-fix2-requalify', 'coverage-fix2-subject',
    'coverage-fix2-version', 'fix2-mutation-run', 'green-fix2-01-hermetic-suite', 'green-fix2-02-replay-n1-addendum',
    'green-fix2-02-replay-n1-qualify', 'green-fix2-02-replay-n3-timeouts', 'green-fix2-02-replay-n5-cli-catch', 'green-fix2-02-guards-n2-n4',
    'green-fix2-03-machine-test', 'fix2-cli-01-qualify-current-edge'],
};
// Files that the second fix changed after the first fix archived them: their OLD pins are expected to differ. Every entry must really
// differ from an old pin (no stale entry) and must be pinned again, at its current bytes, by an archive of the second fix.
const SUPERSEDED = {
  'testing\\browser\\qualify\\README.md': 'rewritten: the addendum procedure, the corrected mutation and cost figures, the second fix',
  'testing\\browser\\qualify\\adapters.cjs': 'readQualified reads the addendum; the shell bound is 180 s',
  'testing\\browser\\qualify\\cli.cjs': '--timeout-ms and the catch at the top of main',
  'testing\\browser\\qualify\\qualify.cjs': 'timeouts, QUALIFIED_ADDENDUM_INVALID, qualifiedVia, the entry catch',
  'testing\\browser\\qualify\\tests\\cli.test.cjs': 'parseArgs has the new option timeoutMs',
  'testing\\browser\\qualify\\tests\\qualify.machine.test.cjs': 'a major that is only in the addendum qualifies the real Edge',
  'testing\\browser\\qualify\\tests\\mutation\\mutants.cjs': '57 new mutants, M03 follows the changed code',
  'testing\\browser\\qualify\\tests\\mutation\\mutate.cjs': 'the survivors file and the new test files are part of the order',
  'testing\\browser\\qualify\\tests\\evidence.test.cjs': 'amendment-aware: pins, chain, the sets of both fixes',
};
// The new evidence test is pinned by its own archive, which is captured last.
const SELF = 'testing\\browser\\qualify\\tests\\evidence.test.cjs';

function manifestsIn(directory, kind, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) manifestsIn(full, kind, found);
    else if (entry.name.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (data && data.transcripts && Array.isArray(data.inputs)) found.push({ file: full, dir: directory, data, kind });
    }
  }
  return found;
}

// The scratch copies of evidence-amend.test.cjs only need the amendment checks and the sets, so they skip the four slow recomputations
// (a hundred hashes, the README figures, every file, the tamper cases per kind), which run in full on the real tree and, with
// EVIDENCE_FULL=1, in amend-proof.test.cjs.
const QUICK = { skip: /[\\/]scratch-/.test(__dirname) && process.env.EVIDENCE_FULL !== '1' ? 'a scratch copy checks the amendment and the sets; the full recomputation runs on the real tree' : false };

const redDirs = (prefix) => fs.readdirSync(path.join(EVIDENCE, 'red')).filter((name) => name.startsWith(prefix));
const allManifests = () => [
  ...redDirs('fix-').flatMap((name) => manifestsIn(path.join(EVIDENCE, 'red', name), 'red1')),
  ...redDirs('fix2-').flatMap((name) => manifestsIn(path.join(EVIDENCE, 'red', name), 'red2')),
  ...manifestsIn(path.join(EVIDENCE, 'fix-1'), 'fix1'),
  ...manifestsIn(path.join(EVIDENCE, 'fix-2'), 'fix2'),
];

// The pinned inputs of one manifest differ from the live files only where this test says so: a RED pins only the tests it ran
// (the production code it ran against is the code before its fix), an archive of the first fix may differ in SUPERSEDED files,
// an archive of the second fix pins everything strictly.
function pinProblems({ data, kind }, root, name) {
  const problems = [];
  if (Object.hasOwn(RETAINED_SUPERSEDED_RED, data.name)) return problems;
  for (const input of data.inputs) {
    if ((kind === 'red1' || kind === 'red2') && !/\\tests\\/.test(input.path)) continue;
    if (kind !== 'fix2' && Object.hasOwn(SUPERSEDED, input.path)) continue;
    const current = fs.existsSync(path.join(root, input.path)) ? fs.readFileSync(path.join(root, input.path)) : null;
    if (current === null) problems.push(`${name}: ${input.path} is missing`);
    else if (sha(current) !== input.rawSha256 && sha(lf(current)) !== input.crlfToLfSha256) problems.push(`${name}: ${input.path} differs from its pin`);
  }
  return problems;
}

// Returns the list of problems of one manifest; root is the repository root the pinned inputs are resolved against.
function verify(manifest, root = REPO) {
  const { file, dir, data } = manifest;
  const problems = [];
  const name = path.basename(file);
  for (const stream of ['stdout', 'stderr']) {
    const t = data.transcripts[stream];
    const gz = fs.existsSync(path.join(dir, t.path)) ? fs.readFileSync(path.join(dir, t.path)) : null;
    if (gz === null) { problems.push(`${name}: ${stream} transcript missing`); continue; }
    if (sha(gz) !== t.gzipSha256) problems.push(`${name}: ${stream} gzip hash differs`);
    let raw = null;
    try { raw = zlib.gunzipSync(gz); } catch { problems.push(`${name}: ${stream} is not gzip`); }
    if (raw !== null && (sha(raw) !== t.sha256 || raw.length !== t.bytes)) problems.push(`${name}: ${stream} raw hash or size differs`);
  }
  const retained = Object.hasOwn(RETAINED_FAILED, data.name);
  const ended = retained ? data.exitCode === 1 : data.exitCode === data.expectedExitCode;
  if (!ended || data.timedOut !== false || data.spawnError !== null) problems.push(`${name}: the run did not end as expected`);
  return [...problems, ...pinProblems(manifest, root, name)];
}

// The sealed list, the verifier and the version parser must be the pinned bytes; the live addendum must be a valid chain.
function amendmentProblems(root = REPO) {
  const namespace = path.join(root, 'testing', 'browser', 'qualify');
  const problems = [];
  for (const [name, pin] of Object.entries(PIN)) {
    const file = path.join(namespace, name);
    if (!fs.existsSync(file)) problems.push(`${name}: the file is missing`);
    else if (sha(lf(fs.readFileSync(file))) !== pin) problems.push(`${name}: differs from the pin in tests\\evidence.test.cjs`);
  }
  if (problems.length > 0) return problems;
  const verifier = require(path.join(namespace, 'addendum.cjs'));
  const checked = verifier.verifyFiles({ qualifiedFile: path.join(namespace, 'qualified.json'), addendumFile: path.join(namespace, 'qualified.addendum.jsonl') });
  return checked.ok ? [] : [`qualified.addendum.jsonl: ${checked.code}: ${checked.error}`];
}

test('the sealed list, the verifier and the live addendum are what the pins and the hash chain say', () => {
  assert.deepEqual(amendmentProblems(), []);
});

test('the archives are exactly the expected sets (a removed or renamed archive fails)', () => {
  const found = allManifests();
  const names = (kind) => found.filter((manifest) => manifest.kind === kind).map((manifest) => manifest.data.name);
  assert.deepEqual(names('red1').sort(), [...EXPECTED.red1].sort());
  assert.deepEqual(names('red2').sort(), [...EXPECTED.red2].sort());
  assert.deepEqual(names('fix1').sort(), [...EXPECTED.fix1].sort());
  const second = names('fix2');
  assert.deepEqual(second.filter((name) => !OPTIONAL.includes(name)).sort(), [...EXPECTED.fix2].sort());
  assert.ok(second.every((name) => EXPECTED.fix2.includes(name) || OPTIONAL.includes(name)));
});

test('every hash of every archive is recomputed: transcripts, exit codes and the pinned inputs', QUICK, () => {
  for (const manifest of allManifests()) assert.deepEqual(verify(manifest), [], manifest.data.name);
});

test('the list of superseded files is tight: each entry differs from an old pin and is pinned again by the second fix', () => {
  const found = allManifests();
  const old = found.filter((manifest) => manifest.kind !== 'fix2');
  const second = found.filter((manifest) => manifest.kind === 'fix2');
  for (const file of Object.keys(SUPERSEDED)) {
    const live = fs.readFileSync(path.join(REPO, file));
    const pins = old.flatMap((manifest) => manifest.data.inputs.filter((input) => input.path === file));
    assert.ok(pins.some((input) => sha(live) !== input.rawSha256 && sha(lf(live)) !== input.crlfToLfSha256), `${file} is listed but never differed from an old pin`);
    if (file === SELF) continue;
    const again = second.flatMap((manifest) => manifest.data.inputs.filter((input) => input.path === file));
    assert.ok(again.some((input) => sha(live) === input.rawSha256 || sha(lf(live)) === input.crlfToLfSha256), `${file} is not pinned at its current bytes by the second fix`);
  }
});

test('a retained RED failed for assertions, a GREEN passed with no failure, and the coverage runs met 85/85/85', () => {
  for (const { data, kind } of allManifests()) {
    if (Object.hasOwn(RETAINED_FAILED, data.name)) {
      if (RETAINED_FAILED[data.name] !== null) assert.deepEqual(data.summary.notOk, [RETAINED_FAILED[data.name]], data.name);
      continue;
    }
    if (kind === 'red1' || kind === 'red2') {
      assert.equal(data.exitCode, 1, data.name);
      assert.ok(data.summary.fail > 0 && data.summary.notOk.length === Math.min(data.summary.fail, 60), data.name);
    } else if (/^(green|coverage)-/.test(data.name)) {
      assert.equal(data.summary.fail, 0, data.name);
      assert.equal(data.summary.pass, data.summary.tests, data.name);
      assert.ok(data.summary.tests > 0 && data.summary.skipped === 0 && data.summary.todo === 0 && data.summary.cancelled === 0, data.name);
    }
    if (/^coverage-/.test(data.name)) {
      const production = data.name.replace(/^coverage-(fix2-)?/, '').replace(/-\d+$/, '');
      const row = data.summary.coverageRows.find((candidate) => candidate.file.endsWith(`${production}.cjs`));
      assert.ok(row && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, data.name);
    }
  }
});

function assertRequalified(report, { newMajor = false } = {}) {
  // A requalification of a major that is not listed yet fails with MAJOR_NOT_QUALIFIED only: that report is the evidence for adding it.
  assert.equal(report.ok, !newMajor);
  assert.deepEqual(report.reasonCodes, newMajor ? ['MAJOR_NOT_QUALIFIED'] : []);
  assert.equal(report.requalification.passed, true);
  assert.ok(report.requalification.suites.length >= 2);
  for (const suite of report.requalification.suites) {
    assert.equal(suite.passed, true, suite.file);
    assert.ok(suite.pass > 0 && suite.pass === suite.tests && suite.skipped === 0 && suite.todo === 0 && suite.cancelled === 0, suite.file);
    assert.deepEqual(suite.browserVersionsSeen, [report.version], suite.file);
  }
  assert.equal(report.requalification.edgeChangedDuringRun, false);
}

test('the archived requalifications ran every test of every suite on the qualified Edge (a retained failed attempt failed closed)', () => {
  const first = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'fix-1', 'requalify', 'requalification-report.json'), 'utf8'));
  assert.equal(first.ok, false);
  assert.deepEqual(first.reasonCodes, ['REQUALIFICATION_FAILED', 'BROWSER_VERSION_MISSING']);
  assertRequalified(JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'fix-1', 'requalify', 'requalification-report-2.json'), 'utf8')));
});

test('the second fix ran the documented procedure for real: a requalification of a major that was not listed, the helper, the chain', () => {
  const dir = path.join(EVIDENCE, 'fix-2', 'requalify');
  const bytes = fs.readFileSync(path.join(dir, 'requalification-report.json'));
  assertRequalified(JSON.parse(bytes.toString('utf8')), { newMajor: true });
  const transcript = fs.readFileSync(path.join(dir, 'procedure-transcript.txt'), 'utf8');
  for (const line of ['DRY RUN would append major 156 (156.0.4314.58) to qualified.addendum.jsonl', 'APPENDED major 156 (156.0.4314.58) to qualified.addendum.jsonl',
    'FAIL closed: major 156 is already listed', 'OK qualified list: sealed [155] and addendum [156] (1 line)', '"qualifiedVia":"addendum"',
    'FAIL closed: QUALIFIED_ADDENDUM_INVALID: line 1: previous does not match qualified.json']) {
    assert.ok(transcript.includes(line), line);
  }
  assert.ok(transcript.includes(`"reportSha256":"${sha(bytes)}"`), 'the appended line carries the digest of this very report');
});

// The mutants that no test of the archived run could kill. M20 (the base64 guard) is NOT equivalent: it is killed by
// decode-base64.test.cjs, added after the run and checked on a scratch copy of the mutant (see the README), not by the archive.
const EXPECTED_SURVIVORS = ['M20-base64-check-dropped'];

test('the mutation run accounts for every mutant and the outer bound has a named killer (N2)', () => {
  const run = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'fix-2', 'mutation', 'mutation-result.json'), 'utf8'));
  const { MUTANTS } = require('./mutation/mutants.cjs');
  assert.equal(run.mutants, MUTANTS.length);
  assert.deepEqual(run.results.map((row) => row.id).sort(), MUTANTS.map((mutant) => mutant.id).sort());
  assert.deepEqual(run.results.filter((row) => row.result !== 'KILLED').map((row) => row.id).sort(), [...EXPECTED_SURVIVORS].sort());
  assert.equal(run.killed, run.mutants - EXPECTED_SURVIVORS.length);
  for (const row of run.results.filter((candidate) => candidate.result === 'KILLED')) {
    assert.ok(!/^HANG \(external timeout\)/.test(row.killer) && row.killer !== '', `${row.id} was not killed by a named assertion`);
  }
  const outer = run.results.find((row) => row.id.startsWith('M10-'));
  assert.deepEqual(outer && [outer.result, outer.killedBy], ['KILLED', 'outer-timeout']);
  assert.match(outer.killer, /^OUTER BOUND: an adapter that never answers \(/);
  // the mutants that the first mutation run did not kill are killed by survivors.test.cjs now that it is part of the order
  for (const id of ['F4c', 'F6a', 'F6b', 'F6c', 'F6f', 'F6g']) {
    const row = run.results.find((candidate) => candidate.id.startsWith(`${id}-`));
    assert.deepEqual(row && [row.result, row.killedBy], ['KILLED', 'survivors'], id);
  }
});

// The figures of the README section "Results of the second fix" are recomputed from the stored evidence, never trusted.
test('every figure that the README states about the second fix is the one in the archives', QUICK, () => {
  const readme = fs.readFileSync(path.join(NAMESPACE, 'README.md'), 'utf8');
  const section = readme.slice(readme.indexOf('## Results of the second fix'));
  assert.ok(section.length > 100, 'the section is missing');
  const second = allManifests().filter((manifest) => manifest.kind === 'fix2');
  for (const { data } of second.filter((manifest) => /^coverage-fix2-/.test(manifest.data.name))) {
    const row = data.summary.coverageRows[0];
    assert.ok(section.includes(`| \`${row.file}\` | ${row.lines} | ${row.branches} | ${row.functions} |`), `the README row of ${row.file} differs from ${data.name}`);
  }
  for (const { data } of second.filter((manifest) => /^green-fix2-0[123]/.test(manifest.data.name))) {
    assert.ok(section.includes(`\`${data.name}\` ${data.summary.pass} of ${data.summary.tests}`), `the README figure of ${data.name} differs from the archive`);
  }
  const run = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'fix-2', 'mutation', 'mutation-result.json'), 'utf8'));
  assert.ok(section.includes(`${run.killed} of ${run.mutants} mutants`), 'the README mutation figure differs from the archive');
  for (const name of ['red-fix2-n1-addendum-module-retry', 'red-fix2-n1-qualify-addendum', 'red-fix2-n1-evidence-amend', 'red-fix2-n3-timeouts', 'red-fix2-n5-cli-catch']) {
    const { data } = allManifests().find((manifest) => manifest.data.name === name);
    assert.ok(section.includes(`\`${name}\` ${data.summary.tests} tests, ${data.summary.fail} fail`), `the README figure of ${name} differs from the archive`);
  }
});

// Every byte: each file of the namespace (the evidence itself and the live addendum excepted) is pinned at its current bytes by an
// archive of the second fix, so a README, a feature file, a test or a fixture that nobody pinned fails here by name.
test('every file of the namespace is pinned at its current bytes by an archive of the second fix', QUICK, () => {
  const pinned = new Map();
  for (const { data } of allManifests().filter((manifest) => manifest.kind === 'fix2')) {
    for (const input of data.inputs) pinned.set(`${input.path}|${input.rawSha256}`, true), pinned.set(`${input.path}|${input.crlfToLfSha256}`, true);
  }
  const problems = [];
  const walk = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const here = `${relative}\\${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'evidence' && !/^scratch-/.test(entry.name)) walk(path.join(directory, entry.name), here);
      } else if (entry.name !== 'qualified.addendum.jsonl' && !/\.lock$|\.tmp$/.test(entry.name)) {
        const bytes = fs.readFileSync(path.join(directory, entry.name));
        if (!pinned.has(`${here}|${sha(bytes)}`) && !pinned.has(`${here}|${sha(lf(bytes))}`)) problems.push(`${here} is not pinned at its current bytes`);
      }
    }
  };
  walk(NAMESPACE, 'testing\\browser\\qualify');
  const own = ['evidence.test.cjs', 'evidence-amend.test.cjs', 'amend-proof.test.cjs'].map((name) => `testing\\browser\\qualify\\tests\\${name}`);
  assert.deepEqual(problems.filter((problem) => !own.some((file) => problem.startsWith(file))), []);
});

function tamperAndExpectFailures(fullManifest) {
  const label = fullManifest.data.name;
  const strict = (input) => fullManifest.kind === 'fix2' || (!SUPERSEDED[input.path] && (fullManifest.kind === 'fix1' || /\\tests\\/.test(input.path)));
  // Three pinned inputs are enough to show each tamper case by name (the full list is recomputed by the test above).
  const target = fullManifest.data.inputs.find(strict);
  const manifest = { ...fullManifest, data: { ...fullManifest.data, inputs: [target, ...fullManifest.data.inputs.filter((input) => input !== target).slice(0, 2)] } };
  const dir = scratchDir();
  try {
    const root = path.join(dir, 'root');
    for (const input of manifest.data.inputs) {
      fs.mkdirSync(path.dirname(path.join(root, input.path)), { recursive: true });
      fs.copyFileSync(path.join(REPO, input.path), path.join(root, input.path));
    }
    const copy = path.join(dir, 'evidence');
    fs.mkdirSync(path.join(copy, 'raw'), { recursive: true });
    for (const stream of ['stdout', 'stderr']) fs.copyFileSync(path.join(fullManifest.dir, manifest.data.transcripts[stream].path), path.join(copy, manifest.data.transcripts[stream].path));
    const at = { ...manifest, dir: copy };
    assert.deepEqual(verify(at, root), [], `${label}: the scratch copy verifies before the tampering`);
    const stdoutFile = path.join(copy, manifest.data.transcripts.stdout.path);
    const original = fs.readFileSync(stdoutFile);
    const flipped = Buffer.from(original);
    flipped[Math.floor(flipped.length / 2)] ^= 0xff;
    fs.writeFileSync(stdoutFile, flipped);
    assert.ok(verify(at, root).some((problem) => /stdout/.test(problem)), `${label}: flipped transcript byte`);
    fs.writeFileSync(stdoutFile, original);
    const pin = { ...manifest.data, inputs: manifest.data.inputs.map((input) => (input === target ? { ...input, rawSha256: '0'.repeat(64), crlfToLfSha256: '0'.repeat(64) } : input)) };
    assert.ok(verify({ ...at, data: pin }, root).some((problem) => /differs from its pin/.test(problem)), `${label}: edited pin`);
    const changed = path.join(root, target.path);
    fs.appendFileSync(changed, '\n// tampered');
    assert.ok(verify(at, root).some((problem) => /differs from its pin/.test(problem)), `${label}: changed input`);
    fs.rmSync(changed);
    assert.ok(verify(at, root).some((problem) => /is missing/.test(problem)), `${label}: missing input`);
    fs.rmSync(stdoutFile);
    assert.ok(verify(at, root).some((problem) => /transcript missing/.test(problem)), `${label}: missing transcript`);
  } finally {
    removeDir(dir);
  }
}

test('tampering is detected BY NAME for every kind of archive: a flipped transcript byte, an edited pin, a changed input and a missing file each fail', QUICK, () => {
  const kinds = [['red1', 'red-fix-f4-second-digest'], ['red2', 'red-fix2-n3-timeouts'], ['fix1', 'coverage-version'], ['fix2', 'coverage-fix2-version'],
    ['fix2', 'fix2-mutation-run'], ['fix2', 'green-fix2-02-replay-n3-timeouts'], ['fix2', 'fix2-cli-01-qualify-current-edge'], ['fix2', 'green-fix2-03-machine-test']];
  for (const [kind, name] of kinds) {
    const manifest = allManifests().find((candidate) => candidate.kind === kind && candidate.data.name === name);
    assert.ok(manifest, `the archive ${name} is missing`);
    tamperAndExpectFailures(manifest);
  }
});

test('the evidence folder keeps its attributes so that raw transcripts are never rewritten by git, and the addendum keeps its bytes', () => {
  assert.equal(fs.readFileSync(path.join(EVIDENCE, '.gitattributes'), 'utf8').trim(), '* -text -diff');
  assert.match(fs.readFileSync(path.join(NAMESPACE, '.gitattributes'), 'utf8'), /^qualified\.addendum\.jsonl -text\r?$/m);
});
