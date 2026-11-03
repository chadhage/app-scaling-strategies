'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stage = process.argv[2];
const names = { red: 'red\\run', green: 'focused-run', browser: 'browser-run' };
if (!Object.hasOwn(names, stage)) throw new Error('Choose explicit red, green or browser capture');
if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Browser capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1');
}
let name = names[stage];
if (stage !== 'red') {
  let number = 1;
  while (fs.existsSync(path.join(root, 'evidence', `${name}-${String(number).padStart(3, '0')}.json`))) number += 1;
  name = `${name}-${String(number).padStart(3, '0')}`;
}
const prefix = path.join(root, 'evidence', name);
if (fs.existsSync(`${prefix}.json`)) throw new Error('Capture exists; raw provenance is immutable');
fs.mkdirSync(path.dirname(prefix), { recursive: true });
const relative = (file) => path.relative(repo, path.join(root, file));
const args = stage === 'red' ? ['--test', relative('tests\\model.test.cjs')]
  : stage === 'green' ? ['--test', ...['model', 'surface', 'integrity'].map((file) => relative(`tests\\${file}.test.cjs`))]
    : ['--test', relative('tests\\browser.test.cjs')];
const files = stage === 'red' ? ['static-assets.feature', 'model.js', 'tests\\model.test.cjs']
  : stage === 'browser' ? ['tests\\browser.test.cjs', 'tests\\csp-probe.js'] : [];
const snapshots = files.map((file) => {
  const bytes = fs.readFileSync(path.join(root, file));
  const destination = path.join(path.dirname(prefix), `${stage === 'red' ? '' : `${name}.`}${path.basename(file)}.snapshot`);
  fs.writeFileSync(destination, bytes, { flag: 'wx' });
  return {
    source: file, snapshot: path.relative(root, destination), rawSha256: hash(bytes),
    lfSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
    crlfCount: (bytes.toString('utf8').match(/\r\n/g) || []).length,
  };
});
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, args, {
  cwd: repo, windowsHide: true, timeout: 180000,
  env: { ...process.env, ...(stage === 'browser' ? { BROWSER_EVIDENCE_RUN: name } : {}) },
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.writeFileSync(`${prefix}.stdout.raw.gz`, gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(`${prefix}.stderr.raw.gz`, gzipSync(stderr), { flag: 'wx' });
fs.writeFileSync(`${prefix}.tap`, stdout, { flag: 'wx' });
const record = {
  stage, command: [process.execPath, ...args], cwd: repo, startedAtUtc, completedAtUtc: new Date().toISOString(),
  node: process.version, exitCode: run.status, signal: run.signal, error: run.error?.message || null,
  stdoutSha256: hash(stdout), stderrSha256: hash(stderr), snapshots,
  expectation: stage === 'red' ? 'Callable baseline passes; genuine ERR_ASSERTION behavior failures required'
    : 'Focused assertions pass using only approved local tooling',
};
fs.writeFileSync(`${prefix}.json`, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
if (run.error) throw run.error;
if (stage === 'red') {
  if (run.status !== 1 || !stdout.includes(Buffer.from('ERR_ASSERTION'))
      || /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/.test(stdout.toString())) {
    throw new Error('Not qualified behavioral RED');
  }
} else if (run.status !== 0) process.exitCode = run.status || 1;
