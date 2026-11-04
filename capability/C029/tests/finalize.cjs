'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const source = require('..\\source.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
assert.equal(process.argv.length, 2);
assert.equal(fs.existsSync(path.join(root, 'evidence-index.json')), false, 'Never replace an existing final evidence index.');
const raw = path.join(root, 'evidence', 'raw');
const records = fs.readdirSync(raw).map((name) => {
  const directory = path.join(raw, name);
  assert.equal(fs.lstatSync(directory).isDirectory(), true);
  assert.equal(fs.realpathSync(directory), directory);
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'run.json')));
  assert.equal(record.directory, path.relative(repository, directory));
  assert.equal(record.cardId, 'C029');
  assert.equal(record.workerId, 'worker-C029');
  return { ...record, recordPath: path.relative(repository, path.join(directory, 'run.json')) };
}).sort((a, b) => a.startedAtUtc.localeCompare(b.startedAtUtc));
const earliest = (stage) => {
  const found = records.find((record) => record.stage === stage);
  assert.ok(found, `Missing ${stage}`);
  return found;
};
const latestGreen = (stage) => {
  const found = records.findLast((record) => record.stage === stage && record.exitCode === 0);
  assert.ok(found, `No genuine GREEN ${stage}`);
  return found;
};
const workflow = ['bdd', 'stub', 'red', 'iac', 'implementation'].map(earliest);
for (let index = 1; index < workflow.length; index++) {
  assert.ok(workflow[index].startedAtUtc >= workflow[index - 1].completedAtUtc, 'The retained actual workflow must be ordered, not retrospective.');
}
assert.equal(earliest('red').exitCode, 1);
const green = ['focused', 'syntax', 'browser', 'verify'].map(latestGreen);
for (const record of records) {
  for (const name of ['stdout', 'stderr']) {
    const bytes = gunzipSync(fs.readFileSync(path.join(repository, record.directory, `${name}.raw.gz`)), { maxOutputLength: 4 * 1024 * 1024 });
    assert.equal(source.hash(bytes), record[`${name}Sha256`]);
  }
}
const focused = latestGreen('focused');
const stdout = gunzipSync(fs.readFileSync(path.join(repository, focused.directory, 'stdout.raw.gz'))).toString('utf8');
const focusedTests = Number(/^# tests (\d+)$/m.exec(stdout)?.[1]);
assert.ok(focusedTests >= 86);
assert.match(stdout, /^# fail 0$/m);
const browser = latestGreen('browser');
const summaryPath = path.join(browser.directory, 'summary.json');
const summary = JSON.parse(fs.readFileSync(path.join(repository, summaryPath)));
assert.equal(summary.outcome, 'passed');
assert.equal(summary.checks.length, 14);
assert.ok(summary.checks.every((check) => check.passed === true));
assert.ok(Object.values(summary.cleanup).every((value) => value === true));
assert.equal(summary.userJourneySuccess, false);
assert.equal(summary.actualSignedEdge.authenticodeStatus, 'Valid');
assert.equal(summary.helperRawSha256, source.pins.browserHelperRawSha256);
const core = ['evaluator.js', 'page.js', 'index.html', 'style.css', 'cli.cjs', 'source.cjs',
  'publisher-policy.cjs', 'publisher-policy.json', 'publish.ps1'];
for (const record of green) {
  for (const name of core) {
    const relative = path.join('capability', 'C029', name);
    const pin = record.sourceHashes.find((entry) => entry.path === relative);
    assert.ok(pin, `GREEN ${record.stage} must identify current ${name}`);
    assert.equal(source.hash(fs.readFileSync(path.join(root, name))), pin.rawSha256);
  }
}
const files = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    assert.equal(fs.realpathSync(file), file);
    if (entry.isDirectory()) visit(file);
    else {
      const bytes = fs.readFileSync(file);
      assert.equal(fs.lstatSync(file).nlink, 1);
      files.push({
        path: path.relative(repository, file), size: bytes.length, rawSha256: source.hash(bytes),
        crlfToLfTextSha256: /\.(?:md|js|cjs|json|css|html|ps1|feature)$/.test(file) ?
          source.hash(source.normalize(bytes)) : null
      });
    }
  }
}
visit(root);
const historical = source.checkHistorical();
const result = {
  schema: 'C029-immutable-evidence-index/1', cardId: 'C029', workerId: 'worker-C029',
  frozenClass: 'D', packet: 'H001', parents: ['H001', 'H006', 'H012'],
  finalizedAtUtc: new Date().toISOString(),
  exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1; exclusive creation, never refresh',
  workflow: workflow.map((record) => ({ stage: record.stage, path: record.recordPath, exitCode: record.exitCode })),
  green: green.map((record) => ({ stage: record.stage, path: record.recordPath, exitCode: record.exitCode })),
  allHistoricalCaptures: records.map((record) => ({ stage: record.stage, path: record.recordPath, exitCode: record.exitCode })),
  retainedFailures: records.filter((record) => record.exitCode !== 0).map((record) => ({
    stage: record.stage, path: record.recordPath, exitCode: record.exitCode,
    meaning: 'Actual failure retained; not replaced or relabeled by later verification.'
  })),
  browserSummary: path.relative(repository, path.join(repository, summaryPath)),
  proofCounts: {
    focusedNodeTests: focusedTests, focusedFailures: 0, actualBrowserChecks: summary.checks.length,
    exactAcceptedSourceFiles: historical.imports.length, genuineOriginalAssertionRed: 1,
    originalKanoCreditRequested: 1, extraTestRepairRefinementCredits: 0
  },
  historicalSources: historical.imports,
  privatePublisherPolicy: 'Immutable historical sources and this seal are separate from live current publication authorization. Normal tests never compare future private publisher bytes with old pins.',
  files
};
fs.writeFileSync(path.join(root, 'evidence-index.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(`Finalized once: ${files.length} immutable own files, ${focusedTests} focused tests, ${summary.checks.length} actual UI checks, ${historical.imports.length} exact accepted sources.`);
