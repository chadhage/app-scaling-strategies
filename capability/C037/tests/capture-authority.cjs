'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { readRegular, hash } = require('..\\pins.cjs');
const { readCurrent, inspect } = require('..\\authority.cjs');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact capture only.');
const directory = path.resolve(process.env.C037_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^authority-[0-9a-f-]{36}$/);
assert.deepEqual(fs.readdirSync(directory), []);
const { snapshot, assessment } = readCurrent();
assert.equal(assessment.approved, true);
const bytes = readRegular(path.join('.git', 'kanban-orchestrator', 'publish.ps1'));
assert.equal(hash(bytes), '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811');
assert.equal(inspect(snapshot, hash(bytes)).exactAuthorizedBytes, true);
const revision = snapshot.authorization.classificationAndInspectionRevision;
assert.equal(revision.publisherSha256, hash(bytes));
assert.equal(revision.exactAddedClasses.C037, 'S');
assert.equal(revision.focusedGuardChecksPassed, 61);
const stripped = bytes.toString('utf8').replace("; C030='D'", '').replace("; C035='D'", '')
  .replace("; C037='S'", '').replace("; C038='S'", '');
assert.equal(hash(Buffer.from(stripped)), '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea');
fs.writeFileSync(path.join(directory, 'publisher.ps1.snapshot'), bytes, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'approval.json'), `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
const value = { schemaVersion: 1, cardId: 'C037', role: 'immutable-initial-parent-approved-guard-fixture-not-current-authority',
  publisherSha256: hash(bytes), snapshot: path.relative(root, path.join(directory, 'publisher.ps1.snapshot')),
  approval: path.relative(root, path.join(directory, 'approval.json')),
  approvalSha256: hash(fs.readFileSync(path.join(directory, 'approval.json'))),
  strippedOnlyFourTokensSha256: hash(Buffer.from(stripped)), actualGitWrites: 0 };
fs.writeFileSync(path.join(root, 'authority-history.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
console.log('Archived actual initially approved 2CABA bytes and current State observation; only four class tokens strip to historical 60AE. Not forever-current authority.');
