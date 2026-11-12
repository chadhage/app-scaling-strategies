'use strict';
const cp = require('node:child_process'), path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./tests/selection.cjs');
const { verifyPublicSeal } = require('./tests/public-seal.cjs');
const { verifyEvidence } = require('./tests/evidence.cjs');
if (!process.argv.includes('--inside-local-watchdog')) {
  const env = { ...process.env, NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT; delete env.C047_ADMISSION; delete env.C047_WORKER_DEADLINE;
  const result = cp.spawnSync(process.execPath, [__filename, process.argv[2] || 'suite', '--inside-local-watchdog'], {
    cwd: path.resolve(root, '..', '..'), env, windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024
  });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) throw new Error('LOCAL_COMPLETE_SOURCE_EVIDENCE_AND_TEST_WATCHDOG_NONPASS', { cause: result.error });
  process.exitCode = result.status === null ? 1 : result.status;
} else {
const selected = verifySelection(), mode = process.argv[2] || 'suite';
assert.equal(['suite', 'coverage'].includes(mode), true, 'EXPLICIT_LOCAL_VERIFY_MODE');
const seal = verifyPublicSeal(), evidence = verifyEvidence();
console.log(JSON.stringify({ completeSourceAndEvidence: { seal, evidence }, localVerificationRequiresNoPrivateCaptureFilesystem: true }));
const env = { ...process.env, NODE_V8_COVERAGE: '' };
delete env.NODE_TEST_CONTEXT; delete env.C047_ADMISSION; delete env.C047_WORKER_DEADLINE;
const base = ['--test', '--experimental-test-isolation=none', '--test-concurrency=1', '--test-timeout=60000'];
let v8;
if (mode === 'coverage') {
  const parent = process.env.C047_CAPTURE_DIR || path.join(root, 'tests', 'scratch');
  fs.mkdirSync(parent, { recursive: true });
  v8 = fs.mkdtempSync(path.join(parent, 'coverage-v8-'));
  env.NODE_V8_COVERAGE = v8;
}
const run = extra => {
  const args = [...base, ...extra, ...selected.tests];
  const result = cp.spawnSync(process.execPath, args, { cwd: path.resolve(root, '..', '..'), env, encoding: 'utf8',
    timeout: 150000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) throw new Error('LOCAL_VERIFICATION_WATCHDOG_NONPASS', { cause: result.error });
  assert.equal(result.status, 0, 'LOCAL_VERIFICATION_MUST_PASS');
  return result.stdout;
};
try { if (mode === 'coverage') {
  const text = run(['--experimental-test-coverage', '--test-coverage-include=capability/C047/server.cjs',
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85']);
  const row = text.split('\n').find(line => /^#\s+server\.cjs\s*\|/.test(line));
  assert.equal(typeof row, 'string', 'ACTUALLY_LOADED_COMPLETE_PRODUCTION_COVERAGE_ROW_MISSING_EQUALS_ZERO');
  const values = row.split('|').slice(1, 4).map(value => Number(value.trim()));
  assert.equal(values.every(value => Number.isFinite(value) && value >= 85), true, 'PER_FILE_85_85_85_NOT_AGGREGATE');
  console.log(JSON.stringify({ completeProductionFiles: selected.production, literalIncludeSelectors: ['capability/C047/server.cjs'], loaded: 1, missingRows: 0,
    line: values[0], branch: values[1], function: values[2], localFailureWatchdogMs: 180000 }));
} else run([]);
} finally {
  if (v8 && !process.env.C047_CAPTURE_DIR) fs.rmSync(v8, { recursive: true });
}
}
