'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const report = 'capability\\C059\\evidence\\red\\mutation-policy-green\\report.json';
fs.mkdirSync(path.dirname(path.join(__dirname, report)), { recursive: true });
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']) delete env[name];
const generated = spawnSync(process.execPath, [
  'capability\\C059\\tests\\mutate-gen.cjs',
  '--scratch', 'mutation-work\\policy-green', '--out', report, '--workers', '2', '--only', 'server',
  '--match', 'decide() on a parse error|checkContinue: Node sends|closeServer destroying',
], { cwd: __dirname, env, stdio: 'inherit', windowsHide: true });
if (generated.error) throw generated.error;
if (generated.status !== 0) throw new Error(`the corrected generator specimen failed: ${generated.status}`);
const green = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=900000', 'capability\\C059\\tests\\mutation-policy.test.cjs', 'capability\\C059\\tests\\mutate-classify.test.cjs'], {
  cwd: __dirname, env: { ...env, C059_MUTATION_POLICY_REPORT: report }, stdio: 'inherit', windowsHide: true,
});
if (green.error) throw green.error;
process.exitCode = green.status ?? 1;
