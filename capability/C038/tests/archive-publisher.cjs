'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sources = require('../sources.cjs');
const boundary = require('../boundary.cjs');
const root = path.resolve(__dirname, '..');
assert.equal(process.argv.length, 2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
const directory = path.resolve(process.env.C038_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^archive-[0-9a-f-]{36}$/);
assert.equal(fs.realpathSync(directory), directory);
const current = boundary.currentDiagnostic();
assert.equal(current.assessment.exactAuthorizedBytes, true);
assert.equal(current.assessment.delegationReady, true);
assert.equal(current.actualSha256, '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811');
const bytes = sources.readRegular(path.join('.git', 'kanban-orchestrator', 'publish.ps1'));
assert.equal(sources.hash(bytes), current.actualSha256);
const stripped = Buffer.from(bytes.toString('utf8')
  .replace("; C030='D'", '').replace("; C035='D'", '')
  .replace("; C037='S'", '').replace("; C038='S'", ''), 'utf8');
assert.equal(sources.hash(stripped), '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea');
const historical = require('..\\..\\C036\\publisher-provenance.cjs');
const predecessor = historical.readSnapshot(historical.history().publisherSource);
assert.deepEqual(stripped, predecessor);
for (const [file, value] of [
  ['publisher.ps1.snapshot', bytes], ['predecessor-60ae.ps1.snapshot', predecessor],
  ['authority.json', Buffer.from(`${JSON.stringify(current.snapshot, null, 2)}\n`)]
]) fs.writeFileSync(path.join(directory, file), value, { flag: 'wx' });
console.log(JSON.stringify({
  role: 'archived-authorized-guard-fixture-not-current-authority',
  actualPublisherSha256: sources.hash(bytes), predecessorSha256: sources.hash(predecessor),
  exactFourTokenStrip: true, stateReleasedBeforePublisherRead: true,
  currentTopApproval: current.snapshot.authorization.publisherSha256,
  nestedOldRevisionIsNotCurrentAuthority: true,
  currentActualPrivatePublisherNotInvoked: true,
  directory: path.relative(root, directory)
}));
