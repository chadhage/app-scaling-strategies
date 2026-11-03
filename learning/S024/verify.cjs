'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidence = path.join(__dirname, 'evidence');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function proofSnapshot() {
  const files = [];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else files.push(target);
    }
  }
  walk(evidence);
  for (const name of ['evidence.json', 'result.json']) {
    const target = path.join(__dirname, name);
    if (fs.existsSync(target)) files.push(target);
  }
  return Object.fromEntries(files.sort().map((file) => [
    path.relative(__dirname, file), sha(fs.readFileSync(file))
  ]));
}
const before = proofSnapshot();
const stage = process.argv[2] || 'all';
const stages = stage === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [stage];
const allowed = ['green', 'syntax', 'browser', 'integrity'];
let failed = false;
try {
  assert.equal(process.version, 'v22.23.4', 'Only the approved existing Node22 test-tooling lane is claimed.');
  assert.ok(stages.every((entry) => allowed.includes(entry)), 'Use all, green, syntax, browser or integrity.');
  for (const current of stages) {
    const startedAtUtc = new Date().toISOString();
    const sourceHashes = Object.fromEntries(fs.readdirSync(__dirname)
      .filter((name) => fs.statSync(path.join(__dirname, name)).isFile()
        && !['evidence.json', 'result.json'].includes(name))
      .sort().map((name) => [name, sha(fs.readFileSync(path.join(__dirname, name)))]));
    const syntaxFiles = current === 'syntax'
      ? Object.keys(sourceHashes).filter((name) => /\.(?:js|cjs)$/.test(name)) : [];
    const invocations = current === 'syntax'
      ? syntaxFiles.map((name) => ['--check', path.join(__dirname, name)])
      : [['--test', '--test-reporter=tap', path.join(__dirname, `${current === 'green' ? 'model' : current}.test.cjs`)]];
    const results = invocations.map((args) => {
      const result = spawnSync(process.execPath, args, {
        cwd: path.resolve(__dirname, '..', '..'), encoding: null, windowsHide: true,
        timeout: current === 'browser' ? 180000 : 60000, env: process.env
      });
      return {
        command: [process.execPath, ...args], exitCode: result.status,
        error: result.error?.message || null,
        stdout: result.stdout || Buffer.alloc(0), stderr: result.stderr || Buffer.alloc(0)
      };
    });
    const stdout = Buffer.concat(results.map((entry) => entry.stdout));
    const stderr = Buffer.concat(results.map((entry) => entry.stderr));
    const passed = results.every((entry) => entry.exitCode === 0 && !entry.error);
    if (capture) {
      fs.mkdirSync(evidence, { recursive: true });
      let number = 1;
      while (['json', 'stdout.tap.txt', 'stderr.txt'].some((extension) =>
        fs.existsSync(path.join(evidence, `${current}-${number}.${extension}`)))) number += 1;
      const stem = `${current}-${number}`;
      fs.writeFileSync(path.join(evidence, `${stem}.stdout.tap.txt`), stdout, { flag: 'wx' });
      fs.writeFileSync(path.join(evidence, `${stem}.stderr.txt`), stderr, { flag: 'wx' });
      fs.writeFileSync(path.join(evidence, `${stem}.json`), `${JSON.stringify({
        cardId: 'A-S024', workerId: 'worker-A-S024', kanoUnit: 'A-S024', packet: 'SC-S024',
        stage: current, node: process.version, startedAtUtc, finishedAtUtc: new Date().toISOString(), passed,
        captureWasExplicit: true, sourceHashes, syntaxFiles,
        commands: results.map(({ stdout: out, stderr: err, ...result }) => ({
          ...result, stdoutBytes: out.length, stderrBytes: err.length,
          stdoutSha256: sha(out), stderrSha256: sha(err)
        })),
        stdout: `${stem}.stdout.tap.txt`, stdoutSha256: sha(stdout),
        stderr: `${stem}.stderr.txt`, stderrSha256: sha(stderr)
      }, null, 2)}\n`, { flag: 'wx' });
      console.log(`Captured ${current}: evidence\\${stem}.json; earlier proof preserved.`);
    }
    console.log(`${current}: ${passed ? 'PASS' : 'FAIL'}${current === 'syntax' ? ` (${syntaxFiles.length} executable files)` : ''}`);
    const counts = stdout.toString().split(/\r?\n/).filter((line) => /^# (tests|pass|fail|skipped|cancelled) /.test(line));
    if (counts.length) console.log(counts.join('\n'));
    if (!passed) {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      for (const entry of results) if (entry.error) console.error(entry.error);
      failed = true;
      break;
    }
  }
} finally {
  if (!capture) {
    assert.deepEqual(proofSnapshot(), before, 'Ordinary verification must not add, remove or rewrite retained proof.');
    console.log('Historical evidence byte hashes unchanged (read-only verification).');
  }
}
process.exitCode = failed ? 1 : 0;
