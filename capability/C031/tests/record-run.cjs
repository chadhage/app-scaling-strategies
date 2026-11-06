'use strict';

// Append-only recorder (flag wx) for the GREEN suite and the per-file coverage run. Raw stdout, raw stderr, exit code and a
// manifest with the SHA-256 of every source and test file measured, so evidence.test.cjs can tell when a record is stale.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { childEnvironment } = require('.\\nested-runner.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const [kind, name] = process.argv.slice(2);
if (!['green', 'coverage'].includes(kind) || !/^run-[a-z0-9-]{1,40}$/.test(name || '')) {
  throw new Error('usage: node record-run.cjs green|coverage run-<name>');
}
const sha = (file) => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const production = fs.readdirSync(root).filter((file) => /\.(?:js|cjs)$/.test(file)).sort();
const tests = fs.readdirSync(__dirname).filter((file) => /\.test\.cjs$/.test(file) && file !== 'evidence.test.cjs').sort();
const sources = Object.fromEntries([...production, 'index.html', 'style.css', 'imports.json'].map((file) => [file, sha(file)]));
const testHashes = Object.fromEntries([...tests, 'coverage.cjs', 'fixtures.cjs'].map((file) => [`tests\\${file}`, sha(path.join('tests', file))]));
const directory = path.join(root, 'evidence', kind, name);
fs.mkdirSync(directory, { recursive: true });
const args = kind === 'green' ?
  ['--test', '--test-concurrency=1', '--test-reporter=tap', ...tests.map((file) => path.join('capability', 'C031', 'tests', file))] :
  [path.join('capability', 'C031', 'tests', 'coverage.cjs')];
const run = spawnSync(process.execPath, args, {
  cwd: repository, env: childEnvironment(), windowsHide: true, timeout: 900000, maxBuffer: 64 * 1024 * 1024
});
// Raw output is stored as byte-exact gzip: authentic trailing whitespace stays untouched and out of whitespace checks.
const rawSha = (bytes) => createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(directory, 'stdout.raw.gz'), zlib.gzipSync(run.stdout, { level: 9 }), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw.gz'), zlib.gzipSync(run.stderr, { level: 9 }), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'exit-code.txt'), `${run.status}\n`, { flag: 'wx' });
const stdout = run.stdout.toString('utf8');
const manifest = {
  schema: 'C031-run/1', kind, name, command: `node ${args.join(' ')}`, node: process.version, exitCode: run.status,
  rawSha256: { stdout: rawSha(run.stdout), stderr: rawSha(run.stderr) }, sources, tests: testHashes,
  parsed: kind === 'green' ?
    { tests: Number(/^# tests (\d+)/m.exec(stdout)?.[1]), pass: Number(/^# pass (\d+)/m.exec(stdout)?.[1]), fail: Number(/^# fail (\d+)/m.exec(stdout)?.[1]) } :
    JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
};
fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ kind, name, exitCode: run.status, parsed: kind === 'green' ? manifest.parsed : { passed: manifest.parsed.passed } }));
