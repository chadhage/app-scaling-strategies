'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const evidence = path.join(lesson, 'evidence');
const phase = process.argv[2];
const phases = ['red', 'green', 'browser', 'syntax', 'integrity'];
if (!phases.includes(phase)) throw new Error(`Expected phase: ${phases.join(', ')}`);
if (!/^v22\./.test(process.version)) throw new Error('Use approved Node 22 test tooling; Node 24 is unvalidated.');
fs.mkdirSync(evidence, { recursive: true });
const recordPath = path.join(evidence, `${phase}.json`);
let attempt = 1;
if (fs.existsSync(recordPath)) {
  if (phase === 'red') throw new Error('Never overwrite the original red record.');
  const previous = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  attempt = (previous.attempt || 1) + 1;
  fs.copyFileSync(recordPath, path.join(evidence, `${phase}-${attempt - 1}.json`));
  if (phase === 'browser') {
    for (const file of ['browser-observations.json', 'browser.png', 'browser-dom.txt']) {
      const current = path.join(evidence, file);
      if (fs.existsSync(current)) {
        fs.copyFileSync(current, path.join(evidence, `browser-${attempt - 1}${file.slice('browser'.length)}`));
      }
    }
  }
}
const logPrefix = attempt === 1 ? phase : `${phase}-${attempt}`;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = (file) => path.relative(repo, file);
const sources = [
  'specification.feature', 'README.md', 'manifest.json', 'index.html', 'styles.css',
  'rehearsal.js', 'app.js', 'tests\\logic.test.cjs', 'tests\\browser.test.cjs',
  'tests\\integrity.test.cjs', 'tests\\capture.cjs', 'tests\\provenance.cjs', 'evidence\\iac-na.json',
].map((file) => path.join(lesson, file)).filter((file) => fs.existsSync(file));
const sourceHashes = Object.fromEntries(sources.map((file) => [relative(file), sha(file)]));
const sourceDocs = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
const startedAtUtc = new Date().toISOString();
const git = spawnSync('git', ['--no-pager', 'rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
if (git.status !== 0) throw new Error(`Cannot capture baseline: ${git.stderr}`);
const commands = [];
function run(args, file) {
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: repo, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const raw = result.stdout + result.stderr;
  const output = path.join(evidence, file);
  fs.writeFileSync(output, raw);
  const counts = {};
  for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = raw.match(new RegExp(`^# ${key} (\\d+)\\r?$`, 'm'));
    if (match) counts[key] = Number(match[1]);
  }
  const command = {
    executable: process.execPath, args, cwd: repo, startedAtUtc: started,
    finishedAtUtc: new Date().toISOString(), exitCode: result.status, signal: result.signal,
    rawLog: relative(output), rawLogSha256: sha(output), counts,
  };
  commands.push(command);
  process.stdout.write(raw);
  return { result, raw, command };
}
let valid = true;
if (phase === 'red') {
  const snapshotFile = path.join(evidence, 'red.stub.cjs');
  if (fs.existsSync(path.join(evidence, 'red.json'))) throw new Error('Never overwrite the original red record.');
  fs.copyFileSync(path.join(lesson, 'rehearsal.js'), snapshotFile);
  const syntax = run(['--check', 'learning\\S010\\rehearsal.js'], 'red.syntax.log');
  const tests = run(['--test', 'learning\\S010\\tests\\logic.test.cjs'], 'red.log');
  valid = syntax.result.status === 0 && tests.result.status === 1
    && tests.command.counts.fail > 0 && /ERR_ASSERTION/.test(tests.raw)
    && !/MODULE_NOT_FOUND|Cannot find module|SyntaxError|TypeError/.test(tests.raw);
} else if (phase === 'syntax') {
  const files = sources.filter((file) => /\.(?:js|cjs)$/.test(file));
  for (const [index, file] of files.entries()) {
    const checked = run(['--check', relative(file)], `${logPrefix}-${index + 1}.log`);
    valid = checked.result.status === 0 && valid;
  }
} else {
  const suite = phase === 'green' ? 'logic' : phase;
  const checked = run(['--test', `learning\\S010\\tests\\${suite}.test.cjs`], `${logPrefix}.log`);
  valid = checked.result.status === 0 && checked.command.counts.fail === 0
    && checked.command.counts.tests > 0;
}
const record = {
  schemaVersion: 1, cardId: 'A-S010', workerId: 'worker-A-S010', kanoUnit: 'A-S010',
  kano: 'S', phase, attempt, mode: 'local-synthetic-only', baselineCommit: git.stdout.trim(),
  startedAtUtc, finishedAtUtc: new Date().toISOString(), nodeVersion: process.version,
  nodeExecutable: process.execPath, productionNode24Validated: false,
  commands, sourceHashes, sourceDocHashes: Object.fromEntries(sourceDocs.map((file) =>
    [file, sha(path.join(repo, file))])),
  behavioralRed: phase === 'red' ? {
    loadableStubSyntaxExitCode: commands[0].exitCode,
    actualTestExitCode: commands[1].exitCode,
    snapshot: 'learning\\S010\\evidence\\red.stub.cjs',
    snapshotSha256: sha(path.join(evidence, 'red.stub.cjs')),
    reason: 'Loadable no-op behavior fails assertions; not missing code, dependencies, or parsing.',
  } : null,
  stageExpectationMet: valid,
  limitations: 'Synthetic flag rehearsal only; no native Azure, IaC, deployment migration, or Node 24 proof.',
};
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
if (!valid) process.exitCode = 1;
console.log(`Evidence phase ${phase}: ${valid ? 'expected outcome recorded' : 'FAILED'} (raw exit statuses retained).`);
