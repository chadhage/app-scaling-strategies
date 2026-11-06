'use strict';

// Test tooling, not production code: spawns the REAL cli.cjs with the child-preload (ledger snapshot, optional heap sampler),
// a hard external deadline for every wait, and an exact-PID kill; it never kills by name.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const h = require('./http.cjs');

const preload = path.join(__dirname, 'fixtures', 'child-preload.cjs');
const cli = path.join(__dirname, '..', 'cli.cjs');

function startChild(t, { args = [], nodeFlags = [], env = {} } = {}) {
  const clean = { ...process.env, ...env };
  delete clean.NODE_TEST_CONTEXT;
  delete clean.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [...nodeFlags, '--require', preload, cli, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: clean, windowsHide: true });
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
    origin: async () => (await s.withTimeout(Promise.race([listening, exited.then(() => { throw new Error(`the child exited early: ${errors.join('')}`); })]), 'the child never listened', 20000)).origin,
    stop: () => { child.stdin.write('stop\n'); return s.withTimeout(exited, 'the child did not stop within the bound', 8000); },
    kill: () => { child.kill(); return s.withTimeout(exited, 'the killed child did not exit', 8000); },
  };
}

async function pollState(origin, predicate, message, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const state = (await h.get(origin, '/api/state')).json;
    if (predicate(state)) return state;
    if (Date.now() > end) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function readMem(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

module.exports = Object.freeze({ startChild, pollState, readMem });
