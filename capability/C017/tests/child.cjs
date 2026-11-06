'use strict';

// Test tooling, not production code: spawns the REAL cli.cjs with the child-preload (ledger snapshot, optional heap sampler)
// and an exact-PID kill; it never kills by name. NO DEADLINE decides pass or fail here (F25 of the third independent review): the child's
// listening line, its exit after "stop" and after a kill are awaited as events, so a healthy child on a saturated machine is never reported as
// hung, and a child that really never comes up or never stops is cut by the node:test timeout of the test that started it, which is the only clock.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./http.cjs');

const preload = path.join(__dirname, 'fixtures', 'child-preload.cjs');
const cli = path.join(__dirname, '..', 'cli.cjs');

// `launch` is injectable so that the lifecycle waits are proved with a fake child that is slower than any deadline the helper could have (child-lifecycle.test.cjs).
function startChild(t, { args = [], nodeFlags = [], env = {}, launch = spawn } = {}) {
  const clean = { ...process.env, ...env };
  delete clean.NODE_TEST_CONTEXT;
  delete clean.NODE_V8_COVERAGE;
  const child = launch(process.execPath, [...nodeFlags, '--require', preload, cli, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: clean, windowsHide: true });
  const errors = [];
  const lines = [];
  let buffer = '';
  let announce;
  const listening = new Promise((resolve) => { announce = resolve; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop();
    for (const line of parts) {
      try {
        const event = JSON.parse(line);
        lines.push(event);
        if (event.event === 'C017-local-listening') announce(event);
      } catch { /* not an event line */ }
    }
  });
  child.stderr.on('data', (part) => errors.push(String(part)));
  child.stdin.on('error', () => {});
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  return {
    child, lines, exited, errors: () => errors.join(''),
    origin: async () => (await Promise.race([listening, exited.then(() => { throw new Error(`the child exited early: ${errors.join('')}`); })])).origin,
    stop: () => { child.stdin.write('stop\n'); return exited; },
    kill: () => { child.kill(); return exited; },
  };
}

// Polls until the predicate holds. Without a signal only the runner's timeout ends the wait; with the test's own signal (t.signal, aborted when the
// test times out or is cancelled) the wait ends with the named message instead of an anonymous timeout.
async function pollState(origin, predicate, message, { signal } = {}) {
  for (;;) {
    const state = (await h.get(origin, '/api/state')).json;
    if (predicate(state)) return state;
    if (signal && signal.aborted) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// The child rewrites its sample file every 100 ms: a reader waits until the file parses (a half-written or momentarily missing file is
// retried). With a signal it waits until the test is aborted; without one it gives up with a clear error after `ms` (L-0137).
async function readMem(file, { ms = 5000, signal } = {}) {
  const end = Date.now() + ms;
  let last = 'no file yet';
  for (;;) {
    try {
      const sample = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Number.isFinite(sample.heapUsed) && Number.isFinite(sample.rss)) return sample;
      last = 'not a heap sample';
    } catch (error) {
      last = error.code || error.message;
    }
    if (signal ? signal.aborted : Date.now() > end) throw new Error(`the child never produced a parseable heap sample${signal ? '' : ` within ${ms} ms`} (${last})`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

module.exports = Object.freeze({ startChild, pollState, readMem });
