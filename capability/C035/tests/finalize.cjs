'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = require('..\\source.cjs');
const evidence = require('./evidence.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 2) throw new Error('Exact one-time finalization capture only.');
const observed = evidence.captures();
assert.ok(observed.executions.some((run) => run.stage === 'focused' && run.exitCode === 0));
assert.ok(observed.edges.some((run) => run.outcome === 'passed' && run.actualDomChecksPassed === 18));
const files = evidence.files().filter((file) => file !== 'evidence-index.json' &&
  !/^publication-result-/.test(file) && !file.startsWith('evidence\\publication-'))
  .map((file) => {
    const bytes = evidence.read(file);
    return { path: file, byteLength: bytes.length, rawSha256: source.hash(bytes) };
  });
const preservedFailures = [
  ...observed.executions.filter((run) => run.exitCode !== 0).map((run) =>
    ({ directory: run.directory, stage: run.stage, exitCode: run.exitCode, relabeledSuccessful: false })),
  ...observed.edges.filter((run) => run.outcome !== 'passed').map((run) =>
    ({ directory: run.directory, kind: 'actual-Edge-DOM', outcome: run.outcome,
      actualDomChecksPassed: run.actualDomChecksPassed, helperSessionRemovalUnverified: true, relabeledSuccessful: false }))
];
fs.writeFileSync(path.join(evidence.root, 'evidence-index.json'), `${JSON.stringify({
  schema: 'C035-immutable-evidence-index/1', cardId: 'C035', workerId: 'worker-C035',
  capturedAtUtc: new Date().toISOString(), exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1',
  policy: 'Immutable source and all original evidence bytes. Later guarded captures append uniquely, never replace RED/failure or adopt user history.',
  files, preservedFailures, initialStubIsLoadable: true, genuineRedAssertions: 2,
  IaC: 'N/A', parentAcceptanceRequired: true, originalKanoCreditsMaximum: 1, extraCredits: 0,
  parentsAndNativeAndProductionNode24Completed: false
}, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(evidence.checkIndex()));
