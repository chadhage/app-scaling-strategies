'use strict';

// Integrity: the pins of the imported C009 files against git and the working files (L-0116), every capture manifest recomputed from the files it names, a tamper
// test per kind of tampering that fails BY NAME, and the figures the README states recomputed from the stored evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const zlib = require('node:zlib');
const { ROOT, REPOSITORY, sha, lf, checkManifest, manifests, printedDocument, checkMutants, mutantTotals, mutationEvidence, finalCapture } = require('./evidence-check.cjs');
const { sealedNames, verifySeal } = require('./seal.cjs');

const imports = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json'), 'utf8'));
const PINNED = imports.accepted.C009;
const FILES = Object.keys(imports.imports);

// ONE git process answers every question about the pinned commits (a spawn per question, about 45 of them, took two minutes on a loaded Windows machine):
// `cat-file --batch` prints `<oid> <type> <size>` and the bytes of every object it is asked for, or `<name> missing`.
function gitObjects(names) {
  try {
    const output = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], { cwd: REPOSITORY, input: `${names.join('\n')}\n`, maxBuffer: 32 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let offset = 0;
    return names.map(() => {
      const end = output.indexOf(10, offset);
      const [oid, type, size] = output.toString('latin1', offset, end).split(' ');
      offset = end + 1;
      if (type === 'missing' || type === 'ambiguous' || size === undefined) return null;
      const bytes = output.subarray(offset, offset + Number(size));
      offset += Number(size) + 1;
      return { oid, bytes };
    });
  } catch { return names.map(() => null); }
}
const objects = gitObjects([`${PINNED.commit}^{commit}`, `${PINNED.confirmed.commit}^{commit}`, `${PINNED.tag}^{commit}`, `${PINNED.confirmed.tag}^{commit}`,
  ...FILES.map((relative) => `${PINNED.commit}:${relative}`), ...FILES.map((relative) => `${PINNED.confirmed.commit}:${relative}`)]);
const [pinnedCommit, confirmedCommit, pinnedTag, confirmedTag] = objects;
const pinnedBlobs = Object.fromEntries(FILES.map((relative, index) => [relative, objects[4 + index]]));
const confirmedBlobs = Object.fromEntries(FILES.map((relative, index) => [relative, objects[4 + FILES.length + index]]));
const hasGit = Boolean(pinnedCommit);
const hasConfirmed = Boolean(confirmedCommit);

test('imports.json pins the C009 production files: the working bytes (raw or LF) equal the pin, and git at the pinned commit agrees', () => {
  assert.equal(imports.schema, 'C014-imports/1');
  assert.deepEqual(Object.keys(imports.imports).sort(), ['authz.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'queue.cjs'].map((name) => `capability/C009/${name}`));
  for (const [relative, pin] of Object.entries(imports.imports)) {
    const bytes = fs.readFileSync(path.join(REPOSITORY, relative));
    assert.ok([pin.rawSha256, pin.canonicalLfSha256].includes(sha(bytes)) || sha(lf(bytes)) === pin.canonicalLfSha256, `${relative}: the working file equals its pin (raw or LF)`);
    assert.equal(sha(lf(bytes)), pin.canonicalLfSha256, `${relative}: LF form`);
    if (hasGit) {
      const blob = pinnedBlobs[relative];
      assert.ok(blob, `${relative}: git holds the blob at the pinned commit`);
      assert.equal(blob.oid, pin.gitBlob, `${relative}: git blob at the pinned commit`);
      assert.equal(sha(blob.bytes), pin.acceptedGitSha256, `${relative}: blob bytes`);
      assert.ok(sha(lf(blob.bytes)) === pin.canonicalLfSha256, `${relative}: blob LF form`);
    }
    if (hasConfirmed) assert.equal(confirmedBlobs[relative] && confirmedBlobs[relative].oid, pin.gitBlob, `${relative}: the same blob at the commit that C009 was accepted on`);
  }
  if (hasGit) assert.equal(pinnedTag && pinnedTag.oid, PINNED.commit, 'the tag resolves to the pinned commit');
  if (hasConfirmed) assert.equal(confirmedTag && confirmedTag.oid, PINNED.confirmed.commit, 'the accepted tag resolves to the accepted commit');
  assert.match(imports.status, /C009 is ACCEPTED/);
  assert.ok(imports.status.includes(PINNED.confirmed.commit.slice(0, 12)), 'the status names the commit it was accepted on');
});

test('C014 imports only what imports.json lists: every require of another namespace in a production file is a pinned C009 file', () => {
  const pinned = new Set(Object.keys(imports.imports).map((relative) => path.basename(relative)));
  const sources = fs.readdirSync(ROOT).filter((name) => /\.(?:cjs|js)$/.test(name));
  const required = new Set();
  for (const name of sources) {
    for (const match of fs.readFileSync(path.join(ROOT, name), 'utf8').matchAll(/require\('\.\.\/([^']+)'\)/g)) required.add(match[1]);
  }
  assert.ok(required.size >= 6);
  for (const target of required) {
    assert.match(target, /^C009\//, `${target} is a C009 file`);
    assert.ok(pinned.has(path.basename(target)), `${target} is pinned`);
  }
});

// A retained FAILED capture is named here and checked for exactly the failure the README states (never silently exempt): the first GREEN suite capture, in which
// the cross-process flood test was cancelled by its own 120 s timeout while the machine was saturated by other agents.
const ATTEMPTS = {
  'green/suite-01/green-suite': { cancelled: 1, pass: 89, tests: 90 }, 'browser/run-01/browser-run': {}, 'browser/run-02/browser-run': {},
  // the first load loop: process-flood failed in all 20 runs because of two defects of the TEST (a fixed 800 ms grace after the last byte, and a 20 ms poll that raced the attacker's exit)
  'loop/run-01/loop-load-01': { tests: 120, pass: 100, fail: 20 },
  // the second load loop of the third fix: 119 of 120, process-flood failed in the first run while the named-mutant campaign of this card ran next to the 4 parallel runs and the 4 burners; its report
  // did not say which assertion failed (tests\loop.cjs now records it), so the loop was taken again
  'loop/run-04/loop-load-04': { tests: 120, pass: 119, fail: 1 },
  // the first CRLF fresh-checkout run: 136 of 137, the one failure was the fresh-copy check of THIS file, which asserted that the copy holds no fresh capture although the LF capture existed by then
  'fresh/crlf-01/fresh-crlf-01': { tests: 137, pass: 136, fail: 1 }
};
// A capture that PASSED when it was made and whose pinned inputs were edited afterwards, on purpose (the cost cut of a process-spawning test, the survivors of the systematic mutation
// campaign, the imports status after C009 was accepted, this test): it stays as history, its transcripts and exit code are still recomputed, its inputs are no longer compared, and
// the final captures of the same kind replace it.
const SUPERSEDED = {
  'coverage/run-01/coverage-per-file': true, 'coverage/run-02-focused/coverage-focused': true, 'coverage/run-03/coverage-focused-03': true, 'browser/run-03/browser-run': true,
  // the captures of 14:28 to 15:24, before vault.cjs was hardened (frozen identities, a copy of the contact in a dispatch result): their inputs include it
  'green/replay-01/green-replay-red-r2': true, 'browser/run-04/browser-run-04': true, 'browser/cleanup-01/browser-cleanup-01': true, 'loop/run-02/loop-load-02': true,
  // the LF fresh-checkout capture that passed before this file was edited (the fresh-copy check above)
  'fresh/lf-01/fresh-lf-01': true,
  // the final captures of the first publication (c7ec58a79f0d): the third fix changed canon.cjs, redact.cjs and vault.cjs and many tests, so every capture that pins them is history and the
  // captures of the third fix (the next serial of each kind) replace it; their transcripts and exit codes are still recomputed
  'green/suite-02/green-suite-02': true, 'green/replay-02/green-replay-red-r2-02': true, 'coverage/run-04/coverage-focused-04': true, 'browser/run-05/browser-run-05': true,
  'browser/cleanup-02/browser-cleanup-02': true, 'loop/run-03/loop-load-03': true, 'fresh/lf-02/fresh-lf-02': true, 'fresh/crlf-02/fresh-crlf-02': true,
  // the two REDs of the third fix pin the bytes of the FIRST publication on purpose (the next test compares them with that commit); the fix then changed them
  'red/red-03/red-fix3-f1f2': true, 'red/red-04/red-fix3-f3': true
};

test('every capture manifest of the evidence recomputes: transcripts, sizes, inputs and exit codes (a retained failed attempt only with its stated failure; its inputs are history)', () => {
  const files = manifests();
  assert.ok(files.length >= 3, `${files.length} manifests`);
  for (const file of files) {
    const key = path.relative(path.join(ROOT, 'evidence'), file).replace(/\\/g, '/').replace(/\.json$/, '');
    const attempt = Object.hasOwn(ATTEMPTS, key) ? ATTEMPTS[key] : null;
    assert.deepEqual(checkManifest(file, { allowExit: Boolean(attempt), skipInputs: Object.hasOwn(SUPERSEDED, key) }), [], path.relative(ROOT, file));
    if (attempt) {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(manifest.exitCode, 1);
      for (const [field, value] of Object.entries(attempt)) assert.equal(manifest.summary[field], value, `${key}.${field}`);
    }
  }
  const kinds = new Set(files.map((file) => path.relative(path.join(ROOT, 'evidence'), file).split(path.sep)[0]));
  assert.ok(kinds.has('red'), 'a RED capture is archived');
});

// The first publication (the commit the independent review rejected). The two REDs of the third fix ran on ITS bytes.
const FIRST_PUBLICATION = 'c7ec58a79f0dfaef381b9ec9b6621c0aa1970089';
const FIXED = ['canon.cjs', 'redact.cjs', 'vault.cjs'];

test('the REDs of the third fix ran on the bytes of the FIRST publication: every pinned input that existed there equals its blob, the new snapshots equal their working files, and the fix changed the three production files it was meant to change and no other', () => {
  const stored = ['red-fix3-f1f2', 'red-fix3-f3'].map((name) => ({ name, file: manifests().find((file) => path.basename(file, '.json') === name) }));
  for (const { name, file } of stored) assert.ok(file, `${name}: the capture is stored`);
  const inputs = new Map();
  for (const { file } of stored) for (const input of JSON.parse(fs.readFileSync(file, 'utf8')).inputs) inputs.set(input.path.replace(/\\/g, '/'), input.crlfToLfSha256);
  const names = [...inputs.keys()].map((name) => name.replace(/^capability\/C014\//, ''));
  assert.ok(FIXED.every((name) => names.includes(name)) && names.length >= 15, 'the production files are pinned');
  const [commit, ...blobs] = gitObjects([`${FIRST_PUBLICATION}^{commit}`, ...[...inputs.keys()].map((name) => `${FIRST_PUBLICATION}:${name}`)]);
  if (!commit) return; // no git history here (a fresh tree is no repository): there is nothing to compare with
  [...inputs].forEach(([relative, pinned], index) => {
    const working = path.join(REPOSITORY, relative);
    if (blobs[index]) assert.equal(sha(lf(blobs[index].bytes)), pinned, `${relative}: the RED pinned the bytes of the first publication`);
    else {
      assert.ok(fs.existsSync(working), `${relative}: a file that is not in the first publication is still here`);
      assert.equal(sha(lf(fs.readFileSync(working))), pinned, `${relative}: a new snapshot or tool still has the bytes the RED pinned`);
    }
  });
  for (const name of ['evidence.cjs', 'service.cjs', 'server.cjs', 'page.js', 'index.html', 'style.css']) {
    assert.equal(sha(lf(fs.readFileSync(path.join(ROOT, name)))), inputs.get(`capability/C014/${name}`), `${name}: the fix did not touch it`);
  }
  for (const name of FIXED) assert.notEqual(sha(lf(fs.readFileSync(path.join(ROOT, name)))), inputs.get(`capability/C014/${name}`), `${name}: the fix changed it`);
});

function scratchCopy(manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const directory = path.join(ROOT, 'tests', 'scratch', `tamper-${process.pid}-${Date.now()}`);
  const evidence = path.join(directory, 'evidence');
  fs.mkdirSync(path.join(evidence, 'raw'), { recursive: true });
  fs.copyFileSync(manifestFile, path.join(evidence, path.basename(manifestFile)));
  for (const stream of ['stdout', 'stderr']) fs.copyFileSync(path.join(path.dirname(manifestFile), manifest.transcripts[stream].path.replace(/\\/g, '/')), path.join(evidence, manifest.transcripts[stream].path.replace(/\\/g, '/')));
  for (const input of manifest.inputs) {
    fs.mkdirSync(path.dirname(path.join(directory, input.path.replace(/\\/g, '/'))), { recursive: true });
    fs.copyFileSync(path.join(REPOSITORY, input.path.replace(/\\/g, '/')), path.join(directory, input.path.replace(/\\/g, '/')));
  }
  return { directory, manifest, file: path.join(evidence, path.basename(manifestFile)) };
}

test('tampering is detected BY NAME: a transcript byte, a missing transcript, an input byte, a missing input, an exit code', () => {
  const first = manifests().find((file) => file.includes(`${path.sep}red${path.sep}`));
  assert.ok(first, 'a RED manifest exists');
  const cases = {
    'a flipped transcript byte': [(copy) => { const target = path.join(path.dirname(copy.file), copy.manifest.transcripts.stdout.path.replace(/\\/g, '/')); const bytes = fs.readFileSync(target); bytes[bytes.length - 3] ^= 1; fs.writeFileSync(target, bytes); }, /stdout transcript changed/],
    'a deleted transcript': [(copy) => fs.rmSync(path.join(path.dirname(copy.file), copy.manifest.transcripts.stderr.path.replace(/\\/g, '/'))), /stderr transcript is missing/],
    'an edited input': [(copy) => { const target = path.join(copy.directory, copy.manifest.inputs[0].path.replace(/\\/g, '/')); fs.appendFileSync(target, '\n// tampered\n'); }, /changed after the capture/],
    'a deleted input': [(copy) => fs.rmSync(path.join(copy.directory, copy.manifest.inputs[0].path.replace(/\\/g, '/'))), /is missing/],
    'a changed exit code': [(copy) => { const edited = { ...copy.manifest, exitCode: 0 }; fs.writeFileSync(copy.file, JSON.stringify(edited)); }, /exit code 0 is not the expected 1/]
  };
  // one scratch copy for every case: the files of the copy are put back after each case (the copy of the evidence tree used to be built five times)
  const copy = scratchCopy(first);
  const filesOf = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesOf(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  try {
    const pristine = new Map(filesOf(copy.directory).map((file) => [file, fs.readFileSync(file)]));
    for (const [name, [tamper, expected]] of Object.entries(cases)) {
      assert.deepEqual(checkManifest(copy.file, { repository: copy.directory }), [], `${name}: the copy is clean`);
      tamper(copy);
      const problems = checkManifest(copy.file, { repository: copy.directory });
      assert.ok(problems.some((problem) => expected.test(problem)), `${name}: ${JSON.stringify(problems)}`);
      for (const [file, bytes] of pristine) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
      }
    }
  } finally { fs.rmSync(copy.directory, { recursive: true, force: true }); }
});

test('the systematic mutation campaign: every mutant the generator lists for the current production bytes was run and decided, every survivor is a written equivalence, nothing is undecided', () => {
  const evidence = mutationEvidence();
  assert.ok(evidence.reports.length >= 1, 'a campaign report is stored');
  assert.deepEqual(checkMutants(evidence), []);
  const totals = mutantTotals(evidence);
  assert.equal(totals.killed + totals.crash + totals.equivalent, totals.generated, 'every generated mutant is decided exactly once');
  assert.ok(totals.generated >= 500, `${totals.generated} mutants were generated`);
});

test('tampering with the mutation evidence is detected BY NAME: a result removed, a kill turned into a survivor, an undecided run, a kill without a named test, other source bytes, no control, an equivalence without a reason or for another mutant', () => {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const evidence = mutationEvidence();
  // a main report entry that was made for the CURRENT bytes of its file and that no other main report repeats (an entry for earlier bytes is history, and a second report for the same bytes would cover a tamper)
  const current = (name) => sha(Buffer.from(fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\r\n/g, '\n')));
  const matches = (report, name) => Boolean(report.files[name]) && report.files[name].sourceLfSha256 === current(name);
  const target = evidence.reports.flatMap((report, at) => Object.keys(report.files).filter((name) => matches(report, name) && evidence.reports.filter((other) => matches(other, name)).length === 1).map((name) => ({ at, name })))[0];
  assert.ok(target, 'a main report entry for the current bytes of a file exists that no other report repeats');
  const { at, name: file } = target;
  const rerun = new Set(evidence.reruns.flatMap((report) => (report.files[file] ? report.files[file].results.map((result) => result.index) : [])));
  const pick = (copy) => { const entry = copy.reports[at].files[file]; return { entry, result: entry.results.find((item) => item.killed && !item.crash && !rerun.has(item.index)) }; };
  const cases = {
    'a removed result': [(copy) => { const { entry, result } = pick(copy); entry.results.splice(entry.results.indexOf(result), 1); }, /never run/],
    'a kill turned into a survivor': [(copy) => { const { result } = pick(copy); result.killed = false; result.failing = []; }, /survived and is not listed as equivalent/],
    'an undecided run': [(copy) => { const { result } = pick(copy); result.killed = false; result.timedOut = true; }, /undecided/],
    'a kill without a named failing test': [(copy) => { const { result } = pick(copy); result.failing = []; }, /killed without a named failing test/],
    'a report made for other source bytes': [(copy) => { copy.reports[at].files[file].sourceLfSha256 = '0'.repeat(64); }, /no campaign report was made for the current source bytes/],
    'no green control run': [(copy) => { delete copy.reports[at].files[file].control; }, /no green control run/]
  };
  for (const [name, [tamper, expected]] of Object.entries(cases)) {
    const copy = clone(evidence);
    tamper(copy);
    assert.ok(checkMutants(copy).some((problem) => expected.test(problem)), `${name}: ${JSON.stringify(checkMutants(copy)).slice(0, 200)}`);
  }
  const copy = clone(evidence);
  const { result } = pick(copy);
  result.killed = false;
  result.failing = [];
  const equivalence = (reason, kind = result.kind) => ({ file, index: result.index, kind, original: result.original, replacement: result.replacement, reason });
  copy.equivalents = [...evidence.equivalents, equivalence('too short')];
  assert.ok(checkMutants(copy).some((problem) => /no written reason/.test(problem)), 'an equivalence with a short reason');
  copy.equivalents = [...evidence.equivalents, equivalence('x'.repeat(80), `${result.kind} (another)`)];
  assert.ok(checkMutants(copy).some((problem) => /names another mutant/.test(problem)), 'an equivalence for another mutant');
  copy.equivalents = [...evidence.equivalents, equivalence('x'.repeat(80))];
  assert.deepEqual(checkMutants(copy), [], 'a survivor with a written reason for the very mutant is accepted');
});

test('the load loop capture: 20 runs, 4 at a time, under 4 burners that the script started and stopped by PID; every run of every process-spawning test file passed', () => {
  const file = finalCapture('loop-load');
  assert.ok(file, 'the loop capture is stored');
  const report = printedDocument(file);
  assert.equal(report.schema, 'C014-loop/1');
  assert.deepEqual([report.runs, report.parallel, report.burners.count, report.burners.pids.length, new Set(report.burners.pids).size], [20, 4, 4, 4, 4]);
  assert.equal(report.burners.allStopped, true, 'the burners were stopped and none was alive afterwards');
  const rows = report.results.flatMap((entry) => entry.rows);
  assert.equal(rows.length, report.runs * report.files.length);
  assert.ok(rows.every((row) => row.ok && row.tests > 0 && row.pass === row.tests && !row.endedByGuard), 'every run of every file passed');
  assert.deepEqual(report.failures, []);
  // the loop covers EVERY process-spawning test file of the namespace (a file that uses the child-process helpers)
  const tests = path.join(ROOT, 'tests');
  const spawning = fs.readdirSync(tests).filter((name) => name.endsWith('.test.cjs') && /require\('\.\/child\.cjs'\)/.test(fs.readFileSync(path.join(tests, name), 'utf8'))).map((name) => name.replace(/\.test\.cjs$/, '')).sort();
  assert.deepEqual([...report.files].sort(), spawning);
  // a file that needed more than the 60 s cap of the shared runner under this load is a finding that the README must state with the same number
  const over = rows.filter((row) => row.durationMs > report.capMs).length;
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, new RegExp(`LOOP-OVER-CAP: ${over}\\b`), 'the README states how many runs went over the cap');
});

test('the final real Edge observation: Microsoft-signed, a qualified major, every check printed, the browser run ended OK', () => {
  const file = finalCapture('browser-run');
  assert.ok(file, 'the real Edge capture is stored');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stdout = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(file), manifest.transcripts.stdout.path.replace(/\\/g, '/')))).toString('utf8');
  assert.match(stdout, /^PASS the installed Edge is Microsoft-signed and its major is qualified: .*"signature":"Valid","publisher":"Microsoft Corporation"/m);
  for (const check of ['the real service: nothing the browser holds contains a canary', 'a forging server cannot make the page print a canary', 'keyboard: Tab reaches reload then the download link']) assert.ok(stdout.includes(`PASS ${check}`), check);
  assert.match(stdout, /^C014 BROWSER OK$/m);
});

test('the cleanup proof of the real browser: an injected failure failed the run and its finally block still closed the real session (archived capture and the hook in browser.cjs)', () => {
  const file = finalCapture('browser-cleanup');
  assert.ok(file, 'the cleanup capture is stored');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stdout = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(file), manifest.transcripts.stdout.path.replace(/\\/g, '/')))).toString('utf8');
  assert.match(stdout, /"result":"ok","injected":true,"exit":1/);
  const source = fs.readFileSync(path.join(ROOT, 'tests', 'browser.cjs'), 'utf8');
  assert.match(source, /C014_BROWSER_INJECT_FAILURE === '1'\) assert\.fail\('injected failure: the real session must still be closed in finally'\)/);
  assert.match(source, /finally \{\s+if \(session\) \{\s+await session\.close\(\);/);
});

test('the final per-file coverage capture: ONE command per enumerated production file, every file at or above 85/85/85, nothing unlisted or missing', () => {
  const { PRODUCTION, THRESHOLD } = require('./coverage.cjs');
  const file = finalCapture('coverage-focused');
  assert.ok(file, 'a coverage capture is stored');
  const report = printedDocument(file);
  assert.equal(report.threshold, THRESHOLD);
  assert.deepEqual(report.enumerated, fs.readdirSync(ROOT).filter((name) => /\.(?:cjs|js)$/.test(name)).sort(), 'every first-party production file of the namespace root is enumerated');
  assert.deepEqual([report.unlisted, report.missing], [[], []]);
  assert.deepEqual(report.results.map((result) => result.file).sort(), [...PRODUCTION].sort());
  for (const result of report.results) {
    assert.equal(result.exit, 0, `${result.file}: exit`);
    assert.ok(result.ok && result.row && [result.row.lines, result.row.branches, result.row.functions].every((value) => value >= THRESHOLD), `${result.file}: ${JSON.stringify(result.row)}`);
    assert.deepEqual([result.fail, result.cancelled, result.skipped], [0, 0, 0], `${result.file}: no failing, cancelled or skipped test`);
  }
});

const FRESH_COPY = fs.existsSync(path.join(ROOT, 'tests', 'scratch', 'FRESH-COPY'));

test('the final whole-suite capture: every test file of the namespace except the integrity and README tests ran, one per child process, every file passed and finished under the 60 s cap', () => {
  const file = finalCapture('green-suite');
  assert.ok(file, 'the suite capture is stored');
  const report = printedDocument(file);
  assert.equal(report.schema, 'C014-suite/1');
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((name) => name.endsWith('.test.cjs') && !['integrity.test.cjs', 'readme.test.cjs'].includes(name)).sort();
  assert.deepEqual(report.files.map((row) => row.file), tests, 'every test file ran');
  for (const row of report.files) assert.deepEqual([row.exit, row.fail, row.cancelled, row.skipped, row.todo, row.pass === row.tests && row.tests > 0, row.durationMs < report.capMs], [0, 0, 0, 0, 0, true, true], row.file);
  assert.deepEqual([report.overCap, report.broken], [[], []]);
  const sum = (key) => report.files.reduce((total, row) => total + row[key], 0);
  assert.deepEqual([sum('tests'), sum('pass')], [report.totals.tests, report.totals.pass], 'the totals are the sums of the rows');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).summary.tests, report.totals.tests, 'the recorder read the same total');
});

test('the fresh-checkout captures: the whole suite, the integrity and README tests included, is green in a tree of git-archive blobs (LF) and in the same tree converted to CRLF', () => {
  if (FRESH_COPY) return; // this tree IS a copy made by tests\fresh.cjs, before the fresh captures existed
  const wanted = printedDocument(finalCapture('green-suite')).totals.tests;
  for (const [name, stem] of [['LF', 'fresh-lf'], ['CRLF', 'fresh-crlf']]) {
    const capture = finalCapture(stem);
    assert.ok(capture, `${name}: the capture is stored`);
    const summary = JSON.parse(fs.readFileSync(capture, 'utf8')).summary;
    assert.deepEqual([summary.fail, summary.cancelled, summary.skipped, summary.pass === summary.tests], [0, 0, 0, true], `${name}: nothing failed, was cancelled or skipped`);
    assert.ok(summary.tests > wanted, `${name}: ${summary.tests} tests: the whole suite (${wanted}) and the integrity and README tests`);
  }
});

test('the seal pins the final bytes: every file of the namespace, the README included, equals its pin and nothing is unsealed; a changed byte, a removed file, an added file and a CRLF copy are told apart BY NAME', () => {
  if (FRESH_COPY) return; // this tree IS a copy made by tests\fresh.cjs, before the seal was written
  const file = path.join(ROOT, 'evidence', 'seal.json');
  assert.ok(fs.existsSync(file), 'evidence/seal.json exists (it is written last, by tests/seal.cjs)');
  const seal = JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = sealedNames();
  const read = (name) => (fs.existsSync(path.join(ROOT, name)) ? fs.readFileSync(path.join(ROOT, name)) : undefined);
  assert.deepEqual(verifySeal(seal, { read, names }), []);
  for (const required of ['README.md', 'redact.cjs', 'canon.cjs', 'vault.cjs', 'imports.json', 'tests/readme.test.cjs', 'tests/integrity.test.cjs', 'evidence/mutants/equivalents.json', 'evidence/specs/spec-red-fix3-f1f2.json']) assert.ok(Object.hasOwn(seal.files, required), `${required} is sealed`);
  const flipped = (target) => (name) => { const bytes = read(name); if (name !== target) return bytes; const copy = Buffer.from(bytes); copy[Math.min(7, copy.length - 1)] ^= 1; return copy; };
  for (const name of ['README.md', 'redact.cjs', 'tests/redact.test.cjs', 'imports.json', 'evidence/mutants/equivalents.json', 'evidence/specs/spec-red-fix3-f1f2.json']) {
    assert.deepEqual(verifySeal(seal, { read: flipped(name), names }), [`seal: ${name} differs from its pin`], `one byte of ${name}`);
  }
  assert.deepEqual(verifySeal(seal, { read: (name) => (name === 'README.md' ? undefined : read(name)), names }), ['seal: README.md is missing'], 'a removed file');
  assert.deepEqual(verifySeal(seal, { read, names: [...names, 'tests/extra.test.cjs'] }), ['seal: tests/extra.test.cjs is not sealed'], 'an added file');
  const crlf = (name) => (name === 'README.md' ? Buffer.from(read(name).toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1') : read(name));
  assert.deepEqual(verifySeal(seal, { read: crlf, names }), [], 'a checkout with CRLF line endings holds the same text');
});
