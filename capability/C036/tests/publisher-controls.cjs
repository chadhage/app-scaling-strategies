'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const history = JSON.parse(fs.readFileSync(path.join(root, 'publisher-history.json'), 'utf8'));
const used = JSON.parse(fs.readFileSync(path.join(root, history.actualUsedApproval.path), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function control() {
  return {
    schemaVersion: 1, sourceSelector: 'localPublisherAuthorization',
    controllerId: '942b9aec-aa3f-4179-b6ed-e2bc57abeed2',
    authorization: structuredClone(used.currentCanonicalAuthorization),
    card: { ...structuredClone(history.originalCard), state: 'In Progress', owner: 'worker-C036', readiness: true },
    worker: { id: 'worker-C036', cardId: 'C036', status: 'running' },
    ownedPaths: ['capability\\C036'], publicationHeld: false, C001LocalConsent: true, C015FixtureApproval: true,
    prerequisites: [
      { id: 'C015', state: 'Done', publication: { commit: '78341b3370d7764b7f9c3eacc1796892dbc4f40f', tag: 'kanban/C015/78341b3370d7' },
        reviewCommit: '78341b3370d7764b7f9c3eacc1796892dbc4f40f', reviewTag: 'kanban/C015/78341b3370d7',
        accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true },
      { id: 'C034', state: 'Done', publication: { commit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', tag: 'kanban/C034/01cc2dceb8ea' },
        reviewCommit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', reviewTag: 'kanban/C034/01cc2dceb8ea',
        accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true }
    ],
    interpretation: 'Pure unit control, NOT actual canonical approval. No private changes or Git operations.'
  };
}
function successor() {
  const snapshot = control();
  const bytes = Buffer.from('C036 supplied explicitly current approved successor unit control; NOT private publisher code');
  snapshot.authorization.publisherSha256 = sha(bytes);
  snapshot.authorization.id = 'supplied-current-successor-unit-control';
  snapshot.authorization.focusedGuardChecksPassed = 53;
  snapshot.authorization.exactAddedClasses.C017 = 'S';
  return { snapshot, actualSha256: sha(bytes) };
}
function originalGuard() {
  const filename = path.join(root, 'pins.cjs');
  const archived = fs.readFileSync(path.join(root, history.snapshots['pins.cjs'].path));
  if (sha(archived) !== history.snapshots['pins.cjs'].rawSha256) throw new Error('Original guard snapshot changed.');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(archived.toString('utf8'), filename);
  return loaded.exports.publisherAuthorized;
}
module.exports = Object.freeze({ control, successor, originalGuard });
