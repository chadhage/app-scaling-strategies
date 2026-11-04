'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Only exact deliberate capture can create an immutable evidence index.');
assert.equal(process.argv.length, 2);
const target = path.join(root, 'evidence-index.json');
assert.equal(fs.existsSync(target), false, 'A seal is never rewritten.');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(path.join(root, 'evidence')).map((file) => ({
  path: path.relative(root, file), bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file))
}));
const raw = path.join(root, 'evidence', 'raw');
const captures = fs.readdirSync(raw, { withFileTypes: true }).filter((entry) =>
  entry.isDirectory() && fs.existsSync(path.join(raw, entry.name, 'record.json'))).map((entry) => {
  const directory = path.join(raw, entry.name);
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'record.json'), 'utf8'));
  return { ...record, directory: path.relative(root, directory),
    stdout: gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz'))).toString('utf8') };
}).sort((a, b) => a.endedAtUtc.localeCompare(b.endedAtUtc));
const latest = (stage) => captures.filter((record) => record.stage === stage && record.exitCode === 0).at(-1);
for (const stage of ['bdd', 'stub', 'iac', 'implementation', 'pins', 'focused', 'syntax', 'browser']) assert.ok(latest(stage), `Successful ${stage} required.`);
const red = captures.find((record) => record.stage === 'red');
assert.equal(red.exitCode, 1);
assert.match(red.stdout, /ERR_ASSERTION/);
assert.match(red.stdout, /'PASS' !== 'HOLD'/);
assert.ok(latest('bdd').endedAtUtc <= latest('stub').startedAtUtc);
assert.ok(latest('stub').endedAtUtc <= red.startedAtUtc);
assert.ok(red.endedAtUtc <= latest('iac').startedAtUtc);
const focused = latest('focused');
const syntax = JSON.parse(latest('syntax').stdout.trim());
const browser = JSON.parse(fs.readFileSync(path.join(root, latest('browser').directory, 'browser', 'summary.json'), 'utf8'));
assert.equal(browser.outcome, 'passed');
assert.ok(Object.values(browser.cleanup).every((value) => value === true));
const testCount = Number(/# tests (\d+)/.exec(focused.stdout)?.[1]);
assert.ok(testCount >= 155);
assert.match(focused.stdout, /# fail 0/);
const artifactFiles = walk(root).filter((file) => !file.startsWith(`${path.join(root, 'evidence')}${path.sep}`)).map((file) => ({
  path: path.relative(root, file), bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file))
}));
const proofCounts = {
  focusedTests: testCount, focusedFailed: 0, javaScriptSyntaxScripts: syntax.javaScriptScripts,
  powerShellSyntaxScripts: syntax.powerShellScripts, actualBrowserChecks: browser.checks.length,
  sourceFiles: require('..\\imports.json').dependencies.length, separateSourceWorkingCanonicalSnapshots: 54,
  closedSources: require('..\\detector.js').sourceIds.length, transportRestorationCases: 4,
  retainedBehavioralRedRuns: captures.filter((record) => record.stage === 'red' && record.exitCode === 1).length,
  retainedFailedVerificationRuns: captures.filter((record) => record.stage !== 'red' && record.exitCode !== 0).length,
  retainedFailedBrowserRuns: captures.filter((record) => record.stage === 'browser' && record.exitCode !== 0).length,
  rawCommandCapturesAtSeal: captures.length, originalKanoUnits: 1, extraRepairOrTestCredits: 0,
  nativeAzureProofs: 0, productionNode24Qualifications: 0, completedSourceParents: 0
};
fs.writeFileSync(target, JSON.stringify({
  schema: 'C030-evidence-index/1', sealedAtUtc: new Date().toISOString(), proofCounts,
  meaning: 'Immutable prepublication raw evidence and source-code seal. Later deliberate unique proof appends are not retroactively called Git-canonical or sealed.',
  finalFocusedCapture: focused.directory, finalBrowserCapture: latest('browser').directory,
  rawFailuresPreserved: true, files, artifactFiles
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cardId: 'C030', proofCounts, sealedEvidenceFiles: files.length, sealedArtifactFiles: artifactFiles.length }));
