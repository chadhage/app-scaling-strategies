'use strict';

// Integrity: the pins of the imported C009 files against git and the working files (L-0116), every capture manifest recomputed from the files it names, a tamper
// test per kind of tampering that fails BY NAME, and the figures the README states recomputed from the stored evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const zlib = require('node:zlib');
const { ROOT, REPOSITORY, sha, lf, checkManifest, manifests, printedDocument, checkMutants, mutantTotals } = require('./evidence-check.cjs');

const imports = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json'), 'utf8'));
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: REPOSITORY, maxBuffer: 8 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
const hasGit = (() => { try { git('rev-parse', '--git-dir'); git('cat-file', '-e', `${imports.accepted.C009.commit}^{commit}`); return true; } catch { return false; } })();
const hasConfirmed = hasGit && (() => { try { git('cat-file', '-e', `${imports.accepted.C009.confirmed.commit}^{commit}`); return true; } catch { return false; } })();

test('imports.json pins the C009 production files: the working bytes (raw or LF) equal the pin, and git at the pinned commit agrees', () => {
  assert.equal(imports.schema, 'C014-imports/1');
  assert.deepEqual(Object.keys(imports.imports).sort(), ['authz.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'queue.cjs'].map((name) => `capability/C009/${name}`));
  for (const [relative, pin] of Object.entries(imports.imports)) {
    const bytes = fs.readFileSync(path.join(REPOSITORY, relative));
    assert.ok([pin.rawSha256, pin.canonicalLfSha256].includes(sha(bytes)) || sha(lf(bytes)) === pin.canonicalLfSha256, `${relative}: the working file equals its pin (raw or LF)`);
    assert.equal(sha(lf(bytes)), pin.canonicalLfSha256, `${relative}: LF form`);
    if (hasGit) {
      assert.equal(git('rev-parse', `${imports.accepted.C009.commit}:${relative}`).toString().trim(), pin.gitBlob, `${relative}: git blob at the pinned commit`);
      assert.equal(sha(git('cat-file', 'blob', `${imports.accepted.C009.commit}:${relative}`)), pin.acceptedGitSha256, `${relative}: blob bytes`);
      assert.ok(sha(lf(git('cat-file', 'blob', `${imports.accepted.C009.commit}:${relative}`))) === pin.canonicalLfSha256, `${relative}: blob LF form`);
    }
    if (hasConfirmed) assert.equal(git('rev-parse', `${imports.accepted.C009.confirmed.commit}:${relative}`).toString().trim(), pin.gitBlob, `${relative}: the same blob at the commit that C009 was accepted on`);
  }
  if (hasGit) assert.equal(git('rev-parse', `${imports.accepted.C009.tag}^{commit}`).toString().trim(), imports.accepted.C009.commit, 'the tag resolves to the pinned commit');
  if (hasConfirmed) assert.equal(git('rev-parse', `${imports.accepted.C009.confirmed.tag}^{commit}`).toString().trim(), imports.accepted.C009.confirmed.commit, 'the accepted tag resolves to the accepted commit');
  assert.match(imports.status, /C009 is ACCEPTED/);
  assert.ok(imports.status.includes(imports.accepted.C009.confirmed.commit.slice(0, 12)), 'the status names the commit it was accepted on');
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
  'fresh/lf-01/fresh-lf-01': true
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
  for (const [name, [tamper, expected]] of Object.entries(cases)) {
    const copy = scratchCopy(first);
    try {
      assert.deepEqual(checkManifest(copy.file, { repository: copy.directory }), [], `${name}: the pristine copy is clean`);
      tamper(copy);
      const problems = checkManifest(copy.file, { repository: copy.directory });
      assert.ok(problems.some((problem) => expected.test(problem)), `${name}: ${JSON.stringify(problems)}`);
    } finally { fs.rmSync(copy.directory, { recursive: true, force: true }); }
  }
});

function mutationEvidence() {
  const directory = path.join(ROOT, 'evidence', 'mutants');
  const names = fs.readdirSync(directory);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  return {
    reports: names.filter((name) => /^systematic-\d+.*\.json$/.test(name)).sort().map(read),
    reruns: names.filter((name) => /^rerun-\d+.*\.json$/.test(name)).sort().map(read),
    equivalents: names.includes('equivalents.json') ? read('equivalents.json') : []
  };
}

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
  const file = Object.keys(evidence.reports[0].files)[0];
  const rerun = new Set(evidence.reruns.flatMap((report) => (report.files[file] ? report.files[file].results.map((result) => result.index) : [])));
  const pick = (copy) => { const entry = copy.reports[0].files[file]; return { entry, result: entry.results.find((item) => item.killed && !item.crash && !rerun.has(item.index)) }; };
  const cases = {
    'a removed result': [(copy) => { const { entry, result } = pick(copy); entry.results.splice(entry.results.indexOf(result), 1); }, /never run/],
    'a kill turned into a survivor': [(copy) => { const { result } = pick(copy); result.killed = false; result.failing = []; }, /survived and is not listed as equivalent/],
    'an undecided run': [(copy) => { const { result } = pick(copy); result.killed = false; result.timedOut = true; }, /undecided/],
    'a kill without a named failing test': [(copy) => { const { result } = pick(copy); result.failing = []; }, /killed without a named failing test/],
    'a report made for other source bytes': [(copy) => { copy.reports[0].files[file].sourceLfSha256 = '0'.repeat(64); }, /no campaign report was made for the current source bytes/],
    'no green control run': [(copy) => { delete copy.reports[0].files[file].control; }, /no green control run/]
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
  const file = manifests().find((item) => path.basename(item, '.json') === 'loop-load-03');
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
  const file = manifests().find((item) => path.basename(item, '.json') === 'browser-run-05');
  assert.ok(file, 'the real Edge capture is stored');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stdout = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(file), manifest.transcripts.stdout.path.replace(/\\/g, '/')))).toString('utf8');
  assert.match(stdout, /^PASS the installed Edge is Microsoft-signed and its major is qualified: .*"signature":"Valid","publisher":"Microsoft Corporation"/m);
  for (const check of ['the real service: nothing the browser holds contains a canary', 'a forging server cannot make the page print a canary', 'keyboard: Tab reaches reload then the download link']) assert.ok(stdout.includes(`PASS ${check}`), check);
  assert.match(stdout, /^C014 BROWSER OK$/m);
});

test('the cleanup proof of the real browser: an injected failure failed the run and its finally block still closed the real session (archived capture and the hook in browser.cjs)', () => {
  const file = manifests().find((item) => path.basename(item, '.json') === 'browser-cleanup-02');
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
  const files = manifests().filter((item) => item.includes(`${path.sep}coverage${path.sep}`)).sort();
  const file = files[files.length - 1];
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

test('the fresh-checkout captures: the whole suite is green in a tree of git-archive blobs (LF) and in the same tree converted to CRLF, and the README states their figures', () => {
  const lfCapture = manifests().find((item) => path.basename(item, '.json') === 'fresh-lf-02');
  const crlfCapture = manifests().find((item) => path.basename(item, '.json') === 'fresh-crlf-02');
  if (FRESH_COPY) return; // this tree IS a copy made by tests\fresh.cjs: the fresh captures it may hold describe the tree it was copied from, and its README has no figures of its own to compare
  assert.ok(lfCapture && crlfCapture, 'both fresh-checkout captures are stored');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const suite = manifests().find((item) => path.basename(item, '.json') === 'green-suite-02');
  const wanted = JSON.parse(fs.readFileSync(suite, 'utf8')).summary.tests;
  for (const [name, capture] of [['LF', lfCapture], ['CRLF', crlfCapture]]) {
    const summary = JSON.parse(fs.readFileSync(capture, 'utf8')).summary;
    assert.equal(summary.fail, 0, `${name}: no failing test`);
    assert.equal(summary.cancelled, 0, `${name}: no cancelled test`);
    assert.equal(summary.skipped, 0, `${name}: no skipped test`);
    assert.equal(summary.pass, summary.tests, `${name}: every test passed`);
    assert.ok(summary.tests >= wanted, `${name}: ${summary.tests} tests, the whole suite and the integrity test (at least ${wanted})`);
    assert.match(readme, new RegExp(`FRESH-CHECKOUT-${name}: ${summary.pass} of ${summary.tests}\\b`), `the README states the ${name} figures`);
  }
});

test('every claim of the README claims table is backed by a test that exists: the named file holds a test whose title starts with the stated words', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const block = /<!-- claims:begin -->([^]*?)<!-- claims:end -->/.exec(readme);
  assert.ok(block, 'the README has a claims table');
  const rows = block[1].split(/\r?\n/).filter((line) => /^\| /.test(line) && !/^\| Claim /.test(line)).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  assert.ok(rows.length >= 20, `${rows.length} claims are listed`);
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [claim, file, start] of rows) {
    assert.ok(claim.length > 20 && /^[\w.-]+\.test\.cjs$/.test(file) && start.length >= 12, `a well formed row: ${claim.slice(0, 40)}`);
    const source = fs.readFileSync(path.join(ROOT, 'tests', file), 'utf8');
    assert.match(source, new RegExp(`test\\((['"\`])${escape(start)}`), `${file} holds a test that starts with "${start}"`);
  }
});

test('the figures the README states are the figures of the stored evidence', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const block = /<!-- figures:begin -->\s*```json\s*([^]*?)```\s*<!-- figures:end -->/.exec(readme);
  assert.ok(block, 'the README has a figures block');
  const figures = JSON.parse(block[1]);
  const summaries = Object.fromEntries(manifests().map((file) => [path.basename(file, '.json'), JSON.parse(fs.readFileSync(file, 'utf8')).summary]));
  for (const [name, expected] of Object.entries(figures.captures || {})) {
    assert.ok(summaries[name], `${name}: the capture is stored`);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(summaries[name][key], value, `${name}.${key}`);
  }
  assert.ok(Object.keys(figures.captures || {}).length >= 6, 'the README states the RED, the replay, the suite, the loop and both fresh-checkout runs');
  const coverage = manifests().find((file) => path.basename(file, '.json') === figures.coverage.capture);
  assert.ok(coverage, 'the coverage capture of the README is stored');
  assert.deepEqual(Object.fromEntries(printedDocument(coverage).results.map((result) => [result.file, [result.row.lines, result.row.branches, result.row.functions]])), figures.coverage.files);
  const totals = mutantTotals(mutationEvidence());
  assert.deepEqual({ generated: totals.generated, killed: totals.killed, crash: totals.crash, equivalent: totals.equivalent }, figures.mutants);
});
