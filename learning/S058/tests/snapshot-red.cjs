'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const evidence = path.join(folder, 'evidence');
const receipt = JSON.parse(fs.readFileSync(path.join(evidence, 'red.json'), 'utf8'));
const stdout = fs.readFileSync(path.join(evidence, receipt.stdout.file), 'utf8');
assert.equal(receipt.exitCode, 1);
assert.match(stdout, /ERR_ASSERTION/);
assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|ENOENT/);
const directory = path.join(evidence, 'red');
fs.mkdirSync(directory);
const snapshots = ['model.js', 'workflow-version.feature', path.join('tests', 'model.test.cjs'), path.join('tests', 'stub-load.cjs')].map((file) => {
  const raw = fs.readFileSync(path.join(folder, file));
  const snapshot = `${path.basename(file)}.snapshot`;
  fs.writeFileSync(path.join(directory, snapshot), raw, { flag: 'wx' });
  return { source: file, snapshot, bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
});
const record = {
  capturedAtUtc: new Date().toISOString(), redReceipt: 'red.json',
  assertionFailures: Number(stdout.match(/# fail (\d+)/)?.[1]), apiLoadPasses: Number(stdout.match(/# pass (\d+)/)?.[1]),
  explanation: 'Historical loadable stub plus unchanged real assertions; no missing code, packages, tools or runtime errors. Snapshot names are not auto-discovered tests.',
  snapshots,
};
fs.writeFileSync(path.join(directory, 'snapshots.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
