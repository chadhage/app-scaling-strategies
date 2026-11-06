'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { spawn } = require('node:child_process');
const { loadImplementation } = require('./support/impl.cjs');

const { createWindowsAdapters } = loadImplementation().windows;
const EPOCH_GAP_MS = 11644473600000n;
const filetimeToMs = (createdAt) => Number(BigInt(createdAt) / 10000n - EPOCH_GAP_MS);

test('the real process table holds this process with its real creation time and parent', { timeout: 180000 }, async () => {
  const adapters = createWindowsAdapters();
  const rows = await adapters.list({ timeoutMs: 120000 });
  const me = rows.find((row) => row.pid === process.pid);
  assert.ok(me, 'this process is listed');
  assert.equal(me.ppid, process.ppid);
  assert.ok(Math.abs(filetimeToMs(me.createdAt) - (Date.now() - process.uptime() * 1000)) < 10000, 'creation time is the real start');
  assert.ok(rows.length > 10);
  for (const row of rows) {
    assert.ok(Number.isSafeInteger(row.pid) && row.pid > 0);
    assert.ok(row.createdAt === null || /^\d+$/.test(row.createdAt));
  }
});

test('the real kill verifies the identity on the handle it terminates and reports gone processes', { timeout: 300000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    const adapters = createWindowsAdapters();
    const row = (await adapters.list({ timeoutMs: 120000 })).find((candidate) => candidate.pid === child.pid);
    assert.ok(row && row.createdAt, 'the child is listed with a creation time');

    const wrong = String(BigInt(row.createdAt) + 10000000n);
    const [mismatch] = await adapters.kill([{ pid: child.pid, createdAt: wrong }], { timeoutMs: 120000 });
    assert.equal(mismatch.outcome, 'mismatch');
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null, 'a pid with another creation time is never terminated');

    const [killed] = await adapters.kill([{ pid: child.pid, createdAt: row.createdAt }], { timeoutMs: 120000 });
    assert.equal(killed.outcome, 'killed');
    await exited;
    const [again, missing] = await adapters.kill([{ pid: child.pid, createdAt: row.createdAt }, { pid: 2147483640, createdAt: '1' }], { timeoutMs: 120000 });
    assert.equal(again.outcome, 'gone');
    assert.equal(missing.outcome, 'gone');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});

test('the real helper is ended at its deadline and the call returns promptly with a timeout', { timeout: 60000 }, async () => {
  const adapters = createWindowsAdapters();
  const started = Date.now();
  await assert.rejects(adapters.list({ timeoutMs: 1 }), { code: 'ERR_TIMEOUT' });
  assert.ok(Date.now() - started < 15000);
});

// libuv puts a non-detached child in a kill-on-close job of its parent, so ending the parent also ends the child.
// The child may be mid-exit when its own kill arrives (TerminateProcess then fails with access denied): that is gone, never an error.
test('a child that dies with its parent while the batch runs is reported killed or gone, never as an error', { timeout: 300000 }, async () => {
  const parentSource = "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });"
    + " console.log(c.pid); setInterval(() => {}, 1000);";
  const parent = spawn(process.execPath, ['-e', parentSource], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const exited = new Promise((resolve) => parent.once('exit', resolve));
  let childPid = 0;
  try {
    childPid = await new Promise((resolve, reject) => {
      parent.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim())));
      parent.once('error', reject);
    });
    const adapters = createWindowsAdapters();
    const rows = await adapters.list({ timeoutMs: 120000 });
    const identities = [parent.pid, childPid].map((pid) => ({ pid, createdAt: rows.find((row) => row.pid === pid).createdAt }));
    const outcomes = await adapters.kill(identities, { timeoutMs: 120000 });
    assert.equal(outcomes[0].outcome, 'killed');
    assert.ok(['killed', 'gone'].includes(outcomes[1].outcome), `child outcome was ${outcomes[1].outcome}`);
    await exited;
    const after = await adapters.list({ timeoutMs: 120000 });
    assert.ok(!after.some((row) => row.pid === childPid && row.createdAt === identities[1].createdAt), 'the child is gone');
  } finally {
    if (parent.exitCode === null && parent.signalCode === null) parent.kill();
  }
});
