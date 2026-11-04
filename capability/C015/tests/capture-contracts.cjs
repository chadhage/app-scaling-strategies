'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { root, repo, sha } = require('./provenance.cjs');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 2) {
  throw new Error('Exact CAPTURE_BROWSER_EVIDENCE=1 and no path overrides required for unique raw contract capture.');
}
const c001 = 'cfff04364ade947aa398004b21548a15272021e7';
const c002 = '5feaab2929a615aa7f6968fd39355868dd321e4f';
const paths = [
  [c001, 'capability\\C001\\approved-contract.js'], [c001, 'capability\\C001\\contract-guard.js'],
  [c002, 'capability\\C002\\run-envelope-contract.js'], [c002, 'capability\\C002\\validator.js'],
  [c002, 'capability\\C002\\validator.d.ts'], [c002, 'capability\\C002\\json-input.js'],
  [c002, 'capability\\C002\\synthetic-fixture.js'],
];
const records = paths.map(([acceptedCommit, relative]) => {
  const raw = fs.readFileSync(path.join(repo, relative));
  const logicalGitPath = relative.split(path.sep).join('/');
  const gitCanonical = execFileSync('git', ['--no-pager', 'show', `${acceptedCommit}:${logicalGitPath}`], { cwd: repo, maxBuffer: 1024 * 1024 });
  const normalized = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
  assert.deepEqual(normalized, gitCanonical, `Accepted contract changed: ${relative}`);
  return {
    file: relative, acceptedCommit, rawSha256: sha(raw), rawBytes: raw.length,
    rawCRLF: (raw.toString('utf8').match(/\r\n/g) || []).length,
    gitCanonicalSha256: sha(gitCanonical), gitCanonicalBytes: gitCanonical.length,
    gitCanonicalCRLF: (gitCanonical.toString('utf8').match(/\r\n/g) || []).length,
    normalization: 'UTF-8 CRLF-to-LF checked against the accepted Git blob',
  };
});
const report = {
  schemaVersion: 1, cardId: 'C015', kind: 'accepted-contract-bytes',
  capturedAtUtc: new Date().toISOString(), records,
  sourceEdits: 0, originalUnitCredits: 0,
};
const file = `contracts-${randomUUID()}.raw.json`;
fs.writeFileSync(path.join(root, 'evidence', file), JSON.stringify(report, null, 2).replace(/\n/g, '\r\n') + '\r\n', { flag: 'wx' });
console.log(JSON.stringify({ file, contracts: records.length, rawAndGitCanonicalSeparatelyVerified: true }));
