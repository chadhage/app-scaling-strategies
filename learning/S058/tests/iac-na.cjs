'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const evidence = path.join(__dirname, '..', 'evidence');
const red = JSON.parse(fs.readFileSync(path.join(evidence, 'red.json'), 'utf8'));
const snapshots = JSON.parse(fs.readFileSync(path.join(evidence, 'red', 'snapshots.json'), 'utf8'));
assert.equal(red.exitCode, 1);
assert.ok(snapshots.assertionFailures > 0);
const record = {
  cardId: 'A-S058', afterGenuineRed: true, recordedAtUtc: new Date().toISOString(), iac: 'N/A',
  reason: 'Resource-free standalone synthetic browser lesson. No cloud/IaC/scaffold/identity/deploy/spend, package or framework work is authorized or needed.',
};
fs.writeFileSync(path.join(evidence, 'iac-na.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
