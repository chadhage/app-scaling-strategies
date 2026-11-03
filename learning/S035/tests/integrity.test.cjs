'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8'));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  }).sort();
}

test('manifest preserves one frozen source unit and truthfully bounded evidence', () => {
  for (const [key, value] of Object.entries({
    cardId: 'A-S035', parentId: 'D-S035', workerId: 'worker-A-S035',
    packet: 'SC-S035', kanoUnit: 'A-S035', kano: 'S', sourceId: 'S035', entry: 'index.html',
    nativeQualified: false, sourceParentComplete: false, productionNode24Qualified: false,
  })) assert.equal(manifest[key], value, key);
  assert.equal(manifest.modelChecks, 20);
  assert.equal(manifest.fixtureConfigurations, 48);
  assert.equal(manifest.relevantToDo.length, 1);
  assert.equal(manifest.relevantToDo[0].id, 'B-S035');
  assert.equal(manifest.relevantToDo[0].readiness, false);
});

test('source inventory is complete and every owned source byte matches the explicit seal', () => {
  const expected = files(root).filter((file) => file !== path.join(root, 'evidence.json')
      && !file.startsWith(`${path.join(root, 'evidence')}${path.sep}`))
    .map((file) => path.relative(root, file));
  assert.deepEqual(manifest.sourceHashes.map((item) => item.path), expected);
  for (const item of manifest.sourceHashes) assert.equal(hash(path.join(root, item.path)), item.sha256, item.path);
});

test('every historical proof file is inventoried and byte-for-byte unchanged', () => {
  const expected = files(path.join(root, 'evidence')).map((file) => path.relative(root, file));
  assert.deepEqual(manifest.proofs.map((item) => item.path), expected);
  for (const item of manifest.proofs) assert.equal(hash(path.join(root, item.path)), item.sha256, item.path);
});

test('RED retains a loadable stub, BDD and 20 genuine assertion failures before the explicit IaC N/A and green', () => {
  const red = json('evidence\\red-001.json');
  const green = json('evidence\\green-001.json');
  const iac = json('evidence\\iac-na.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.error, null);
  const stdout = fs.readFileSync(path.join(root, 'evidence', red.stdout.file), 'utf8');
  assert.match(stdout, /# tests 20/);
  assert.match(stdout, /# fail 20/);
  assert.equal([...stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, 20);
  assert.doesNotMatch(stdout, /TypeError|SyntaxError|MODULE_NOT_FOUND|ERR_MODULE/);
  for (const item of red.snapshots) {
    assert.ok(item.file.endsWith('.snapshot.txt'));
    assert.equal(hash(path.join(root, 'evidence', item.file)), item.sha256);
  }
  assert.equal(hash(path.join(root, 'callback.feature')), hash(path.join(root, 'evidence', 'red-001-callback.feature.snapshot.txt')));
  assert.equal(iac.decision, 'N/A');
  assert.ok(Date.parse(red.completedAtUtc) <= Date.parse(iac.recordedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.match(fs.readFileSync(path.join(root, 'evidence', green.stdout.file), 'utf8'), /# pass 20/);
});

test('exact source rows and default packet rule are preserved without title guessing', () => {
  const source = json('evidence\\source-contract-001.json');
  for (const [file, field, id] of [
    ['README.md', 'source', 'S035'], ['.docs\\wiki\\backlog.md', 'parent', 'D-S035'],
    ['.docs\\wiki\\kanban.md', 'card', 'A-S035'], ['.docs\\wiki\\kanban.md', 'nativeSibling', 'B-S035'],
  ]) {
    const row = fs.readFileSync(path.join(repo, file), 'utf8').split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
    assert.equal(source[field], row);
  }
  assert.match(source.source, /Complete an OAuth\/OIDC flow started before migration without redirect loops or forced reauthentication/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.atomicContract, /Portable A-card lesson contract/);
  assert.equal(source.claim.owner, 'worker-A-S035');
  assert.equal(source.claim.kanoUnit, 'A-S035');
});

test('principal browser proof is actual, pinned, green and closed without native or lifecycle overclaim', () => {
  assert.equal(hash(path.join(repo, 'testing', 'browser', 'isolated.cjs')), manifest.browserHelperSha256);
  const observation = json(manifest.principalBrowserObservation);
  assert.equal(observation.helperSha256, manifest.browserHelperSha256);
  assert.equal(observation.helperCommit, '53c0c0d');
  assert.equal(observation.nodeVersion, 'v22.23.4');
  assert.equal(observation.playwrightVersion, '1.56.1');
  assert.equal(observation.browserVersion, '156.0.4314.50');
  assert.equal(observation.checks.length, 14);
  assert.ok(observation.checks.every((check) => check.result === 'PASS'));
  assert.equal(observation.outcome, 'PASS');
  assert.equal(json(manifest.principalBrowserRun).exitCode, 0);
  for (const item of observation.sourceHashes) assert.equal(hash(path.join(root, item.path)), item.sha256, item.path);
  assert.equal(observation.cleanup.closeAwaitedInFinally, true);
  assert.equal(observation.nativeQualified, false);
  assert.equal(observation.productionNode24Qualified, false);
  assert.deepEqual(observation.outboundRequestsReachedRouteGuard, []);
  assert.deepEqual(observation.pageErrors, []);
  assert.match(observation.lifecycleLimit, /known unattended lifecycle limit/i);
});
