'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { record } = require('./journal.cjs');
const { environment, remaining } = require('./budget.cjs');
const { createOwnedAdapters } = require('../../../testing/browser/lifecycle/owned.cjs');
const { sha } = require('./integrity.cjs');
const output = process.env.C012_RESOURCE_OUTPUT;
assert.ok(output && path.isAbsolute(output), 'exclusive owned resource64 output required');
fs.mkdirSync(output, { recursive: false });
async function main() {
  remaining(600000);
  record([process.pid], 'resource64-controller-before-worker-births-and-heavy-work');
  const workers = [], completions = [], failures = [], events = [];
  let next = 1, active = 0, peak = 0, settled, refused, timer, error = null, forcedCleanup = null;
  const campaign = new Promise((resolve, reject) => { settled = resolve; refused = reject; });
  function event(value) {
    events.push(value); fs.appendFileSync(path.join(output, 'ipc.original.ndjson'), JSON.stringify(value) + '\n');
  }
  function assign(worker) {
    if (error || next > 64) return;
    remaining(60000);
    worker.current = next++;
    active++; peak = Math.max(peak, active);
    event({ kind: 'dispatch', worker: worker.index, pid: worker.child.pid, job: worker.current });
    worker.child.send({ kind: 'job', id: worker.current });
  }
  try {
    for (let index = 0; index < 8; index++) {
      const child = fork(path.join(__dirname, 'resource-child.cjs'), [], {
        cwd: path.resolve(__dirname, '..', '..', '..'), env: environment(),
        execArgv: ['--max-old-space-size=96'], silent: true, windowsHide: true
      });
      const worker = { child, index, current: null, identity: null, exited: false };
      worker.ready = new Promise(resolve => { worker.isReady = resolve; });
      worker.exit = new Promise(resolve => child.once('exit', (code, signal) => {
        worker.exited = true; worker.exitCode = code; worker.signal = signal; resolve({ code, signal });
        event({ kind: 'exit', worker: index, code, signal });
        if (active && !error) { error = new Error('Resource worker exited with active work'); refused(error); }
      }));
      child.stdout.on('data', bytes => fs.appendFileSync(path.join(output, 'worker-' + index + '.stdout.raw'), bytes));
      child.stderr.on('data', bytes => fs.appendFileSync(path.join(output, 'worker-' + index + '.stderr.raw'), bytes));
      child.on('error', cause => { error ||= cause; refused(error); });
      child.on('message', message => {
        try {
          event({ worker: index, ...message });
          if (message.kind === 'ready') { assert.equal(message.pid, child.pid); worker.isReady(); return; }
          assert.equal(message.job, worker.current, 'one exact currently dispatched job per worker');
          if (message.kind === 'failure') throw Object.assign(new Error(message.message), { code: message.code });
          assert.equal(message.kind, 'result');
          assert.equal(message.complete, true); assert.equal(message.checks, 298);
          assert.equal(message.producerTransitions, 15); assert.equal(message.clientOperations, 32);
          assert.equal(message.maxRenderedRows, 22); assert.equal(message.standaloneBurners, 0); assert.equal(message.nativeBrowsers, 0);
          completions.push(message); worker.current = null; active--;
          if (completions.length === 64) settled(); else assign(worker);
        } catch (cause) { error ||= cause; failures.push({ worker: index, message, error: { code: cause.code, message: cause.message } }); refused(error); }
      });
      workers.push(worker);
    }
    const births = record(workers.map(worker => worker.child.pid), 'resource8-worker-born-before-any-resource-group');
    for (const worker of workers) {
      const birth = births.find(row => row.pid === worker.child.pid);
      assert.ok(birth); worker.identity = { pid: birth.pid, createdAt: birth.createdAtFileTimeUtc };
    }
    await Promise.all(workers.map(worker => worker.ready));
    timer = setTimeout(() => { error = new Error('Resource64 external watchdog NONPASS'); refused(error); }, Math.min(remaining(60000), 600000));
    for (const worker of workers) assign(worker);
    await campaign;
    assert.equal(completions.length, 64); assert.equal(peak, 8); assert.equal(active, 0);
    assert.deepEqual(completions.map(row => row.job).sort((a, b) => a - b), Array.from({ length: 64 }, (_, index) => index + 1));
  } catch (cause) { error ||= cause; }
  finally {
    clearTimeout(timer);
    for (const worker of workers) if (worker.child.connected) worker.child.send({ kind: 'stop' });
    if (error && workers.some(worker => !worker.exited)) {
      const adapters = createOwnedAdapters();
      const identities = workers.filter(worker => !worker.exited && worker.identity).map(worker => worker.identity);
      if (identities.length) forcedCleanup = await adapters.kill(identities, { timeoutMs: 60000 });
    }
    await Promise.all(workers.map(worker => worker.exit));
    for (const worker of workers) if (worker.exitCode !== 0 || worker.signal) error ||= new Error('Resource child did not exit naturally and cleanly');
    const state = {
      schema: 'C012-exact-total64-complete-resource-groups-at8/1', exactTotal: 64, concurrency: 8,
      completed: completions.length, peak, failures, error: error ? { name: error.name, code: error.code || null, message: error.message } : null,
      zeroStandaloneBurners: true, nativeBrowsers: 0, not64RoundsTimesEight: true,
      workers: workers.map(worker => ({ pid: worker.child.pid, identity: worker.identity, exited: worker.exited, exitCode: worker.exitCode, signal: worker.signal })),
      forcedCleanup, allExited: workers.every(worker => worker.exited), groups: completions,
      ipcSha256: sha(fs.readFileSync(path.join(output, 'ipc.original.ndjson'))),
      pass: !error && !forcedCleanup && completions.length === 64 && peak === 8 && workers.every(worker => worker.exited)
    };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ completed: state.completed, concurrency: state.peak, allExited: state.allExited, pass: state.pass }));
    if (!state.pass) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
