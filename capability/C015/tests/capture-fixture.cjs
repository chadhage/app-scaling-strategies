'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { makeState } = require('..\\contract.cjs');
const { resolveNamespace, demoNamespace, assertSafePath } = require('..\\paths.cjs');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact CAPTURE_BROWSER_EVIDENCE=1 is required for unique deliberate raw capture.');
const [action, ...extra] = process.argv.slice(2);
if (extra.length || !['seed', 'inspect'].includes(action)) throw new Error('Use exactly seed or inspect; no path, ID or approval overrides.');

const location = resolveNamespace(demoNamespace);
if (action === 'seed' && fs.existsSync(location.root)) throw new Error('Seed refuses an existing fixture. Never reset or reinitialize retained state.');
const evidence = path.resolve(__dirname, '..', 'evidence');
if (fs.lstatSync(evidence).isSymbolicLink() || path.relative(evidence, fs.realpathSync(evidence)) !== '') throw new Error('Unsafe evidence directory.');
const captureId = `fixture-${randomUUID()}`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const processes = [];

function run(action, runId, epoch) {
  const args = [path.resolve(__dirname, '..', 'cli.cjs'), action, runId];
  if (epoch !== undefined) args.push(String(epoch));
  const result = spawnSync(process.execPath, args, { timeout: 90000, maxBuffer: 65536, windowsHide: true });
  const index = processes.length + 1;
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  const stdoutFile = `${captureId}-${index}.stdout.raw`;
  const stderrFile = `${captureId}-${index}.stderr.raw`;
  fs.writeFileSync(path.join(evidence, stdoutFile), stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(evidence, stderrFile), stderr, { flag: 'wx' });
  const value = result.status === 0 ? JSON.parse(stdout.toString('utf8')) : null;
  processes.push({
    action, runId, epoch: epoch === undefined ? null : epoch,
    exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
    stdout: { file: stdoutFile, bytes: stdout.length, sha256: sha(stdout) },
    stderr: { file: stderrFile, bytes: stderr.length, sha256: sha(stderr) }, value,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, stderr.toString('utf8'));
  return value;
}

let passed = false;
let failure = null;
let runs = [];
try {
  const writerPids = [];
  if (action === 'seed') {
    for (const [runId, count] of [['synthetic-run-001', 3], ['synthetic-run-002', 2]]) {
      for (let epoch = 1; epoch <= count; epoch++) {
        const writer = run('write', runId, epoch);
        assert.equal(writer.acknowledged, true);
        assert.equal(writer.regularFileFlushes, 2);
        assert.deepEqual(writer.state, makeState(runId, epoch));
        writerPids.push(writer.pid);
      }
    }
  }
  runs = ['synthetic-run-001', 'synthetic-run-002'].map((runId) => {
    const reader = run('read', runId);
    assert.equal(reader.restored, true);
    assert.equal(reader.writesPerformed, 0);
    assert.ok(!writerPids.includes(reader.pid), 'Reader must be a genuinely different process.');
    assert.deepEqual(reader.state, makeState(runId, reader.state.epoch));
    const writers = processes.filter((entry) => entry.action === 'write' && entry.runId === runId);
    if (writers.length) assert.deepEqual(reader.acknowledgment, writers.at(-1).value.acknowledgment);
    const files = reader.history.map((entry) => {
      const filename = `epoch-${String(entry.epoch).padStart(3, '0')}.json`;
      const target = path.join(location.root, runId, filename);
      assertSafePath(location, target, 'file');
      const bytes = fs.readFileSync(target);
      return { file: path.join('fixtures', demoNamespace, runId, filename), bytes: bytes.length, rawSha256: sha(bytes) };
    });
    return { runId, writerPids: writers.map((entry) => entry.value.pid), readerPid: reader.pid, result: reader, files };
  });
  passed = true;
} catch (error) {
  failure = String(error);
  process.exitCode = 1;
} finally {
  const report = {
    schemaVersion: 1, cardId: 'C015', workerId: 'worker-C015',
    captureId, action, capturedAtUtc: new Date().toISOString(),
    source: 'captured-actual-filesystem-fresh-process', nodeVersion: process.version,
    namespace: demoNamespace, passed, failure, processes, runs,
    browserExecution: false, cloudExecution: false, productionNode24Validated: false,
    cleanup: 'Published synthetic fixture and prior immutable epochs retained intentionally.',
    originalUnitCredits: 0,
  };
  const file = `${captureId}.raw.json`;
  fs.writeFileSync(path.join(evidence, file), JSON.stringify(report, null, 2).replace(/\n/g, '\r\n') + '\r\n', { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ file, passed, runs: runs.map((run) => ({ runId: run.runId, epoch: run.result.state.epoch, writerPids: run.writerPids, readerPid: run.readerPid, stateSha256: run.result.stateSha256 })) })}\n`);
}
