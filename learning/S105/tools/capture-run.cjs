'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const stage = process.argv[2];
const commands = {
  red: ['--test', path.join(root, 'tests', 'model.test.cjs')],
  green: ['--test', path.join(root, 'tests', 'model.test.cjs'), path.join(root, 'tests', 'integrity.test.cjs')],
  syntax: [path.join(root, 'tools', 'syntax.cjs')],
};
if (process.env.CAPTURE_TEST_EVIDENCE !== '1' || process.argv.length !== 3 || !Object.hasOwn(commands, stage)) {
  throw new Error('Deliberate capture only: CAPTURE_TEST_EVIDENCE=1 node tools\\capture-run.cjs red|green|syntax');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let attempt = 1;
const evidence = path.join(root, 'evidence');
while (fs.existsSync(path.join(evidence, `${stage}-${String(attempt).padStart(3, '0')}.json`))) attempt++;
const name = `${stage}-${String(attempt).padStart(3, '0')}`;
const raw = path.join(evidence, 'raw', name);
fs.mkdirSync(raw, { recursive: true });
const save = (file, bytes) => {
  fs.writeFileSync(path.join(raw, `${file}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
  return { file: `raw/${name}/${file}.raw.gz`, sha256: hash(bytes), bytes: bytes.length };
};
const snapshotFiles = stage === 'red'
  ? ['.gitattributes', 'lesson.feature', 'model.js', 'tests/model.test.cjs', 'tools/capture-run.cjs']
  : ['.gitattributes', 'README.txt', 'lesson.feature', 'model.js', 'lesson.js', 'index.html',
    'lesson.css', 'manifest.json', 'remainder.json', 'tests/model.test.cjs', 'tests/integrity.test.cjs',
    'tools/browser.cjs', 'tools/syntax.cjs', 'tools/capture-run.cjs', 'tools/capture-source.cjs',
    'tools/record-iac-na.cjs'];
const snapshots = snapshotFiles.map((file) => ({
  source: file,
  ...save(file.replaceAll('/', '--'), fs.readFileSync(path.join(root, ...file.split('/')))),
}));
const startedAtUtc = new Date().toISOString();
let precheck = null;
if (stage === 'red') {
  const check = spawnSync(process.execPath, ['-e',
    `const m=require(${JSON.stringify(path.join(root, 'model.js'))}); for (const k of ['createState','transition','summarize']) if(typeof m[k]!=='function') throw Error(k); console.log('Loadable stub API');`,
  ], { cwd: repo, timeout: 15000 });
  precheck = {
    status: check.status,
    stdout: save('load.stdout', check.stdout || Buffer.alloc(0)),
    stderr: save('load.stderr', check.stderr || Buffer.alloc(0)),
  };
  if (check.status !== 0 || check.error) throw new Error('Stub loadability failed; this is not behavioral RED.');
}
const run = spawnSync(process.execPath, commands[stage], {
  cwd: repo, timeout: 90000, maxBuffer: 8 * 1024 * 1024,
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
const acceptedResult = stage === 'red'
  ? run.status === 1 && /ERR_ASSERTION|AssertionError/.test(stdout.toString('utf8'))
  : run.status === 0;
const record = {
  stage, name, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...commands[stage]],
  runtime: process.version, cwd: repo, status: run.status, signal: run.signal,
  error: run.error ? String(run.error) : null,
  stdout: save('stdout', stdout), stderr: save('stderr', stderr),
  snapshots, precheck, acceptedResult,
  scope: 'A-S105 local synthetic lesson only; no native, parent, production runtime or additional Kano credit.',
};
fs.writeFileSync(path.join(evidence, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(JSON.stringify({ evidence: `${name}.json`, status: run.status, acceptedResult }));
if (!acceptedResult || run.error) process.exitCode = 1;
