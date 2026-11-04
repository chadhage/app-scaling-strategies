'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, digest } = require('./readonly.cjs');
const repository = path.resolve(root, '..', '..');
const env = { ...process.env, NODE_DISABLE_COLORS: '1' };
delete env.CAPTURE_BROWSER_EVIDENCE;
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: repository, env, maxBuffer: 32 * 1024 * 1024 });
  process.stdout.write(result.stdout || Buffer.alloc(0));
  process.stderr.write(result.stderr || Buffer.alloc(0));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `Read-only focused command failed: node ${args.join(' ')}`);
}
const before = digest();
try {
  run(['--test', '--test-reporter=tap',
    ...['recommendation', 'surface', 'integrity', 'publisher-boundary', 'evidence', 'index', 'report', 'transport'].map(name =>
      path.join('capability', 'X003', 'tests', `${name}.test.cjs`)),
    path.join('capability', 'C006', 'tests', 'search.test.cjs'),
    path.join('capability', 'C007', 'tests', 'filters.test.cjs')]);
  run([path.join('capability', 'X003', 'tests', 'syntax.cjs')]);
  run([path.join('capability', 'X003', 'tests', 'browser.cjs')]);
} finally {
  const after = digest();
  assert.equal(after, before, 'Ordinary verification preserves every X003 source/evidence byte; no capture inherited.');
  console.log(`X003 READ_ONLY_NAMESPACE unchanged=true SHA256=${after}; child CAPTURE_BROWSER_EVIDENCE unset.`);
}
