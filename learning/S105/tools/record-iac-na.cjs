'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const redBytes = fs.readFileSync(path.join(root, 'evidence', 'red-001.json'));
const red = JSON.parse(redBytes);
if (red.status !== 1 || !red.acceptedResult || red.precheck.status !== 0
    || hash(fs.readFileSync(path.join(root, 'model.js'))) !== red.snapshots.find((s) => s.source === 'model.js').sha256) {
  throw new Error('Require genuine behavioral RED with the unchanged loadable stub before IaC N/A.');
}
const record = {
  stage: 'IaC N/A',
  recordedAtUtc: new Date().toISOString(),
  reason: 'Resource-free standalone fictional browser lesson. No infrastructure, configuration, identity, authorization, network, swap, deployment or spending operations are authorized or performed.',
  previousStage: 'red-001.json',
  previousStageSha256: hash(redBytes),
  stubUnchangedAtThisStage: true,
  nextStage: 'Implement/refactor the local synthetic model and browser lesson only.',
};
fs.writeFileSync(path.join(root, 'evidence', 'iac-na.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
