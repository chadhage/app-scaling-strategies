'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
assert.equal(process.argv.length, 2);
assert.match(process.version, /^v22\./);
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C030_BROWSER_CAPTURE_DIR;
const commands = [
  ['--test', '--test-concurrency=1', ...['detector', 'boundary', 'surface', 'source', 'publisher-policy', 'integrity'].map((name) => path.join(__dirname, `${name}.test.cjs`))],
  [path.join(__dirname, 'syntax.cjs')],
  [path.join(__dirname, 'browser.cjs')]
];
for (const args of commands) {
  const output = spawnSync(process.execPath, args, {
    cwd: path.resolve(root, '..', '..'), env, timeout: 180000, windowsHide: true, maxBuffer: 16 * 1024 * 1024
  });
  process.stdout.write(output.stdout || Buffer.alloc(0));
  process.stderr.write(output.stderr || Buffer.alloc(0));
  assert.equal(output.status, 0, `Read-only verification failed: ${args.join(' ')}`);
}
console.log(JSON.stringify({ cardId: 'C030', verified: true, evidenceOrSourceRewritten: false,
  currentAuthorityNotInferredFromHistoricalFixture: true, originalUnits: 1, extraCredits: 0 }));
