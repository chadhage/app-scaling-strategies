'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const evidence = require(path.join(__dirname, 'evidence.cjs'));

const stage = process.argv[2];
assert.ok(['pre-browser', 'browser', 'final'].includes(stage), 'Choose an explicit producer recording stage.');
if (stage === 'browser') assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
else assert.notEqual(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Non-capture verification must be read-only.');
const startedAtUtc = new Date().toISOString();
const syntax = [];
const syntaxOutput = [];
for (const relative of evidence.BASE_SOURCES.filter((file) => /\.(?:js|cjs)$/.test(file))) {
  const result = spawnSync(process.execPath, ['--check', path.join(evidence.ROOT, relative)], {
    encoding: null, timeout: 15000,
  });
  if (result.error) throw result.error;
  syntax.push({ file: relative, exitCode: result.status });
  syntaxOutput.push(result.stdout, result.stderr);
  assert.equal(result.status, 0, `Syntax failed for ${relative}`);
}
const selectors = stage === 'browser' ? ['browser.test.cjs']
  : stage === 'pre-browser' ? ['model.test.cjs', 'integrity.test.cjs']
    : ['model.test.cjs', 'integrity.test.cjs', 'browser-evidence.test.cjs', 'browser.test.cjs'];
const args = ['--test', '--test-reporter=spec',
  ...selectors.map((file) => path.join(evidence.ROOT, 'tests', file))];
const before = evidence.treeHashes();
const result = spawnSync(process.execPath, args, { encoding: null, timeout: 120000 });
if (result.error) throw result.error;
const after = evidence.treeHashes();
const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter((file) => before[file] !== after[file]);
if (stage !== 'browser') assert.deepEqual(changed, [], 'Ordinary verification modified owned files.');
else assert.ok(changed.every((file) => file.startsWith(`evidence${path.sep}browser${path.sep}`)));
const directory = path.join(evidence.ROOT, 'evidence', 'raw');
fs.mkdirSync(directory, { recursive: true });
let stem = stage;
for (let attempt = 1; fs.existsSync(path.join(directory, `${stem}.json`)); attempt++) stem = `${stage}-attempt-${attempt}`;
for (const stream of ['stdout', 'stderr']) {
  fs.writeFileSync(path.join(directory, `${stem}.${stream}.raw`), result[stream], { flag: 'wx' });
}
fs.writeFileSync(path.join(directory, `${stem}.syntax.raw`), Buffer.concat(syntaxOutput), { flag: 'wx' });
const output = result.stdout.toString('utf8');
const count = (name) => {
  const found = output.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`));
  return found ? Number(found[1]) : null;
};
const record = {
  cardId: 'A-S121', workerId: 'worker-A-S121', packet: 'SC-S121', stage,
  startedAtUtc, finishedAtUtc: new Date().toISOString(), command: [process.execPath, ...args],
  nodeVersion: process.version, exitCode: result.status, syntax,
  tests: count('tests'), passed: count('pass'), failed: count('fail'),
  sourceHashes: evidence.sourceHashes(),
  normalVerificationReadOnly: stage !== 'browser' && changed.length === 0,
  deliberateBrowserCapture: stage === 'browser', changedOwnedFiles: changed,
  stdoutSha256: evidence.sha256(result.stdout), stderrSha256: evidence.sha256(result.stderr),
  syntaxRawSha256: evidence.sha256(Buffer.concat(syntaxOutput)),
  nativeEvidence: false, additionalKanoCredits: 0,
};
fs.writeFileSync(path.join(directory, `${stem}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ stage, exitCode: record.exitCode, tests: record.tests,
  passed: record.passed, failed: record.failed, syntaxChecks: syntax.length,
  normalVerificationReadOnly: record.normalVerificationReadOnly,
  deliberateBrowserCapture: record.deliberateBrowserCapture, output: `evidence\\raw\\${stem}.json` }));
process.exitCode = result.status === 0 ? 0 : 1;
