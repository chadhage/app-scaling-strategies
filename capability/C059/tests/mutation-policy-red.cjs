'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..', '..', '..');
const report = 'capability\\C059\\evidence\\red\\mutation-policy-final\\report.json';
fs.mkdirSync(path.dirname(path.join(repository, report)), { recursive: true });
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']) delete env[name];
const before = spawnSync(process.execPath, [
  'capability\\C059\\tests\\run-old-mutation.cjs',
  '--scratch', 'mutation-work\\policy-final-old', '--out', report, '--workers', '2', '--only', 'server',
  '--match', 'decide() on a parse error|checkContinue: Node sends|closeServer destroying',
], { cwd: repository, env, stdio: 'inherit', windowsHide: true });
if (before.error) throw before.error;
if (before.status !== 0) throw new Error(`the unchanged old generator specimen failed: ${before.status}`);
const red = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=900000', 'capability\\C059\\tests\\mutation-policy.test.cjs'], {
  cwd: repository, env: { ...env, C059_MUTATION_POLICY_REPORT: report }, stdio: 'inherit', windowsHide: true,
});
if (red.error) throw red.error;
process.exitCode = red.status ?? 1;
