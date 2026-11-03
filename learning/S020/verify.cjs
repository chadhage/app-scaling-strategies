'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidence = path.join(__dirname, 'evidence');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshot = () => Object.fromEntries(
  [...fs.readdirSync(evidence).map((name) => path.join('evidence', name)), 'evidence.json'].sort()
    .map((name) => [name, sha(fs.readFileSync(path.join(__dirname, name)))])
);
const before = snapshot();
const stage = process.argv[2] || 'all';
const stages = stage === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [stage];
assert.equal(process.version, 'v22.23.4', 'This proof is limited to the approved installed Node22 test tooling.');
assert.ok(stages.every((entry) => ['green', 'syntax', 'browser', 'integrity'].includes(entry)),
  'Use all, green, syntax, browser, or integrity');
let failed = false;

for (const current of stages) {
  let number = 1;
  while (fs.readdirSync(evidence).some((name) => name.startsWith(`${current}-${number}.`)
    || name.startsWith(`${current}-${number}-`))) number += 1;
  const stem = `${current}-${number}`;
  const startedAtUtc = new Date().toISOString();
  const files = current === 'syntax'
    ? fs.readdirSync(__dirname).filter((name) => /\.(?:js|cjs)$/.test(name)).sort() : [];
  const invocations = current === 'syntax'
    ? files.map((name) => ['--check', path.join(__dirname, name)])
    : [['--test', '--test-reporter=tap', path.join(__dirname, `${current === 'green' ? 'model' : current}.test.cjs`)]];
  const results = invocations.map((args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: path.resolve(__dirname, '..', '..'),
      encoding: 'utf8',
      timeout: current === 'browser' ? 600000 : 60000,
      windowsHide: true,
      env: { ...process.env, S020_CAPTURE_STEM: stem }
    });
    return {
      command: [process.execPath, ...args],
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message || null,
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    };
  });
  const stdout = results.map((result) => current === 'syntax'
    ? `${result.command.join(' ')}\nexit ${result.exitCode}\n${result.stdout}` : result.stdout).join('');
  const stderr = results.map((result) => result.stderr).join('');
  const passed = results.every((result) => result.exitCode === 0 && !result.error);
  if (capture) {
    fs.writeFileSync(path.join(evidence, `${stem}.stdout.txt`), stdout, { flag: 'wx' });
    fs.writeFileSync(path.join(evidence, `${stem}.stderr.txt`), stderr, { flag: 'wx' });
    const sourceHashes = Object.fromEntries(fs.readdirSync(__dirname)
      .filter((name) => fs.statSync(path.join(__dirname, name)).isFile() && name !== 'evidence.json')
      .sort().map((name) => [name, sha(fs.readFileSync(path.join(__dirname, name)))]));
    const counts = Object.fromEntries([...stdout.matchAll(/^# (tests|pass|fail|skipped|cancelled) (\d+)$/gm)]
      .map((match) => [match[1], Number(match[2])]));
    fs.writeFileSync(path.join(evidence, `${stem}.json`), `${JSON.stringify({
      cardId: 'A-S020', workerId: 'worker-A-S020', kanoUnit: 'A-S020', packet: 'SC-S020',
      stage: current, node: process.version, startedAtUtc, finishedAtUtc: new Date().toISOString(),
      passed, captureWasExplicit: true,
      commands: results.map(({ stdout: ignoredOut, stderr: ignoredErr, ...record }) => record),
      sourceHashes, counts, syntaxFiles: files,
      stdout: `${stem}.stdout.txt`, stdoutSha256: sha(stdout),
      stderr: `${stem}.stderr.txt`, stderrSha256: sha(stderr),
      observations: current === 'browser' ? `${stem}-observations.json` : null
    }, null, 2)}\n`, { flag: 'wx' });
    console.log(`Captured ${current}: evidence\\${stem}.json (earlier records preserved).`);
  }
  console.log(`${current}: ${passed ? 'PASS' : 'FAIL'}${current === 'syntax' ? ` (${files.length} executable files)` : ''}`);
  const counts = stdout.split(/\r?\n/).filter((line) => /^# (tests|pass|fail|skipped|cancelled) /.test(line));
  if (counts.length) console.log(counts.join('\n'));
  if (!passed) {
    console.error(stdout);
    if (stderr) console.error(stderr);
    for (const result of results) if (result.error) console.error(result.error);
    failed = true;
    break;
  }
}
if (!capture) {
  assert.deepEqual(snapshot(), before, 'Ordinary verification must not add, delete, or rewrite historical proof.');
  console.log('Historical evidence byte hashes unchanged (read-only verification).');
}
process.exitCode = failed ? 1 : 0;
