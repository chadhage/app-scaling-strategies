'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');
const evidence = path.join(__dirname, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stage = process.argv[2];
const syntaxFiles = [
  'range-resume.js', 'app.js', 'capture.cjs', 'tests\\core.test.cjs',
  'tests\\surface.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs',
];
const commands = {
  stub: ['-e', "const a=require('.\\\\learning\\\\S044\\\\range-resume.js');if(typeof a.createRehearsal!=='function')process.exit(1);const s=a.createRehearsal();console.log(JSON.stringify({loaded:true,methods:Object.keys(s)}));"],
  red: ['--test', '--test-reporter=tap', '.\\learning\\S044\\tests\\core.test.cjs'],
  green: ['--test', '--test-reporter=tap', '.\\learning\\S044\\tests\\core.test.cjs', '.\\learning\\S044\\tests\\surface.test.cjs'],
  browser: ['--test', '--test-reporter=tap', '.\\learning\\S044\\tests\\browser.test.cjs'],
  verify: ['--test', '--test-reporter=tap', '.\\learning\\S044\\tests\\core.test.cjs', '.\\learning\\S044\\tests\\surface.test.cjs', '.\\learning\\S044\\tests\\integrity.test.cjs', '.\\learning\\S044\\tests\\browser.test.cjs'],
  syntax: ['-e', `const {spawnSync}=require('node:child_process');for(const file of ${JSON.stringify(syntaxFiles.map((name) => path.join(__dirname, name)))}){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});console.log(JSON.stringify({file,exitCode:r.status,stdout:r.stdout,stderr:r.stderr}));if(r.status!==0)process.exitCode=1;}`],
};
if (stage === 'seal') {
  const files = fs.readdirSync(__dirname, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !['evidence\\integrity.json', 'evidence\\verify.raw.json'].includes(path.relative(__dirname, file)));
  const record = {
    schemaVersion: 1, cardId: 'A-S044', algorithm: 'SHA-256', sealedAtUtc: new Date().toISOString(),
    exclusions: ['evidence\\integrity.json', 'evidence\\verify.raw.json'],
    reason: 'The inventory cannot hash itself; a subsequent deliberate read-only verification log is retained separately.',
    files: Object.fromEntries(files.sort().map((file) => [path.relative(__dirname, file), hash(fs.readFileSync(file))])),
  };
  fs.writeFileSync(path.join(evidence, 'integrity.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Sealed ${files.length} owned source and proof files.`);
  process.exit(0);
}
if (!Object.hasOwn(commands, stage)) throw new Error('Choose stub, red, green, browser, syntax, seal, or verify.');
if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Browser proof capture requires explicit CAPTURE_BROWSER_EVIDENCE=1.');
if (stage === 'verify' && process.env.CAPTURE_BROWSER_EVIDENCE === '1') throw new Error('Final verification must not recapture browser proof.');
fs.mkdirSync(evidence, { recursive: true });
const destination = path.join(evidence, `${stage}.raw.json`);
if (['stub', 'red'].includes(stage) && fs.existsSync(destination)) throw new Error('Historical proof cannot be overwritten.');
if (stage === 'browser' && fs.existsSync(destination)) {
  const previous = JSON.parse(fs.readFileSync(destination, 'utf8'));
  if (previous.exitCode !== 0) {
    let attempt = 1;
    while (fs.existsSync(path.join(evidence, `browser.failed-attempt-${attempt}.raw.json`))) attempt += 1;
    fs.copyFileSync(destination, path.join(evidence, `browser.failed-attempt-${attempt}.raw.json`));
  }
}
const sources = [
  'range-resume.feature', 'range-resume.js', 'tests\\core.test.cjs', 'capture.cjs',
  'app.js', 'index.html', 'styles.css', 'manifest.json', 'tests\\surface.test.cjs',
  'tests\\browser.test.cjs', 'tests\\integrity.test.cjs',
].filter((name) => fs.existsSync(path.join(__dirname, name)));
const sourceHashes = Object.fromEntries(sources.map((name) => [name, hash(fs.readFileSync(path.join(__dirname, name)))]));
if (stage === 'red') {
  const snapshot = path.join(evidence, 'red');
  fs.mkdirSync(snapshot);
  for (const [source, target] of [
    ['range-resume.feature', 'bdd.feature.snapshot'],
    ['range-resume.js', 'model.source.snapshot'],
    ['tests\\core.test.cjs', 'assertions.source.snapshot'],
  ]) fs.copyFileSync(path.join(__dirname, source), path.join(snapshot, target));
}
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, commands[stage], { cwd: root, timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
const record = {
  schemaVersion: 1, cardId: 'A-S044', workerId: 'worker-A-S044', stage,
  command: [process.execPath, ...commands[stage]], cwd: root, runtime: process.version,
  startedAtUtc, finishedAtUtc: new Date().toISOString(),
  pid: run.pid, exitCode: run.status, signal: run.signal, error: run.error ? String(run.error) : null,
  sourceHashes,
  stdout: run.stdout.toString('utf8'), stderr: run.stderr.toString('utf8'),
  stdoutBase64: run.stdout.toString('base64'), stderrBase64: run.stderr.toString('base64'),
  stdoutSha256: hash(run.stdout), stderrSha256: hash(run.stderr),
};
fs.writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(record.stdout);
process.stderr.write(record.stderr);
console.log(`Captured ${stage}: exit ${record.exitCode}; ${destination}`);
if (stage === 'red') {
  if (run.status !== 1 || !record.stdout.includes('ERR_ASSERTION')
      || /MODULE_NOT_FOUND|SyntaxError|ENOENT/.test(record.stdout + record.stderr)) {
    throw new Error('RED must be an actual assertion failure, not a missing tool/import/code failure.');
  }
} else if (run.status !== 0 || run.error) {
  process.exitCode = 1;
}
