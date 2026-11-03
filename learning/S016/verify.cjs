'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const directory = __dirname;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidence = path.join(directory, 'evidence');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshot = () => {
  const names = fs.readdirSync(evidence).map((name) => path.join('evidence', name));
  for (const name of ['evidence.json', 'result.json']) if (fs.existsSync(path.join(directory, name))) names.push(name);
  return Object.fromEntries(names.sort().map((name) => [name, sha(fs.readFileSync(path.join(directory, name)))]));
};
const before = snapshot();
const stage = process.argv[2] || 'all';
const stages = stage === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [stage];
assert.equal(process.version, 'v22.23.4', 'Only the approved installed Node22 test-tooling lane is claimed');
assert.ok(stages.every((entry) => ['green', 'syntax', 'browser', 'integrity'].includes(entry)),
  'Use all, green, syntax, browser, or integrity');
let failed = false;

for (const current of stages) {
  const startedAtUtc = new Date().toISOString();
  const files = current === 'syntax'
    ? fs.readdirSync(directory).filter((name) => /\.(?:js|cjs)$/.test(name)).sort() : [];
  const invocations = current === 'syntax' ? files.map((name) => ['--check', path.join(directory, name)])
    : [['--test', '--test-reporter=tap', path.join(directory, `${current === 'green' ? 'model' : current}.test.cjs`)]];
  const results = invocations.map((args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: path.resolve(directory, '..', '..'), encoding: 'utf8',
      timeout: current === 'browser' ? 240000 : 60000,
      env: process.env, windowsHide: true
    });
    return {
      command: [process.execPath, ...args], exitCode: result.status,
      error: result.error?.message || null, output: `${result.stdout || ''}${result.stderr || ''}`
    };
  });
  const output = results.map((entry) => current === 'syntax'
    ? `${entry.command.join(' ')}\nexit ${entry.exitCode}${entry.error ? `: ${entry.error}` : ''}\n${entry.output}`
    : entry.output).join('\n');
  const passed = results.every((entry) => entry.exitCode === 0 && !entry.error);
  if (capture) {
    let number = 1;
    while (fs.existsSync(path.join(evidence, `${current}-${number}.json`))
      || fs.existsSync(path.join(evidence, `${current}-${number}.tap.txt`))) number += 1;
    const stem = `${current}-${number}`;
    fs.writeFileSync(path.join(evidence, `${stem}.tap.txt`), output, { flag: 'wx' });
    const sourceHashes = Object.fromEntries(fs.readdirSync(directory)
      .filter((name) => fs.statSync(path.join(directory, name)).isFile() && !['evidence.json', 'result.json'].includes(name))
      .map((name) => [name, sha(fs.readFileSync(path.join(directory, name)))]));
    fs.writeFileSync(path.join(evidence, `${stem}.json`), `${JSON.stringify({
      cardId: 'A-S016', kanoUnit: 'A-S016', stage: current, node: process.version,
      startedAtUtc, finishedAtUtc: new Date().toISOString(), passed,
      commands: results.map(({ output: ignored, ...record }) => record),
      sourceHashes, rawLog: `${stem}.tap.txt`, rawLogSha256: sha(output),
      captureWasExplicit: true, syntaxFiles: files
    }, null, 2)}\n`, { flag: 'wx' });
    console.log(`Captured ${current}: evidence\\${stem}.json (earlier records preserved).`);
  }
  console.log(`${current}: ${passed ? 'PASS' : 'FAIL'}${current === 'syntax' ? ` (${files.length} executable files)` : ''}`);
  const counts = output.split(/\r?\n/).filter((line) => /^# (tests|pass|fail|skipped|cancelled) /.test(line));
  if (counts.length) console.log(counts.join('\n'));
  if (!passed) {
    console.error(output);
    for (const result of results) if (result.error) console.error(result.error);
    failed = true;
    break;
  }
}
if (!capture) {
  assert.deepEqual(snapshot(), before, 'Ordinary verification must not delete, add, or rewrite committed proof');
  console.log('Historical evidence byte hashes unchanged (read-only verification).');
}
process.exitCode = failed ? 1 : 0;
