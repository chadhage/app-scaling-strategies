'use strict';

// Archives ONE green run of the whole non-browser suite: evidence\<name>\manifest.json plus gzip transcripts (written once, never edited).
//   node capability\C017\tests\green.cjs green-01
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { production } = require('./coverage.cjs');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function record(name) {
  const suites = fs.readdirSync(__dirname).filter((file) => file.endsWith('.test.cjs')).sort();
  const dir = path.join(root, 'evidence', name);
  fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=170000', ...suites.map((file) => `capability/C017/tests/${file}`)];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.C017_TEST_ENGINE;
  const started = new Date().toISOString();
  const run = spawnSync(process.execPath, args, { cwd: repo, env, encoding: 'utf8', timeout: 900000, maxBuffer: 256 * 1024 * 1024 });
  const count = (label) => Number((new RegExp(`^# ${label} (\\d+)`, 'm').exec(run.stdout) || [0, 0])[1]);
  fs.writeFileSync(path.join(dir, 'raw', 'suite.stdout.raw.gz'), zlib.gzipSync(run.stdout), { flag: 'wx' });
  fs.writeFileSync(path.join(dir, 'raw', 'suite.stderr.raw.gz'), zlib.gzipSync(run.stderr), { flag: 'wx' });
  const manifest = {
    schema: 'C017-green/1', node: process.version, command: `node ${args.slice(0, 5).join(' ')} <${suites.length} test files>`, cwd: 'repository root', startedAtUtc: started, finishedAtUtc: new Date().toISOString(),
    exitCode: run.status, summary: { tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), skipped: count('skipped') },
    inputs: [...production.map((file) => ({ path: file, sha256: sha(path.join(root, file)) })), ...suites.map((file) => ({ path: `tests/${file}`, sha256: sha(path.join(__dirname, file)) }))],
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

if (require.main === module) {
  const name = process.argv[2];
  if (!/^green-[a-z0-9-]+$/.test(name || '')) { console.error('usage: green.cjs green-<name>'); process.exit(2); }
  const manifest = record(name);
  console.log(JSON.stringify({ archived: name, exitCode: manifest.exitCode, summary: manifest.summary }, null, 2));
  process.exit(manifest.exitCode === 0 ? 0 : 1);
}
module.exports = Object.freeze({ record });
