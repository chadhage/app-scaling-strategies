'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { root, inventory, checkDependencies, publisherBoundary } = require('./provenance.cjs');

const phase = process.argv[2];
if (process.argv.length !== 3 || !['focused', 'routes', 'integrity', 'syntax', 'browser'].includes(phase)) throw new Error('Choose focused, routes, integrity, syntax or browser read-only verification.');
const before = inventory();
const dependenciesBefore = checkDependencies();
let exitCode = 0;
try {
  const commands = [];
  if (phase === 'syntax') {
    function visit(directory) {
      for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, item.name);
        if (item.isDirectory() && item.name !== 'evidence') visit(target);
        else if (item.isFile() && /\.(?:cjs|js)$/.test(item.name)) commands.push(['--check', target]);
      }
    }
    visit(root);
  } else {
    const names = phase === 'focused'
      ? ['progress.test.cjs', 'inspection.test.cjs', 'http.test.cjs', 'integrity.test.cjs']
      : phase === 'routes' ? ['http.test.cjs'] : phase === 'integrity' ? ['integrity.test.cjs'] : ['browser.acceptance.cjs'];
    commands.push(['--test', '--test-concurrency=1', ...names.map((name) => path.join(__dirname, name))]);
  }
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, { timeout: 540000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    process.stdout.write(result.stdout || Buffer.alloc(0));
    process.stderr.write(result.stderr || Buffer.alloc(0));
    if (result.status !== 0 || result.error || result.signal) {
      exitCode = 1;
      if (result.error) console.error(result.error.message);
      if (result.signal) console.error(`Owned verification terminated: ${result.signal}`);
      break;
    }
  }
  if (phase === 'syntax' && exitCode === 0) console.log(JSON.stringify({ syntaxCommands: commands.length, passed: true }));
} finally {
  assert.deepEqual(inventory(), before, 'Normal verification must not modify C018 source or retained evidence.');
  assert.deepEqual(checkDependencies(), dependenciesBefore, 'Dependency source and retained C015 fixtures must stay byte-identical.');
  console.log(JSON.stringify({ phase, sourceEvidenceReadOnly: true, dependenciesReadOnly: true,
    publisherBoundary: publisherBoundary(), node: process.version, exitCode }));
}
process.exitCode = exitCode;
