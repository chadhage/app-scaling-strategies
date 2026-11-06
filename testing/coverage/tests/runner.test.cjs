'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { killTree, runProcess } = require('../runner.cjs');
const { makeScratch, dispose } = require('./support.cjs');

const sleeper = 'setInterval(() => {}, 1000)';
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function waitUntilDead(pid, limitMs = 10000) {
  const until = Date.now() + limitMs;
  while (alive(pid) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  return !alive(pid);
}

test('killTree uses taskkill with the child pid and /T on Windows, never an image name', () => {
  const calls = [];
  killTree(4242, { platform: 'win32', run: (...call) => calls.push(call) });
  assert.deepEqual(calls, [['taskkill', ['/PID', '4242', '/T', '/F'], { windowsHide: true, stdio: 'ignore' }]]);
});

test('killTree signals the process group elsewhere and falls back to the pid when there is no group', () => {
  const signals = [];
  killTree(77, { platform: 'linux', signal: (...call) => signals.push(call) });
  assert.deepEqual(signals, [[-77, 'SIGKILL']]);
  const fallback = [];
  killTree(78, {
    platform: 'linux',
    signal: (pid, name) => {
      fallback.push([pid, name]);
      if (pid < 0) throw new Error('ESRCH');
    }
  });
  assert.deepEqual(fallback, [[-78, 'SIGKILL'], [78, 'SIGKILL']]);
});

test('runProcess captures the exit status and both output streams', async () => {
  const result = await runProcess({
    command: process.execPath, args: ['-e', "process.stdout.write('out');process.stderr.write('err');process.exit(3)"],
    cwd: process.cwd(), env: process.env, timeoutMs: 60000
  });
  assert.deepEqual([result.status, result.signal, result.stdout, result.stderr, result.timedOut, result.truncated, result.spawnError], [3, null, 'out', 'err', false, false, null]);
});

test('a command that cannot start resolves with the spawn error and never rejects', async () => {
  const missing = await runProcess({ command: path.join(process.cwd(), 'u009-no-such-executable'), args: [], cwd: process.cwd(), env: process.env, timeoutMs: 60000 });
  assert.equal(missing.status, null);
  assert.match(missing.spawnError, /ENOENT/);
  const thrown = await runProcess({
    command: 'x', args: [], cwd: '.', env: {}, timeoutMs: 1000,
    start: () => {
      throw new Error('boom');
    }
  });
  assert.equal(thrown.spawnError, 'boom');
});

test('output beyond the buffer limit is dropped and flagged instead of growing without bound', async () => {
  const result = await runProcess({
    command: process.execPath, args: ['-e', "process.stdout.write('x'.repeat(200000))"], cwd: process.cwd(), env: process.env, timeoutMs: 60000, maxBuffer: 1000
  });
  assert.equal(result.truncated, true);
  assert.ok(result.stdout.length <= 1000);
  assert.equal(result.status, 0);
});

test('a hung run is ended with the whole tree this call started and no other process is touched', { timeout: 60000 }, async () => {
  const scratch = makeScratch('runner');
  const bystander = spawn(process.execPath, ['-e', sleeper], { stdio: 'ignore', windowsHide: true });
  try {
    const pidFile = path.join(scratch, 'pids.json');
    const script = `const { spawn } = require('node:child_process');
      const grandchild = spawn(process.execPath, ['-e', '${sleeper}'], { stdio: 'ignore' });
      require('node:fs').writeFileSync(process.argv[1], JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
      ${sleeper};`;
    const result = await runProcess({ command: process.execPath, args: ['-e', script, pidFile], cwd: process.cwd(), env: process.env, timeoutMs: 8000 });
    assert.equal(result.timedOut, true);
    const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    assert.equal(await waitUntilDead(pids.child), true, 'the child is gone');
    assert.equal(await waitUntilDead(pids.grandchild), true, 'the grandchild below it is gone too');
    assert.equal(alive(bystander.pid), true, 'a process this call did not start is untouched');
  } finally {
    bystander.kill();
    dispose(scratch);
  }
});

test('a child that never closes after being killed is abandoned after the grace period', { timeout: 30000 }, async () => {
  const killed = [];
  const fake = new EventEmitter();
  fake.pid = 31337;
  fake.stdout = new EventEmitter();
  fake.stderr = new EventEmitter();
  let guard;
  const hung = new Promise((resolve) => {
    guard = setTimeout(() => resolve('hung'), 5000);
  });
  const outcome = await Promise.race([runProcess({
    command: 'x', args: [], cwd: '.', env: {}, timeoutMs: 20, graceMs: 20, start: () => fake, kill: (pid) => killed.push(pid)
  }), hung]);
  clearTimeout(guard);
  assert.notEqual(outcome, 'hung', 'runProcess must give up on a child that never closes once the grace period is over');
  assert.deepEqual(killed, [31337]);
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.status, null);
});

test('the child leads its own process group everywhere but on Windows', async () => {
  const seen = [];
  const start = (command, args, options) => {
    seen.push(options.detached);
    const fake = new EventEmitter();
    fake.stdout = new EventEmitter();
    fake.stderr = new EventEmitter();
    setImmediate(() => fake.emit('close', 0, null));
    return fake;
  };
  const posix = await runProcess({ command: 'x', args: [], cwd: '.', env: {}, timeoutMs: 1000, start, platform: 'linux' });
  const windows = await runProcess({ command: 'x', args: [], cwd: '.', env: {}, timeoutMs: 1000, start, platform: 'win32' });
  assert.deepEqual(seen, [true, false]);
  assert.deepEqual([posix.status, windows.status], [0, 0]);
});
