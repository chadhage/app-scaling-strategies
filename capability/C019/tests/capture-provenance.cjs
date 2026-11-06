'use strict';

// Deliberate capture of the U021 RED and GREEN runs of tests\provenance.test.cjs, in the shape tests\capture.cjs writes
// (raw gzip stdout/stderr, raw source snapshots, hashes), so that tests\integrity.test.cjs verifies them like every other capture.
// Usage: CAPTURE_BROWSER_EVIDENCE=1 node capability\C019\tests\capture-provenance.cjs provenance-red | provenance-green
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const [mode, ...extra] = process.argv.slice(2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Capture requires exact deliberate opt-in.');
assert.equal(extra.length, 0);
assert.ok(['provenance-red', 'provenance-green'].includes(mode));
const capture = path.join(root, 'evidence', `${mode}-${randomUUID()}`);
fs.mkdirSync(capture);
const files = [];
function save(name, bytes) {
  fs.writeFileSync(path.join(capture, name), bytes, { flag: 'wx' });
  files.push({ name, bytes: bytes.length, sha256: sha(bytes) });
}
function archive(name, bytes) {
  save(`${name}.gz`, gzipSync(bytes));
  return { file: `${name}.gz`, originalBytes: bytes.length, originalSha256: sha(bytes),
    crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length };
}

const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C019_CAPTURE_DIRECTORY']) delete env[name];
const args = ['--test', '--test-concurrency=1', 'capability/C019/tests/provenance.test.cjs'];
const result = spawnSync(process.execPath, args, { cwd: repo, env, timeout: 600000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
assert.ifError(result.error);
const inputs = ['tests\\provenance.cjs', 'tests\\provenance.test.cjs', 'tests\\provenance-hook.cjs', 'tests\\verify.cjs',
  'C019-provenance-scope.feature', 'evidence-index.json', 'evidence-index-addendum-1.json', 'tests\\seal-provenance-addendum.cjs'];
const snapshots = inputs.filter((relative) => fs.existsSync(path.join(root, relative))).map((relative) =>
  ({ path: relative, working: archive(relative.replaceAll('\\', '-') + '.raw', fs.readFileSync(path.join(root, relative))) }));
const stdout = archive('stdout.raw', result.stdout || Buffer.alloc(0));
const stderr = archive('stderr.raw', result.stderr || Buffer.alloc(0));
const text = (result.stdout || Buffer.alloc(0)).toString('utf8');
const number = (name) => {
  const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
  return matches.length ? Number(matches.at(-1)[1]) : null;
};
const counts = { tests: number('tests'), pass: number('pass'), fail: number('fail'), cancelled: number('cancelled'), skipped: number('skipped') };
const genuineAssertionRed = mode === 'provenance-red' && result.status === 1 && /ERR_ASSERTION/.test(text) &&
  !/MODULE_NOT_FOUND|SyntaxError/.test(text);
const record = {
  schemaVersion: 1, cardId: 'C019', workerId: 'worker-U021', mode, capturedAtUtc: new Date().toISOString(), node: process.version,
  baseline: null, deliberateCapture: true, command: `node ${args.join(' ')}`, exitCode: result.status, signal: result.signal || null,
  stdout, stderr, snapshots, files, counts, genuineAssertionRed,
  passed: mode === 'provenance-red' ? genuineAssertionRed : result.status === 0 && counts.fail === 0 && counts.tests > 0,
  originalUnitCredits: 0,
};
save('capture.raw.json', Buffer.from(JSON.stringify(record, null, 2) + '\r\n'));
process.stdout.write(JSON.stringify({ capture: path.relative(root, capture), mode, exitCode: result.status, counts, passed: record.passed }) + '\n');
process.exitCode = record.passed ? 0 : 1;
