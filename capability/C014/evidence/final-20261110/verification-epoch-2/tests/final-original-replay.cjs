'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const cases = [
  ['original-assertions', ['--require', '.\\capability\\C014\\tests\\scratch-cwd.cjs', '--test', '--test-concurrency=1',
    'capability\\C014\\evidence\\red\\initial-a-r2.snapshot.cjs', 'capability\\C014\\evidence\\red\\initial-b.snapshot.cjs',
    'capability\\C014\\evidence\\red\\fix3\\f1.snapshot.cjs', 'capability\\C014\\evidence\\red\\fix3\\f2.snapshot.cjs']],
  ['original-quantifier-driver', ['capability\\C014\\evidence\\red\\fix3\\f3-survivors.snapshot.cjs']]
];
for (const [label, args] of cases) {
  const env = { ...process.env, NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  delete env.C014_MUTANT;
  const run = spawnSync(process.execPath, args, { cwd: REPOSITORY, env, windowsHide: true, timeout: 900000, maxBuffer: 128 * 1024 * 1024 });
  const directory = path.join(process.env.C014_PRIVATE_EVIDENCE, 'original-replays', process.env.C014_ACTIVE_CAPTURE, label);
  fs.mkdirSync(directory, { recursive: true });
  const streams = {};
  for (const stream of ['stdout', 'stderr']) {
    const bytes = run[stream] || Buffer.alloc(0);
    const gzip = zlib.gzipSync(bytes);
    fs.writeFileSync(path.join(directory, `${stream}.raw.gz`), gzip, { flag: 'wx' });
    streams[stream] = { path: `${stream}.raw.gz`, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      gzipSha256: crypto.createHash('sha256').update(gzip).digest('hex') };
  }
  fs.writeFileSync(path.join(directory, 'original.json'), JSON.stringify({ label, exit: run.status, args, streams }, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(run.stdout || Buffer.alloc(0));
  process.stderr.write(run.stderr || Buffer.alloc(0));
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, 'unchanged original assertions and driver replay GREEN');
  if (label === 'original-quantifier-driver') {
    const text = run.stdout.toString('utf8');
    assert.match(text, /survivors: 0/);
    const names = [...text.matchAll(/KILLED by "([^"]+)"/g)].map((match) => match[1]);
    assert.equal(names.length, 2);
    assert.ok(names[0].startsWith('shape e-mail address:'), 'the e-mail mutant fails its literal shape assertion');
    assert.ok(names[1].startsWith('shape long hex:') || names[1].startsWith('the closed list of shapes and its ORDER:'), 'the hex mutant fails its literal-shape or closed-order assertion, not a file/module fault');
  }
}
console.log(JSON.stringify({ schema: 'C014-original-red-replay/1', unchangedOriginalAssertions: true, originalReviewerQuantifierMutants: 2, naturalNamedKills: true }));
