'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const folder = path.join(__dirname, '..', 'evidence');
const red = JSON.parse(fs.readFileSync(path.join(folder, 'red.json'), 'utf8'));
const output = fs.readFileSync(path.join(folder, red.stdout.file), 'utf8');
assert.equal(red.exitCode, 1);
assert.equal(red.processError, null);
assert.equal((output.match(/code: 'ERR_ASSERTION'/g) || []).length, 18);
assert.ok(output.includes('# pass 1') && output.includes('# fail 18'));
assert.ok(!/MODULE_NOT_FOUND|ENOENT|SyntaxError|ReferenceError|TypeError/.test(output));
const record = {
  cardId: 'A-S053', parentId: 'D-S053', packet: 'SC-S053', kano: 'S',
  status: 'N/A', recordedAtUtc: new Date().toISOString(),
  after: { red: 'red.json', redFinishedAtUtc: red.finishedAtUtc, tests: 19, passed: 1, assertionFailures: 18 },
  before: 'Behavioral implementation and refactoring',
  reason: 'Resource-free standalone synthetic browser lesson. No cloud, IaC, scaffold, identity registration, deployment, expenditure, new framework or packages are authorized or required.',
  authenticity: 'A complete exported API was loadable. RED was real ERR_ASSERTION behavior, not missing code, tooling or syntax.',
};
fs.writeFileSync(path.join(folder, 'iac-na.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
