'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sha, normalize, verifyPins } = require('.\\capability\\C059\\tests\\evidence-verify.cjs');
const { inventory } = require('.\\capability\\C059\\tests\\identifier-inventory.cjs');

const root = __dirname;
const actualRepo = process.env.C059_ACTUAL_REPO;
if (!actualRepo) throw new Error('an explicit read-only actual repository is required');
const namespace = path.join(root, 'capability', 'C059');
const target = path.join(namespace, 'evidence', 'final', 'source-freeze.json');
if (fs.existsSync(target)) throw new Error('a source freeze is immutable; do not overwrite or silently rephase');
const old = JSON.parse(fs.readFileSync(path.join(root, 'live-snapshot-before-copy.json'), 'utf8'));
for (const row of old.files) assert.equal(sha(fs.readFileSync(path.join(actualRepo, row.path))), row.sha256, `original live bytes unchanged: ${row.path}`);
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: actualRepo, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const PUBLISHED = 'ea81f6ec59c3a9356827724a6b35ca45b1353d46';
const production = ['a11y-check.js', 'journey.js', 'page.js', 'server.cjs', 'transcript.cjs'];
for (const name of [...production, 'index.html', 'styles.css', 'imports.json']) {
  assert.equal(sha(fs.readFileSync(path.join(namespace, name))), sha(git('cat-file', 'blob', `${PUBLISHED}:capability/C059/${name}`)), `production remains unchanged: ${name}`);
}
const pins = JSON.parse(fs.readFileSync(path.join(namespace, 'imports.json'), 'utf8'));
assert.deepEqual(verifyPins(pins, {
  readFile: (name) => fs.readFileSync(path.join(root, name)),
  readBlob: (commit, name) => git('cat-file', 'blob', `${commit}:${name}`),
}), []);
for (const accepted of Object.values(pins.accepted)) assert.equal(git('rev-parse', `${accepted.tag}^{}`).toString('utf8').trim(), accepted.commit);
const row = (relative, acceptLf = false) => {
  const bytes = fs.readFileSync(path.join(root, relative));
  return { path: relative, bytes: bytes.length, rawSha256: sha(bytes), crlfToLfSha256: sha(normalize(bytes)), ...(acceptLf ? { acceptLf: true } : {}) };
};
const entries = inventory(namespace);
const source = entries.filter(([name]) => !name.startsWith('evidence/') && !name.startsWith('data/'))
  .map(([name]) => row(path.join('capability', 'C059', name)));
const catalog = require('.\\capability\\C041\\accepted-catalog.js');
const importNames = [...new Set([...pins.imports.map((entry) => entry.path.replaceAll('/', '\\')), ...catalog.lessons.flatMap((lesson) => lesson.assets.map((asset) => asset.path))])];
const imports = importNames.map((name) => {
  assert.equal(sha(fs.readFileSync(path.join(root, name))), sha(fs.readFileSync(path.join(actualRepo, name))), `current read-only import: ${name}`);
  return row(name, true);
});
const dependencySnapshot = JSON.parse(fs.readFileSync(path.join(root, 'readonly-imports-snapshot.json'), 'utf8'));
const browserRuntime = new Set([
  'testing\\browser\\isolated.cjs',
  ...['qualify.cjs', 'adapters.cjs', 'addendum.cjs', 'subject.cjs', 'version.cjs', 'qualified.json', 'qualified.addendum.jsonl']
    .map((name) => `testing\\browser\\qualify\\${name}`),
]);
const browserInputs = dependencySnapshot.files.filter((entry) => browserRuntime.has(entry.path)).map((entry) => {
  assert.equal(sha(fs.readFileSync(path.join(root, entry.path))), entry.sha256);
  assert.equal(sha(fs.readFileSync(path.join(actualRepo, entry.path))), entry.sha256);
  return row(entry.path);
});
assert.equal(browserInputs.length, browserRuntime.size, 'the actual sealed helper runtime read set is closed; unrelated reference captures are not imported as observations');
const historicalNames = new Set(old.files.filter((entry) => entry.path.startsWith('capability\\C059\\evidence\\')).map((entry) => entry.path));
const inheritedEvidence = old.files.filter((entry) => historicalNames.has(entry.path)).map((entry) => {
  const current = row(entry.path);
  assert.equal(current.rawSha256, entry.sha256, `retained original evidence: ${entry.path}`);
  return current;
});
const retainedDevelopmentEvidence = entries.filter(([name]) => name.startsWith('evidence/')).map(([name]) => path.join('capability', 'C059', name))
  .filter((name) => !historicalNames.has(name)).map((name) => row(name));
const workflowNames = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:cjs|ps1)$/.test(entry.name)).map((entry) => entry.name);
const workflow = [];
const workflowExecutionBindings = [];
for (const name of workflowNames) {
  const archived = path.join('capability', 'C059', 'evidence', 'final', 'workflow', name);
  const bytes = fs.readFileSync(path.join(root, name));
  fs.mkdirSync(path.dirname(path.join(root, archived)), { recursive: true });
  fs.writeFileSync(path.join(root, archived), bytes, { flag: 'wx' });
  workflow.push(row(archived));
  workflowExecutionBindings.push({ executedFile: name, archivedFile: archived, rawSha256: sha(bytes) });
}
const sourceTreeSha256 = sha(Buffer.from(source.map((entry) => `${entry.path}\0${entry.rawSha256}\n`).sort().join('')));
const freeze = {
  schema: 'C059-final-source-freeze/2', workerId: 'worker-C059',
  createdAtUtc: new Date().toISOString(), state: 'source-frozen-only, not acceptance',
  liveApplicationPermission: false, productionCommit: PUBLISHED,
  foreignGitRef: 'bda60d34fe62e9176594519f18cca6051495e64b',
  productionFiles: production, sourceTreeSha256, source, imports, browserInputs, workflow, workflowExecutionBindings,
  inheritedEvidence, retainedDevelopmentEvidence,
  retainedLiveSnapshotSha256: sha(fs.readFileSync(path.join(root, 'live-snapshot-before-copy.json'))),
  sharedRecorderSha256: sha(fs.readFileSync(process.env.C059_RECORDER)),
  policy: 'After this record, source and all prior evidence are immutable. Subsequent files are new derived evidence only. Producer LF forms are explicit; original import pins remain unchanged.',
};
fs.writeFileSync(target, `${JSON.stringify(freeze, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ sourceFrozen: true, sourceFiles: source.length, readOnlyProducerFiles: imports.length, browserInputs: browserInputs.length, immutableOriginalEvidenceFiles: inheritedEvidence.length, retainedDevelopmentFiles: retainedDevelopmentEvidence.length, sourceTreeSha256, freezeSha256: sha(fs.readFileSync(target)) }));
