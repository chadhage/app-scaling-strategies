'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scan, latestGreen, evidenceFiles } = require('./evidence.cjs');
const root = path.resolve(__dirname, '..');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact explicit own evidence seal only.');
const directory = path.resolve(process.env.C037_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^seal-[0-9a-f-]{36}$/);
assert.deepEqual(fs.readdirSync(directory), []);
const { runs, emptyUnqualifiedDirectories } = scan();
const latest = Object.fromEntries(['bdd', 'stub', 'iac', 'pins', 'authority', 'focused', 'syntax', 'browser']
  .map((stage) => [stage, latestGreen(runs, stage).directory]));
const files = evidenceFiles();
const value = {
  schemaVersion: 1, cardId: 'C037', sealedAtUtc: new Date().toISOString(), role: 'append-only-evidence-through-this-seal',
  currentAuthority: false, originalSProposed: 1, extraTestRepairCredits: 0,
  latest, capturedRuns: runs.length, retainedNonzeroRuns: runs.filter((run) => run.exitCode !== 0).map((run) => ({
    directory: run.directory, stage: run.stage, exitCode: run.exitCode
  })),
  emptyUnqualifiedDirectories, files,
  manualBootstrapFailure: 'evidence\\red\\recorder-bootstrap.failure.txt; explicitly manual retention, not raw assertion proof'
};
fs.writeFileSync(path.join(root, 'evidence-index.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'seal.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
console.log(`Sealed ${files.length} retained evidence files across ${runs.length} raw runs; every nonzero run retained, empty directories unqualified.`);
