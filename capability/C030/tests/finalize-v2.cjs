'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Only exact deliberate capture can create an immutable amendment seal.');
assert.equal(process.argv.length, 2);
const target = path.join(root, 'evidence-index-v2.json');
assert.equal(fs.existsSync(target), false, 'A seal is never rewritten.');
const original = fs.readFileSync(path.join(root, 'evidence-index.json'));
const seal = JSON.parse(original.toString('utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const entry = (file) => {
  const bytes = fs.readFileSync(file);
  return { path: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes) };
};
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((item) => {
    const file = path.join(directory, item.name);
    assert.equal(item.isSymbolicLink(), false);
    return item.isDirectory() ? walk(file) : [file];
  });
}
const evidenceRoot = path.join(root, 'evidence');
const sealedEvidence = new Set(seal.files.map((file) => file.path));
for (const file of seal.files) assert.deepEqual(entry(path.join(root, file.path)), file, `Sealed evidence changed: ${file.path}`);
const addedEvidence = walk(evidenceRoot).map(entry).filter((file) => !sealedEvidence.has(file.path));
const currentArtifacts = walk(root).filter((file) => !file.startsWith(`${evidenceRoot}${path.sep}`) &&
  file !== path.join(root, 'evidence-index.json')).map(entry);
const replacedArtifacts = seal.artifactFiles.flatMap((file) => {
  const current = currentArtifacts.find((item) => item.path === file.path);
  assert.ok(current, `Sealed artifact missing: ${file.path}`);
  return current.sha256 === file.sha256 ? [] : [{ path: file.path, supersedesSha256: file.sha256, bytes: current.bytes, sha256: current.sha256 }];
});
assert.deepEqual(replacedArtifacts.map((file) => file.path), ['README.md', 'tests\\integrity.test.cjs', 'tests\\record.cjs', 'tests\\verify.cjs'],
  'Only the named documentation and test tooling may supersede sealed artifacts; every production source stays byte exact.');
const sealedArtifacts = new Set(seal.artifactFiles.map((file) => file.path));
const addedArtifacts = currentArtifacts.filter((file) => !sealedArtifacts.has(file.path));
assert.ok(addedArtifacts.every((file) => file.path === 'integrity.feature' || file.path.startsWith('tests\\')));
const raw = path.join(evidenceRoot, 'raw');
const captures = fs.readdirSync(raw, { withFileTypes: true }).filter((item) =>
  item.isDirectory() && fs.existsSync(path.join(raw, item.name, 'record.json'))).map((item) => {
  const directory = path.join(raw, item.name);
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'record.json'), 'utf8'));
  return { ...record, directory: path.relative(root, directory),
    stdout: gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz'))).toString('utf8') };
}).sort((a, b) => a.endedAtUtc.localeCompare(b.endedAtUtc));
function latest(stage, passed) {
  const found = captures.filter((record) => record.stage === stage && (record.exitCode === 0) === passed).at(-1);
  assert.ok(found, `${passed ? 'Successful' : 'Failing'} ${stage} capture required.`);
  return found;
}
const nestedRed = latest('nested-red', false);
const nestedGreen = latest('nested-green', true);
const coverageRed = latest('coverage-red', false);
const coverage = latest('coverage', true);
const browser = latest('browser', true);
assert.ok(nestedRed.endedAtUtc <= nestedGreen.startedAtUtc);
assert.ok(coverageRed.endedAtUtc <= coverage.startedAtUtc);
assert.ok(nestedRed.endedAtUtc <= browser.startedAtUtc);
const summary = JSON.parse(coverage.stdout.trim().split(/\r?\n/).at(-1));
assert.equal(summary.passed, true);
const browserSummary = JSON.parse(fs.readFileSync(path.join(root, browser.directory, 'browser', 'summary.json'), 'utf8'));
assert.equal(browserSummary.outcome, 'passed');
fs.writeFileSync(target, JSON.stringify({
  schema: 'C030-evidence-index/2', sealedAtUtc: new Date().toISOString(),
  supersedes: { path: 'evidence-index.json', bytes: original.length, sha256: hash(original) },
  meaning: 'Append-only amendment of the v1 seal: v1 stays byte exact. v2 names each replaced documentation or test-tooling artifact with the v1 hash it supersedes and appends the new tests, red copies and raw captures. Later unique proof appends are not retroactively called sealed.',
  reason: 'L-0002 nested node --test environment defect, plus per-file 85/85/85 coverage over every production script.',
  captures: { nestedRed: nestedRed.directory, nestedGreen: nestedGreen.directory, coverageRed: coverageRed.directory,
    coverage: coverage.directory, browser: browser.directory },
  proofCounts: {
    nestedRunnerRedFailures: Number(/^# fail (\d+)/m.exec(nestedRed.stdout)?.[1]),
    coverageThreshold: summary.threshold, productionScripts: summary.productionFiles.length,
    coverage: summary.coverage.map(({ file, lines, branches, functions }) => ({ file, lines, branches, functions })),
    actualBrowserChecks: browserSummary.checks.length, originalKanoUnits: 1, extraRepairOrTestCredits: 0
  },
  replacedArtifacts, addedArtifacts, addedEvidence
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cardId: 'C030', replacedArtifacts: replacedArtifacts.length, addedArtifacts: addedArtifacts.length,
  addedEvidence: addedEvidence.length, captures: [nestedRed.directory, nestedGreen.directory, coverageRed.directory, coverage.directory, browser.directory] }));
