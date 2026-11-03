'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const lesson = path.resolve(__dirname, '..');
const repository = path.resolve(lesson, '..', '..');
const evidence = path.join(lesson, 'evidence');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function inventory(directory, filter = () => true, canonicalText = false) {
  if (!fs.existsSync(directory)) return {};
  const entries = {};
  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, item.name);
      if (!filter(target, item)) continue;
      if (item.isDirectory()) walk(target);
      else {
        const bytes = fs.readFileSync(target);
        entries[path.relative(lesson, target)] = hash(canonicalText
          ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes);
      }
    }
  }
  walk(directory);
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}
function proofInventory() {
  const proof = inventory(evidence);
  for (const name of ['evidence.json', 'result.json']) {
    const target = path.join(lesson, name);
    if (fs.existsSync(target)) proof[name] = hash(fs.readFileSync(target));
  }
  return proof;
}
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
function recordSourcesAndRedSnapshots() {
  const directory = path.join(evidence, 'red');
  fs.mkdirSync(directory, { recursive: true });
  for (const [source, snapshot] of [
    ['existing-form.feature', 'bdd.feature.snapshot.txt'],
    ['antiforgery.js', 'antiforgery.stub.snapshot.txt'],
    [path.join('tests', 'model.test.cjs'), 'model.assertions.snapshot.txt']
  ]) {
    fs.writeFileSync(path.join(directory, snapshot), fs.readFileSync(path.join(lesson, source)), { flag: 'wx' });
  }
  const sourceFiles = ['README.md', path.join('.docs', 'wiki', 'backlog.md'), path.join('.docs', 'wiki', 'kanban.md')];
  const sources = sourceFiles.map((relative) => {
    const bytes = fs.readFileSync(path.join(repository, relative));
    return { path: relative, sha256: hash(bytes), text: bytes.toString('utf8') };
  });
  const sourceRow = (source, prefix) => source.text.split(/\r?\n/).find((line) => line.startsWith(prefix));
  const kanban = sources[2].text;
  writeJson(path.join(evidence, 'source-contract.json'), {
    cardId: 'A-S036', workerId: 'worker-A-S036', kano: 'S', kanoUnit: 'A-S036', packet: 'SC-S036',
    capturedAtUtc: new Date().toISOString(),
    files: sources.map(({ text, ...source }) => source),
    source: sourceRow(sources[0], '| S036 |'),
    backlog: sourceRow(sources[1], '| D-S036 |'),
    card: sourceRow(sources[2], '| A-S036 |'),
    nativeRemainder: sourceRow(sources[2], '| B-S036 |'),
    atomicAndPortableContract: kanban.slice(kanban.indexOf('## Atomic card contract'), kanban.indexOf('## Concurrent pull')),
    packetBasis: 'SC-S036 groups A-S036 and B-S036 as declared by the admitted inventory; no delighter credit.',
    authorization: 'local-synthetic-only'
  });
}

const stage = process.argv[2] || 'all';
const stages = stage === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [stage];
const allowed = ['red', 'green', 'syntax', 'browser', 'integrity'];
const before = proofInventory();
let failed = false;
try {
  assert.equal(process.version, 'v22.23.4', 'Only existing Node22 test tooling is claimed.');
  assert.ok(stages.every((entry) => allowed.includes(entry)), 'Use all, red, green, syntax, browser or integrity.');
  if (capture) fs.mkdirSync(evidence, { recursive: true });
  if (capture && stage === 'red') recordSourcesAndRedSnapshots();
  for (const current of stages) {
    const startedAtUtc = new Date().toISOString();
    const sourceFilter = (target) => target !== evidence
      && !['evidence.json', 'result.json'].includes(path.basename(target));
    const rawWorkingTreeSourceHashes = inventory(lesson, sourceFilter);
    const sourceHashes = inventory(lesson, sourceFilter, true);
    const args = ['--test', '--test-reporter=tap', path.join(__dirname,
      `${current === 'red' || current === 'green' ? 'model' : current}.test.cjs`)];
    const result = spawnSync(process.execPath, args, {
      cwd: repository, encoding: null, windowsHide: true, env: process.env
    });
    const stdout = result.stdout || Buffer.alloc(0);
    const stderr = result.stderr || Buffer.alloc(0);
    const passed = result.status === 0 && !result.error;
    if (capture) {
      let number = 1;
      while (fs.existsSync(path.join(evidence, `${current}-${String(number).padStart(3, '0')}.json`))) number += 1;
      const stem = `${current}-${String(number).padStart(3, '0')}`;
      const stdoutFile = `${stem}.stdout.tap.txt`;
      const stderrFile = `${stem}.stderr.txt`;
      fs.writeFileSync(path.join(evidence, stdoutFile), stdout, { flag: 'wx' });
      fs.writeFileSync(path.join(evidence, stderrFile), stderr, { flag: 'wx' });
      const base = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', windowsHide: true });
      writeJson(path.join(evidence, `${stem}.json`), {
        cardId: 'A-S036', workerId: 'worker-A-S036', kanoUnit: 'A-S036', packet: 'SC-S036',
        stage: current, node: process.version, command: [process.execPath, ...args],
        startedAtUtc, finishedAtUtc: new Date().toISOString(),
        workingTreeBaseCommit: base.status === 0 ? base.stdout.trim() : null,
        exitCode: result.status, signal: result.signal, error: result.error?.message || null,
        passed, captureWasExplicit: true, sourceHashPolicy: 'utf8-lf-canonical-v1',
        sourceHashes, rawWorkingTreeSourceHashes,
        stdout: stdoutFile, stdoutBytes: stdout.length, stdoutSha256: hash(stdout),
        stderr: stderrFile, stderrBytes: stderr.length, stderrSha256: hash(stderr)
      });
      console.log(`Captured ${current}: evidence\\${stem}.json (append-only).`);
    }
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    if (result.error) console.error(result.error.message);
    if (!passed) {
      failed = true;
      break;
    }
  }
} finally {
  if (!capture) {
    assert.deepEqual(proofInventory(), before, 'Ordinary verification must preserve every proof file and byte.');
    console.log('Historical evidence inventory and byte hashes unchanged.');
  }
}
process.exitCode = failed ? 1 : 0;
