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
const snapshot = () => Object.fromEntries(fs.readdirSync(evidence)
  .filter((name) => fs.statSync(path.join(evidence, name)).isFile())
  .map((name) => [name, sha(fs.readFileSync(path.join(evidence, name)))]));
const before = snapshot();
const stage = process.argv[2] || 'all';
const stages = stage === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [stage];
const allowed = ['green', 'syntax', 'browser', 'integrity'];
assert.match(process.version, /^v22\./, 'Only the approved Node22 test-tooling lane is claimed');
assert.ok(stages.every((entry) => allowed.includes(entry)), 'Use all, green, syntax, browser, or integrity');
let failed = false;

for (const current of stages) {
  const startedAtUtc = new Date().toISOString();
  const files = current === 'syntax'
    ? fs.readdirSync(directory).filter((name) => /\.(?:js|cjs)$/.test(name)).sort() : [];
  const commands = current === 'syntax' ? files.map((name) => ['--check', path.join(directory, name)])
    : ['--test', '--test-reporter=tap', path.join(directory, `${current === 'green' ? 'model' : current}.test.cjs`)];
  const invocations = current === 'syntax' ? commands : [commands];
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
    while (fs.existsSync(path.join(evidence, `${current}-${number}.json`))) number += 1;
    const stem = `${current}-${number}`;
    fs.writeFileSync(path.join(evidence, `${stem}.tap.txt`), output);
    const sourceHashes = Object.fromEntries(fs.readdirSync(directory)
      .filter((name) => fs.statSync(path.join(directory, name)).isFile() && name !== 'evidence.json')
      .map((name) => [name, sha(fs.readFileSync(path.join(directory, name)))]));
    fs.writeFileSync(path.join(evidence, `${stem}.json`), `${JSON.stringify({
      cardId: 'A-S012', kanoUnit: 'A-S012', stage: current, node: process.version,
      startedAtUtc, finishedAtUtc: new Date().toISOString(), passed,
      commands: results.map(({ output: ignored, ...record }) => record),
      sourceHashes, rawLog: `${stem}.tap.txt`, rawLogSha256: sha(output),
      captureWasExplicit: true, syntaxFiles: files
    }, null, 2)}\n`);
    console.log(`Captured ${current}: evidence\\${stem}.json (earlier records preserved).`);
  }
  const counts = output.split(/\r?\n/).filter((line) => /^# (tests|pass|fail|skipped|cancelled) /.test(line));
  console.log(`${current}: ${passed ? 'PASS' : 'FAIL'}${current === 'syntax' ? ` (${files.length} executable files)` : ''}`);
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
