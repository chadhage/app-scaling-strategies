'use strict';

// Test tooling, not production code: the servers the matrix and the flood tests run against. A target is { port, tokens, failIds, close }: a server in THIS
// process (fake clock, every identity plus an expired token) or in a CHILD process with a small heap and a hard external watchdog (real clock).
// The configs name what a refusal row needs: default (room for every cell), bounds (small caps so that each of the five bounds is one request away),
// timeout (a 300 ms header timeout), closed (the role table lacks `allowance`: deny by default), ids (the id generator fails when the test says so).
const { fork } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { IDENTITIES, fakeClock, load } = require('./helpers.cjs');

const BIG = Object.freeze({
  pool: { units: 1000, spend: 100000 }, caps: { 'conductor-a': { units: 1000, spend: 100000 }, 'conductor-b': { units: 1000, spend: 100000 } }, maxActive: 100, entries: 200
});
const BOUNDS = Object.freeze({
  pool: { units: 8, spend: 40 }, caps: { 'conductor-a': { units: 6, spend: 24 }, 'conductor-b': { units: 6, spend: 24 } }, maxActive: 3, entries: 10
});
const CONFIGS = Object.freeze({
  default: { config: BIG }, bounds: { config: BOUNDS }, timeout: { config: { ...BIG, limits: { headerMs: 300, checkMs: 50 } } },
  closed: { config: BIG, dropRoute: 'allowance' }, ids: { config: BIG }, cap: { config: { ...BIG, limits: { connections: 128 } } },
  replay: { config: { ...BIG, maxActive: 2, entries: 3, keyEntries: 3 } }
});

function appOptions(name) {
  const entry = CONFIGS[name];
  const control = { failIds: false };
  const options = { config: entry.config, newId: () => (control.failIds ? 'bad' : `rsv-${randomBytes(8).toString('hex')}`) };
  if (entry.dropRoute) {
    const table = { ...load('contract.js').roleTable };
    delete table[entry.dropRoute];
    options.roleTable = table;
  }
  return { options, control };
}

async function startTarget(name) {
  const { createApp } = load('server.cjs');
  const clock = fakeClock();
  const { options, control } = appOptions(name);
  const app = createApp({ now: () => clock.now(), ...options });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const tokens = Object.fromEntries(IDENTITIES.map((identity) => [identity, app.issueToken(identity, { ttlMs: 900000 })]));
  tokens.expired = app.issueToken('conductor-b', { ttlMs: 1 });
  clock.advance(5);
  return { port: app.server.address().port, tokens, app, failIds: async (on) => { control.failIds = on; }, close: () => app.close() };
}

// A server in a child process: a small heap, a watchdog that kills it (by its own handle) when a test hangs, and an IPC channel for probes.
async function startChildTarget(name, { mode = 'service', heapMb = 48, watchdogMs = 120000 } = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = fork(path.join(__dirname, 'child-server.cjs'), [name, mode], { execArgv: [`--max-old-space-size=${heapMb}`, '--expose-gc'], env, silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const watchdog = setTimeout(() => child.kill(), watchdogMs);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const waiting = new Map();
  child.on('message', (message) => { waiting.get(message.type)?.(message); waiting.delete(message.type); });
  const next = (type) => new Promise((resolve) => waiting.set(type, resolve));
  const early = exited.then((result) => { throw new Error(`the child exited early: ${JSON.stringify(result)} ${Buffer.concat(errors)}`); });
  const listening = await Promise.race([next('listening'), early]);
  return {
    port: listening.port, tokens: listening.tokens, exited, errors: () => Buffer.concat(errors).toString('utf8'),
    stats: (reset = false) => { const reply = next('stats'); child.send({ type: 'stats', reset }); return reply; },
    release: () => { const reply = next('released'); child.send({ type: 'release' }); return reply; },
    failIds: (on) => { const reply = next('failed'); child.send({ type: 'failIds', on }); return reply; },
    async close() {
      const reply = next('closed');
      child.send({ type: 'stop' });
      await Promise.race([reply, exited]);
      clearTimeout(watchdog);
      child.kill();
      await exited;
    },
    // A test that fails must still end its child: kill by the handle this module holds.
    dispose() { clearTimeout(watchdog); child.kill(); }
  };
}

module.exports = Object.freeze({ BIG, BOUNDS, CONFIGS, appOptions, startChildTarget, startTarget });
