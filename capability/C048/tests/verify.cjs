'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const env = { ...process.env, NODE_DISABLE_COLORS: '1' };
delete env.CAPTURE_BROWSER_EVIDENCE;

function digest() {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([path.relative(root, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
    }
  }
  visit(root);
  return crypto.createHash('sha256').update(JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: repository, env, maxBuffer: 32 * 1024 * 1024 });
  process.stdout.write(result.stdout || Buffer.alloc(0));
  process.stderr.write(result.stderr || Buffer.alloc(0));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `Focused read-only command failed: node ${args.join(' ')}`);
}

const before = digest();
try {
  run(['--test', '--test-reporter=dot', ...['admission', 'schema', 'guards', 'lineage', 'surface', 'integrity', 'publisher-boundary']
    .map((name) => path.join('capability', 'C048', 'tests', `${name}.test.cjs`))]);
  run([path.join('capability', 'C048', 'tests', 'syntax.cjs')]);
  run([path.join('capability', 'C048', 'tests', 'browser.cjs')]);
} finally {
  const after = digest();
  assert.equal(after, before, 'Ordinary full scoped verification must not change any C048 source/proof byte.');
  console.log(`READ_ONLY_NAMESPACE unchanged=true SHA256=${after}; child CAPTURE_BROWSER_EVIDENCE unset`);
}
