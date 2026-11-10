'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const relative = 'capability\\C059\\evidence\\red\\mutation-policy-old\\report.json';
fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']) delete env[name];
const generation = spawnSync(process.execPath, [
  'capability\\C059\\tests\\mutate-gen.cjs', '--scratch', 'mutation-work\\policy-old',
  '--out', relative, '--workers', '2', '--only', 'server',
  '--match', 'decide() on a parse error|checkContinue: Node sends|closeServer destroying',
], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (generation.status !== 0) throw new Error(`old policy specimen failed: ${generation.status}`);
const red = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=900000', 'capability\\C059\\tests\\mutation-policy.test.cjs'], {
  cwd: root, env: { ...env, C059_MUTATION_POLICY_REPORT: relative }, stdio: 'inherit', windowsHide: true,
});
if (red.error) throw red.error;
process.exitCode = red.status ?? 1;
