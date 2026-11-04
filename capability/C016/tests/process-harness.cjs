'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, fork } = require('node:child_process');
const { createHash } = require('node:crypto');
const { newScratch: createC015Scratch } = require('..\\..\\C015\\tests\\scratch.cjs');

const worker = path.join(__dirname, 'worker.cjs');
const runId = 'synthetic-run-001';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function newScratch() {
  const scratch = createC015Scratch();
  if (fs.existsSync(scratch.location.root)) throw new Error('Generated UUID already exists; do not read, mutate or clean it.');
  const base = fs.lstatSync(scratch.location.base);
  if (!base.isDirectory() || base.isSymbolicLink()) throw new Error('Existing accepted C015 test category required; never create or clean a shared category root.');
  return scratch;
}

function observation(result, args) {
  if (result.error) throw result.error;
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout;
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
  const last = (result.status === 0 ? stdout : stderr).trim().split(/\r?\n/).at(-1);
  return { args, exitCode: result.status, stdout, stderr, value: last ? JSON.parse(last) : null };
}

function fresh(scratch, action, expectedEpoch, variant, id = runId) {
  const args = [action, scratch.namespace, id];
  if (expectedEpoch !== undefined) args.push(String(expectedEpoch));
  if (variant !== undefined) args.push(variant);
  const result = spawnSync(process.execPath, [worker, ...args], {
    timeout: 180000, maxBuffer: 256 * 1024, windowsHide: true,
  });
  scratch.trackChild(id);
  if (action === 'mutate-input') scratch.trackChild('synthetic-run-002');
  return observation(result, args);
}

async function duplicates(scratch) {
  const args = ['apply', scratch.namespace, runId, '0'];
  const children = [];
  const ready = [];
  const ended = [];
  for (let index = 0; index < 2; index++) {
    const child = fork(worker, ['concurrent', ...args], { silent: true, windowsHide: true });
    children.push(child);
    ready.push(new Promise((resolve, reject) => {
      child.once('message', (value) => value.ready ? resolve() : reject(new Error('Worker not ready.')));
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Worker exited before release.')));
    }));
    ended.push(new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const deadline = setTimeout(() => { child.kill(); reject(new Error('Owned worker timed out.')); }, 180000);
      child.stdout.on('data', (bytes) => { stdout += bytes; });
      child.stderr.on('data', (bytes) => { stderr += bytes; });
      child.once('error', reject);
      child.once('close', (status) => {
        clearTimeout(deadline);
        try { resolve(observation({ status, stdout, stderr }, args)); } catch (error) { reject(error); }
      });
    }));
  }
  try {
    await Promise.all(ready);
    for (const child of children) child.send('go');
    return await Promise.all(ended);
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    await Promise.allSettled(ended);
    scratch.trackChild(runId);
  }
}

function bytes(scratch, id = runId) {
  const result = {};
  for (const suffix of ['001', '002', '003']) {
    const file = scratch.target(path.join(id, `epoch-${suffix}.json`));
    if (fs.existsSync(file)) result[suffix] = sha(fs.readFileSync(file));
  }
  return result;
}

module.exports = Object.freeze({ newScratch, fresh, duplicates, bytes, runId, sha });
