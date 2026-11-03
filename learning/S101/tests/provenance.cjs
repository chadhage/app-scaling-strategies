'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd: root, encoding: null, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw result.error
    || new Error(result.stderr.toString('utf8'));
  return result.stdout;
}
function writeJSON(relative, value) {
  const target = path.join(lesson, relative);
  if (fs.existsSync(target)) throw new Error(`Append-only evidence already exists: ${relative}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}
function save(relative, bytes) {
  const target = path.join(lesson, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) throw new Error(`Snapshot already exists: ${relative}`);
  fs.writeFileSync(target, bytes);
  return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
}
function source() {
  const commit = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const rows = {};
  const sources = [
    ['readme', 'README.md', '| S101 |'],
    ['backlog', path.join('.docs', 'wiki', 'backlog.md'), '| D-S101 |'],
    ['kanban', path.join('.docs', 'wiki', 'kanban.md'), '| A-S101 |'],
  ].map(([name, relative, prefix]) => {
    const working = fs.readFileSync(path.join(root, relative));
    const canonical = git(['show', `${commit}:${relative.split(path.sep).join('/')}`]);
    const lines = canonical.toString('utf8').split(/\r?\n/);
    const matching = lines.filter((line) => line.startsWith(prefix));
    if (matching.length !== 1 || !working.toString('utf8').split(/\r?\n/).includes(matching[0])) {
      throw new Error(`Exact source row mismatch: ${relative}`);
    }
    rows[name] = matching[0];
    return { sourcePath: relative, commit,
      working: save(path.join('evidence', 'raw', `source-${name}.working.snapshot`), working),
      canonicalGit: save(path.join('evidence', 'raw', `source-${name}.git.snapshot`), canonical),
      workingCRLFCount: (working.toString('utf8').match(/\r\n/g) || []).length,
      gitCRLFCount: (canonical.toString('utf8').match(/\r\n/g) || []).length };
  });
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8')
    .replace(/\r\n/g, '\n');
  const portable = kanban.split('### Portable A-card lesson contract\n')[1]
    .split('\n## Concurrent pull and one-piece flow')[0].trim();
  const packetRule = kanban.split('\n').find((line) =>
    line.startsWith('Packet membership is fixed before admission.'));
  if (!portable || !packetRule || !packetRule.includes('every other A/B card belongs to SC-Snnn')) {
    throw new Error('Portable contract or default packet rule is missing.');
  }
  writeJSON(path.join('evidence', 'source-contract.json'), {
    schemaVersion: 1, cardId: 'A-S101', parents: ['D-S101'], sourceId: 'S101',
    kano: 'S', kanoUnit: 'A-S101', packet: 'SC-S101', owner: 'worker-A-S101',
    readAtUtc: new Date().toISOString(), baselineCommit: commit, rows, portable, packetRule,
    sources, integrityPolicy: 'Raw working CRLF bytes and canonical Git-source bytes are distinct, preserved -text snapshots.',
  });
  const bdd = save(path.join('evidence', 'raw', 'bdd.feature.snapshot'),
    fs.readFileSync(path.join(lesson, 'stable-endpoint.feature')));
  writeJSON(path.join('evidence', 'bdd.json'), {
    cardId: 'A-S101', specifiedAtUtc: new Date().toISOString(), snapshot: bdd,
    sourceContract: path.join('evidence', 'source-contract.json'),
  });
}
function red() {
  const snapshots = ['model.js', path.join('tests', 'model.test.cjs'), 'stable-endpoint.feature']
    .map((relative) => save(path.join('evidence', 'red', `${path.basename(relative)}.snapshot`),
      fs.readFileSync(path.join(lesson, relative))));
  writeJSON(path.join('evidence', 'red', 'snapshots.json'), {
    cardId: 'A-S101', savedAtUtc: new Date().toISOString(), snapshots,
    discoveryPolicy: 'Snapshot suffixes are not automatic test discovery inputs.',
  });
}
function owned(relative) {
  assert.equal(typeof relative, 'string');
  const absolute = path.resolve(lesson, relative);
  assert.ok(absolute.startsWith(`${lesson}${path.sep}`), 'Evidence reference must remain owned.');
  return absolute;
}
function readJSON(relative) {
  return JSON.parse(fs.readFileSync(owned(relative), 'utf8'));
}
function verifyRaw(record) {
  const bytes = fs.readFileSync(owned(record.path));
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha256(bytes), record.sha256, record.path);
  return bytes;
}
function portableSection(bytes) {
  return bytes.toString('utf8').replace(/\r\n/g, '\n')
    .split('### Portable A-card lesson contract\n')[1]
    .split('\n## Concurrent pull and one-piece flow')[0].trim();
}
function verifySource() {
  const contract = readJSON(path.join('evidence', 'source-contract.json'));
  assert.equal(contract.cardId, 'A-S101');
  assert.equal(contract.kano, 'S');
  assert.equal(contract.kanoUnit, 'A-S101');
  assert.equal(contract.packet, 'SC-S101');
  assert.equal(contract.rows.readme, '| S101 | **Stable public endpoint:** Keep the user-facing hostname constant while changing backend destinations. |');
  assert.equal(contract.rows.backlog, '| D-S101 | P0 | Add stable getProfile public/service endpoint with visible backend-version switches. | Existing callers keep their endpoint and valid contract; observed backend changes without broken navigation or authentication. | none |');
  assert.equal(contract.rows.kanban, '| A-S101 | D-S101 | S | Switch backends behind a stable getProfile endpoint; callers must retain valid contracts. | SOURCE |');
  for (const [index, sourceRecord] of contract.sources.entries()) {
    const working = verifyRaw(sourceRecord.working);
    const canonical = verifyRaw(sourceRecord.canonicalGit);
    assert.deepEqual(canonical, git(['show',
      `${sourceRecord.commit}:${sourceRecord.sourcePath.split(path.sep).join('/')}`]));
    assert.equal((working.toString('utf8').match(/\r\n/g) || []).length, sourceRecord.workingCRLFCount);
    assert.equal((canonical.toString('utf8').match(/\r\n/g) || []).length, sourceRecord.gitCRLFCount);
    const row = Object.values(contract.rows)[index];
    assert.ok(working.toString('utf8').split(/\r?\n/).includes(row));
    assert.ok(canonical.toString('utf8').split(/\r?\n/).includes(row));
    assert.ok(fs.readFileSync(path.join(root, sourceRecord.sourcePath), 'utf8').split(/\r?\n/).includes(row));
    if (sourceRecord.sourcePath.endsWith('kanban.md')) {
      assert.equal(portableSection(working), contract.portable);
      assert.equal(portableSection(canonical), contract.portable);
      assert.equal(portableSection(fs.readFileSync(path.join(root, sourceRecord.sourcePath))), contract.portable);
      assert.ok(canonical.toString('utf8').includes(contract.packetRule));
      assert.ok(contract.packetRule.includes('every other A/B card belongs to SC-Snnn'));
    }
  }
  return contract;
}
function verifyRed() {
  const bdd = readJSON(path.join('evidence', 'bdd.json'));
  verifyRaw(bdd.snapshot);
  const snapshots = readJSON(path.join('evidence', 'red', 'snapshots.json'));
  for (const record of snapshots.snapshots) {
    assert.ok(record.path.endsWith('.snapshot'));
    verifyRaw(record);
  }
  const receipt = readJSON(path.join('evidence', 'red.json'));
  assert.equal(receipt.exitCode, 1);
  const stdout = verifyRaw(receipt.stdout).toString('utf8');
  verifyRaw(receipt.stderr);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /# tests 14/);
  assert.match(stdout, /# pass 1/);
  assert.match(stdout, /# fail 13/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError|TypeError/);
  assert.equal(readJSON(path.join('evidence', 'stub-syntax.json')).exitCode, 0);
  const iac = readJSON(path.join('evidence', 'iac-decision.json'));
  assert.equal(iac.decision, 'N/A');
  assert.ok(Date.parse(bdd.specifiedAtUtc) <= Date.parse(receipt.startedAtUtc));
  assert.ok(Date.parse(receipt.endedAtUtc) < Date.parse(iac.decidedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) < Date.parse(readJSON(path.join('evidence', 'model-green.json')).startedAtUtc));
  assert.notEqual(sha256(fs.readFileSync(path.join(lesson, 'model.js'))),
    snapshots.snapshots.find((record) => record.path.endsWith('model.js.snapshot')).sha256);
  return { genuineAssertionFailures: 13, tests: 14, rawSnapshotsPreserved: true };
}
const postIndex = new Set([
  path.join('evidence', 'content-index.json'),
  ...['integrity-publication-repair', 'verification-publication-repair'].flatMap((stage) => [
    path.join('evidence', `${stage}.json`),
    path.join('evidence', 'raw', `${stage}.stdout.raw`),
    path.join('evidence', 'raw', `${stage}.stderr.raw`),
  ]),
]);
function inventory(directory = lesson) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, 'Owned lesson does not permit links.');
      if (entry.isDirectory()) return inventory(absolute);
      assert.ok(entry.isFile());
      return [path.relative(lesson, absolute)];
    }).filter((relative) => !postIndex.has(relative));
}
function canonicalText(bytes) { return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')); }
function rawKind(relative) {
  return relative.startsWith(`evidence${path.sep}raw${path.sep}`)
    || relative.startsWith(`evidence${path.sep}red${path.sep}`);
}
function contentIndex() {
  writeJSON(path.join('evidence', 'content-index.json'), {
    schemaVersion: 1, cardId: 'A-S101', capturedAtUtc: new Date().toISOString(),
    exclusions: [...postIndex],
    policy: 'Exact raw -text proof bytes; ordinary source canonical LF integrity. Self-referential final verification receipts have separately hashed raw streams.',
    files: inventory().map((relative) => {
      const bytes = fs.readFileSync(owned(relative));
      const raw = rawKind(relative);
      return { path: relative, kind: raw ? 'raw-bytes' : 'canonical-text-lf',
        sha256: sha256(raw ? bytes : canonicalText(bytes)) };
    }),
  });
}
function verifyIndex() {
  const index = readJSON(path.join('evidence', 'content-index.json'));
  assert.equal(index.cardId, 'A-S101');
  assert.deepEqual(index.exclusions.slice().sort(), [...postIndex].sort());
  assert.deepEqual(index.files.map((record) => record.path).sort(), inventory().sort());
  for (const record of index.files) {
    const raw = rawKind(record.path);
    assert.equal(record.kind, raw ? 'raw-bytes' : 'canonical-text-lf');
    const bytes = fs.readFileSync(owned(record.path));
    assert.equal(sha256(raw ? bytes : canonicalText(bytes)), record.sha256, record.path);
  }
  return index;
}
module.exports = { git, lesson, root, sha256, readJSON, verifyRaw, verifySource, verifyRed,
  verifyIndex, inventory, rawKind, canonicalText };
if (require.main === module) {
  if (process.argv[2] === 'source') source();
  else if (process.argv[2] === 'red') red();
  else if (process.argv[2] === 'index') contentIndex();
  else if (process.argv[2] === 'check') {
    const contract = verifySource();
    console.log(JSON.stringify({ sourceCommit: contract.baselineCommit,
      exactSourceRowsAndPortableContract: true, rawCRLFAndCanonicalGitCheckedSeparately: true,
      red: verifyRed() }, null, 2));
  } else throw new Error('Explicit provenance action must be source, red, index or read-only check.');
}
