'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const lesson = path.resolve(__dirname, '..');
const target = path.join(lesson, 'evidence', 'provenance.json');
const receipt = path.join(lesson, 'evidence', 'result.json');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name))
      : [path.join(directory, entry.name)])
    .filter((file) => file !== target && file !== receipt);
}
if (process.argv[2] === '--verify') {
  const record = JSON.parse(fs.readFileSync(target, 'utf8'));
  const current = Object.fromEntries(files(lesson).sort().map((file) =>
    [path.relative(lesson, file), hash(file)]));
  assert.deepEqual(current, record.sha256);
  assert.equal(record.cardId, 'A-S010');
  assert.equal(record.kanoUnit, 'A-S010');
  assert.equal(record.nativeEvidence, false);
  console.log(`Verified ${Object.keys(current).length} scoped file hashes; post-publication receipt and this self-hash are excluded.`);
} else if (process.argv[2] === '--write') {
  const stages = {};
  for (const phase of ['red', 'green', 'browser', 'syntax', 'integrity']) {
    const record = JSON.parse(fs.readFileSync(path.join(lesson, 'evidence', `${phase}.json`), 'utf8'));
    assert.equal(record.stageExpectationMet, true, phase);
    stages[phase] = {
      record: `evidence\\${phase}.json`, commands: record.commands.map((command) => ({
        exitCode: command.exitCode, counts: command.counts, rawLog: command.rawLog,
      })),
    };
  }
  const record = {
    schemaVersion: 1, cardId: 'A-S010', parentId: 'D-S010', sourceId: 'S010',
    kanoUnit: 'A-S010', kano: 'S', packet: 'LP-LEARN', workerId: 'worker-A-S010',
    createdAtUtc: new Date().toISOString(), mode: 'local-synthetic-only',
    nativeEvidence: false, productionNode24Validated: false,
    stages, publication: 'Commit/tag/remote verification are in the post-publication result and parent-owned Report ledger, not a circular self-hash.',
    exclusions: ['evidence\\provenance.json (self)', 'evidence\\result.json (post-publication receipt)'],
    sha256: Object.fromEntries(files(lesson).sort().map((file) => [path.relative(lesson, file), hash(file)])),
  };
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(record.sha256).length} scoped file hashes.`);
} else {
  throw new Error('Use --write after empirical validation, or --verify without changing any input.');
}
