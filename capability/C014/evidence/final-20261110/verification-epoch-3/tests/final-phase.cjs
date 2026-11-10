'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, REPOSITORY, sha, lf, verifyBaseline } = require('./final-base.cjs');
const { sealedNames, verifySeal } = require('./seal.cjs');
const { manifests, checkManifest, printedDocument, checkMutants, mutationEvidence } = require('./evidence-check.cjs');
const zlib = require('node:zlib');
const DIRECTORY = path.join(ROOT, 'evidence', 'final-20261110');
const FREEZE = path.join(DIRECTORY, 'source-freeze-3.json');
const SEAL = path.join(DIRECTORY, 'seal-final-3.json');
const PRODUCTION = ['canon.cjs', 'redact.cjs', 'vault.cjs', 'evidence.cjs', 'service.cjs', 'server.cjs', 'page.js'].sort();
const REUSED = ['mutants-final-06', 'curated-final-01', 'equivalences-final-01', 'coverage-focused-06', 'browser-run-07', 'browser-cleanup-04',
  'loop-load-06', 'review-repro-final-01', 'review-flood-final-01', 'red-family-final-03', 'green-family-final-04'];
const REQUIRED = ['green-suite-07', 'mutants-final-06', 'curated-final-01', 'equivalences-final-01', 'coverage-focused-06',
  'browser-run-07', 'browser-cleanup-04', 'loop-load-06', 'review-repro-final-01', 'review-flood-final-01',
  'red-family-final-03', 'green-family-final-04', 'green-replay-original-08', 'fresh-lf-05', 'fresh-crlf-04',
  'final-current-all-01', 'tamper-final-01', 'source-git-final-01', 'privacy-final-01'];
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('source links are not allowed');
    return entry.isDirectory() ? entry.name === 'scratch' ? [] : walk(file) : [file];
  });
}
function sourceNames() {
  return [...fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name),
    ...walk(path.join(ROOT, 'tests')).map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))].sort();
}
function freeze() {
  assert.deepEqual(verifyBaseline(), [], 'all original source witnesses and raw proof remain exact');
  assert.deepEqual(fs.readdirSync(ROOT).filter((name) => /\.(?:cjs|js)$/.test(name)).sort(), PRODUCTION);
  const sources = {};
  for (const name of sourceNames()) {
    const bytes = fs.readFileSync(path.join(ROOT, name));
    sources[name] = { rawSha256: sha(bytes), canonicalLfSha256: sha(lf(bytes)) };
  }
  const dependencies = {};
  for (const [file, pin] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json'))).imports)) dependencies[file] = { canonicalLfSha256: pin.canonicalLfSha256 };
  for (const [file, pin] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.final.json'))).imports)) dependencies[file] = { canonicalLfSha256: pin.canonicalLfSha256 };
  const external = {};
  for (const name of ['C014.fix.repro.cjs', 'C014.fix.floodloop.cjs']) {
    assert.ok(process.env.C014_REVIEW_DIR, 'the actual reviewer source directory is explicit');
    external[name] = sha(fs.readFileSync(path.join(process.env.C014_REVIEW_DIR, name)));
  }
  assert.ok(process.env.C014_SHARED_RECORDER);
  const sharedRecorderSha256 = sha(fs.readFileSync(process.env.C014_SHARED_RECORDER));
  const executionSha256 = sha(fs.readFileSync(path.join(REPOSITORY, 'final-run.ps1')));
  const continuationSha256 = sha(fs.readFileSync(path.join(REPOSITORY, 'final-continue-3.ps1')));
  const previousFreezeSha256 = sha(fs.readFileSync(path.join(DIRECTORY, 'source-freeze-2.json')));
  fs.writeFileSync(FREEZE, JSON.stringify({ schema: 'C014-final-source-freeze/3', production: PRODUCTION, sources, dependencies, external, sharedRecorderSha256, executionSha256, continuationSha256, previousFreezeSha256,
    rule: 'No source or README edits after this record. Later captures are evidence additions, not replacement source.' }, null, 2) + '\n', { flag: 'wx' });
  return Object.keys(sources).length;
}
function verifySource() {
  if (!fs.existsSync(FREEZE)) return ['SOURCE_FREEZE_MISSING'];
  const document = JSON.parse(fs.readFileSync(FREEZE));
  const problems = [];
  if (JSON.stringify(Object.keys(document.sources).sort()) !== JSON.stringify(sourceNames())) problems.push('SOURCE_FILE_SET_CHANGED');
  for (const [name, pin] of Object.entries(document.sources)) {
    if (!fs.existsSync(path.join(ROOT, name)) || sha(lf(fs.readFileSync(path.join(ROOT, name)))) !== pin.canonicalLfSha256) problems.push(`SOURCE_CHANGED: ${name}`);
  }
  for (const [name, pin] of Object.entries(document.dependencies)) {
    if (!fs.existsSync(path.join(REPOSITORY, name)) || sha(lf(fs.readFileSync(path.join(REPOSITORY, name)))) !== pin.canonicalLfSha256) problems.push(`DEPENDENCY_CHANGED: ${name}`);
  }
  for (const [name, digest] of Object.entries(document.external)) {
    try { if (!process.env.C014_REVIEW_DIR || sha(fs.readFileSync(path.join(process.env.C014_REVIEW_DIR, name))) !== digest) problems.push(`REVIEW_SOURCE_CHANGED: ${name}`); }
    catch { problems.push(`REVIEW_SOURCE_MISSING: ${name}`); }
  }
  if (!process.env.C014_SHARED_RECORDER || sha(fs.readFileSync(process.env.C014_SHARED_RECORDER)) !== document.sharedRecorderSha256) problems.push('SHARED_RECORDER_CHANGED');
  if (sha(fs.readFileSync(path.join(REPOSITORY, 'final-run.ps1'))) !== document.executionSha256) problems.push('PRIVATE_EXECUTION_CHANGED');
  if (sha(fs.readFileSync(path.join(REPOSITORY, 'final-continue-3.ps1'))) !== document.continuationSha256) problems.push('PRIVATE_CONTINUATION_CHANGED');
  return problems;
}
function seal() {
  assert.deepEqual(verifySource(), []);
  const files = {};
  const lfs = {};
  for (const name of [...sealedNames(), 'evidence/seal.json', 'evidence/final-20261110/seal-final.json', 'evidence/final-20261110/seal-final-2.json'].sort()) {
    const bytes = fs.readFileSync(path.join(ROOT, name));
    files[name] = sha(bytes);
    lfs[name] = sha(lf(bytes));
  }
  fs.writeFileSync(SEAL, JSON.stringify({ schemaVersion: 1, sourceFreezeSha256: sha(fs.readFileSync(FREEZE)),
    predecessorSealSha256: sha(fs.readFileSync(path.join(ROOT, 'evidence', 'seal.json'))), files, lf: lfs }, null, 2) + '\n', { flag: 'wx' });
  return Object.keys(files).length;
}
function verifyCurrentSeal() {
  if (!fs.existsSync(SEAL)) return ['FINAL_SEAL_MISSING'];
  const document = JSON.parse(fs.readFileSync(SEAL));
  const problems = verifySeal(document, { names: [...sealedNames(), 'evidence/seal.json'], read: (name) => fs.existsSync(path.join(ROOT, name)) ? fs.readFileSync(path.join(ROOT, name)) : undefined });
  if (document.sourceFreezeSha256 !== sha(fs.readFileSync(FREEZE))) problems.push('SOURCE_FREEZE_ANCHOR_CHANGED');
  if (document.predecessorSealSha256 !== sha(fs.readFileSync(path.join(ROOT, 'evidence', 'seal.json')))) problems.push('PREDECESSOR_SEAL_CHANGED');
  return problems;
}
function originalStream(entry, directory) {
  const file = path.join(directory, entry.path || entry.privatePath);
  const compressed = fs.readFileSync(file);
  assert.equal(sha(compressed), entry.gzipSha256, 'exact private gzip bytes');
  const bytes = zlib.gunzipSync(compressed);
  assert.equal(bytes.length, entry.bytes, 'exact private decoded size');
  assert.equal(sha(bytes), entry.sha256, 'exact private original stream bytes');
  return bytes;
}
function projected(bytes) {
  return bytes.toString('utf8').split(REPOSITORY.replace(/\\/g, '\\\\')).join('<REPO>').split(REPOSITORY).join('<REPO>')
    .split(REPOSITORY.replace(/\\/g, '/')).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/g, '<HOME>');
}
function complete() {
  const problems = [...verifyBaseline(), ...verifySource(), ...verifyCurrentSeal()];
  if (process.env.C014_PHASE !== 'final' || !process.env.C014_PRIVATE_EVIDENCE) return [...problems, 'EXPLICIT_PRIVATE_FINAL_PHASE_REQUIRED'];
  const privateRoot = process.env.C014_PRIVATE_EVIDENCE;
  const receipts = {};
  for (const name of REQUIRED) {
    try {
      const directory = path.join(privateRoot, 'final-captures', name);
      const file = path.join(directory, `${name}.json`);
      const receipt = JSON.parse(fs.readFileSync(file));
      const expected = name === 'red-family-final-03' ? 1 : 0;
      assert.equal(receipt.exitCode, expected);
      assert.equal(receipt.expectedExitCode, expected);
      assert.equal(receipt.timedOut, false);
      assert.deepEqual(checkManifest(file, require('./final-base.cjs').captureOptions(file)), []);
      const authority = JSON.parse(fs.readFileSync(path.join(directory, 'recorder-authority.json')));
      assert.equal(authority.phase, 'final');
      const currentAnchor = authority.phaseAnchor.sourceFreezeSha256 === sha(fs.readFileSync(FREEZE));
      if (currentAnchor) assert.equal(authority.phaseAnchor.sealSha256, sha(fs.readFileSync(SEAL)));
      else {
        assert.ok(REUSED.includes(name), 'only an exact named source-matching prior execution can be reused');
        assert.equal(authority.phaseAnchor.sourceFreezeSha256, sha(fs.readFileSync(path.join(DIRECTORY, 'source-freeze.json'))));
        assert.equal(authority.phaseAnchor.sealSha256, sha(fs.readFileSync(path.join(DIRECTORY, 'seal-final.json'))));
        for (const input of receipt.inputs) assert.equal(sha(lf(fs.readFileSync(path.join(REPOSITORY, input.path)))), input.crlfToLfSha256, `reused executed input is unchanged: ${input.path}`);
      }
      const originalDirectory = path.join(privateRoot, 'underlying', name);
      const original = JSON.parse(fs.readFileSync(path.join(originalDirectory, 'original.json')));
      assert.equal(original.exit, expected);
      for (const stream of ['stdout', 'stderr']) {
        const bytes = originalStream(original.streams[stream], originalDirectory);
        const recorded = originalStream(receipt.transcripts[stream], directory);
        assert.equal(recorded.toString('utf8'), projected(bytes), 'the path-projected wrapper stream is not relabeled original raw');
      }
      receipts[name] = { file, receipt };
    } catch (error) { problems.push(`FINAL_RECEIPT_INVALID: ${name}: ${error.code || error.name}`); }
  }
  if (problems.length) return problems;
  try {
    const suite = printedDocument(receipts['green-suite-07'].file);
    assert.ok(suite.totals.tests > 0 && suite.totals.pass === suite.totals.tests);
    assert.deepEqual(suite.broken, []);
    const coverage = printedDocument(receipts['coverage-focused-06'].file);
    assert.deepEqual(coverage.enumerated, PRODUCTION);
    assert.deepEqual([coverage.unlisted, coverage.missing], [[], []]);
    assert.equal(coverage.results.length, PRODUCTION.length);
    for (const row of coverage.results) assert.ok(row.exit === 0 && row.row && [row.row.lines, row.row.branches, row.row.functions].every((value) => value >= 85));
    const mutations = mutationEvidence();
    assert.deepEqual(checkMutants(mutations), []);
    const verifyRun = (run) => {
      const stdout = originalStream(run.streams.stdout, privateRoot).toString('utf8').replace(/\r\n/g, '\n');
      originalStream(run.streams.stderr, privateRoot);
      if (run.killed) {
        assert.ok(!run.invalid && !run.timedOut && !run.crash && run.failing.length > 0);
        for (const name of run.failing) assert.ok(stdout.includes(name), 'named kill is in its actual original TAP');
      }
      if (run.workBarrier) verifyRun(run.workBarrier);
    };
    for (const entry of Object.values(mutations.reports[0].files)) {
      verifyRun(entry.control);
      for (const row of entry.results) verifyRun(row);
    }
    const curated = JSON.parse(fs.readFileSync(path.join(privateRoot, 'curated-final.json')));
    assert.deepEqual(curated.unresolved, []);
    assert.equal(curated.undecided, 0);
    assert.equal(curated.killed + curated.equivalent, curated.total);
    for (const run of [...Object.values(curated.controls), ...curated.results]) verifyRun(run);
    const witnesses = printedDocument(receipts['equivalences-final-01'].file);
    assert.equal(witnesses.total, 35);
    assert.equal(witnesses.passed, witnesses.total);
    const loop = printedDocument(receipts['loop-load-06'].file);
    assert.deepEqual([loop.runs, loop.parallel, loop.burners.count, loop.burners.allStopped], [20, 4, 4, true]);
    const rows = loop.results.flatMap((entry) => entry.rows);
    assert.equal(rows.length, 120);
    assert.deepEqual(loop.failures, []);
    for (const row of rows) {
      assert.ok(row.ok && row.tests > 0 && row.tests === row.pass && !row.endedByGuard);
      for (const stream of ['stdout', 'stderr']) originalStream(row.originalStreams[stream], privateRoot);
    }
    for (const [kind, name] of [['lf', 'fresh-lf-05'], ['crlf', 'fresh-crlf-04']]) {
      const summary = receipts[name].receipt.summary;
      assert.ok(summary.tests > 0 && summary.pass + summary.skipped === summary.tests && summary.fail === 0);
      assert.equal(summary.skipped, 3);
      const directory = path.join(privateRoot, 'fresh-children', name);
      const fresh = JSON.parse(fs.readFileSync(path.join(directory, 'original.json')));
      assert.equal(fresh.mode, kind);
      assert.equal(fresh.exit, 0);
      for (const stream of ['stdout', 'stderr']) originalStream(fresh.streams[stream], directory);
      const freeze = JSON.parse(fs.readFileSync(FREEZE));
      for (const [file, pin] of Object.entries(freeze.sources)) assert.equal(fresh.sourcePins[file].canonicalLfSha256, pin.canonicalLfSha256);
    }
    for (const phase of ['behavioral-3', 'current', 'lf-05', 'crlf']) {
      const directory = path.join(privateRoot, 'census', phase);
      const reports = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(fs.readFileSync(path.join(directory, name))));
      const rows = reports.flatMap((report) => report.rows).filter((row) => row.executed);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((row) => row.assertions > 0 || row.children > 0 || typeof row.skipped === 'string'));
      assert.deepEqual(reports.flatMap((report) => report.vacuous), []);
    }
    assert.equal(receipts['final-current-all-01'].receipt.summary.fail, 0);
    assert.equal(receipts['final-current-all-01'].receipt.summary.skipped, 0);
    assert.equal(receipts['final-current-all-01'].receipt.summary.tests, receipts['final-current-all-01'].receipt.summary.pass);
  } catch (error) { problems.push(`CURRENT_EVIDENCE_INVARIANT_FAILED: ${error.code || error.name}: ${error.message}`); }
  return problems;
}
if (require.main === module) {
  const operation = process.argv[2];
  if (operation === 'freeze') console.log(`Source frozen: ${freeze()} files.`);
  else if (operation === 'seal') console.log(`Append-only seal: ${seal()} files.`);
  else {
    const problems = operation === '--complete' ? complete() : [...verifyBaseline(), ...verifySource(), ...verifyCurrentSeal()];
    if (operation === '--complete') {
      for (const file of manifests()) {
        const { captureOptions } = require('./final-base.cjs');
        problems.push(...checkManifest(file, captureOptions(file)));
      }
    }
    console.log(JSON.stringify({ schema: 'C014-final-phase/1', ok: problems.length === 0, problems }, null, 2));
    if (problems.length) process.exitCode = 1;
  }
}
module.exports = { ROOT, REPOSITORY, DIRECTORY, FREEZE, SEAL, PRODUCTION, REQUIRED, sourceNames, freeze, verifySource, seal, verifyCurrentSeal, complete };
