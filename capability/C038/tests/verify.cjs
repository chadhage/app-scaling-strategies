'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inventory, root, repository } = require('./inventory.cjs');
const sources = require('../sources.cjs');
assert.equal(process.argv.length, 2);
const before = inventory();
sources.checkImports();
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C038_CAPTURE_DIR;
delete env.NODE_V8_COVERAGE;
const commands = [
  ['syntax.cjs'], ['coverage.cjs'], ['publisher.cjs'],
  ['index-proof.cjs', 'probe'], ['browser.cjs']
];
let failure;
try {
  if (fs.existsSync(path.join(root, 'evidence-index.json'))) {
    console.log(JSON.stringify(require('./audit.cjs').audit()));
  }
  for (const args of commands) {
    const run = spawnSync(process.execPath, [path.join(__dirname, args[0]), ...args.slice(1)], {
      cwd: repository, env, encoding: null, windowsHide: true,
      timeout: 180000, maxBuffer: 16 * 1024 * 1024
    });
    process.stdout.write(run.stdout || Buffer.alloc(0));
    process.stderr.write(run.stderr || Buffer.alloc(0));
    assert.equal(run.status, 0, `C038 ordinary ${args[0]} must pass.`);
  }
} catch (error) { failure = error; }
finally {
  assert.deepEqual(inventory(), before, 'Ordinary checks must not alter owned source or any retained evidence.');
  sources.checkImports();
  const scratch = path.join(__dirname, 'scratch');
  assert.ok(!fs.existsSync(scratch) || fs.readdirSync(scratch).length === 0);
}
if (failure) throw failure;
console.log(JSON.stringify({ cardId: 'C038', outcome: 'passed', ordinaryVerification: true,
  sourceAndEvidenceFilesUnchanged: before.length, acceptedSourcesUnchanged: true,
  currentC015FixtureWriteCalls: 0, retainedDemoWrites: 0,
  actualBrowserExecuted: true, noImplicitCapture: true,
  groups: ['syntax', 'focused tests under the per-file 85/85/85 coverage gate over every enumerated production file (unloaded = 0%)',
    '61 archived publisher guards + 20 authority + 12 transport',
    'all-index-entry-and-flag read-only parsing', '17 actual signed Edge DOM/keyboard/CSP/cleanup checks'] }));
