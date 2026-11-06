'use strict';

// Test tooling, not production code: the servers the matrix and the flood tests run against. A target is { port, tokens, close }: a server in THIS
// process (fake clock, every identity plus an expired token) or in a CHILD process with a small heap and a hard external watchdog (real clock).
// The configs name what a refusal row needs: default, quota (a share of three), timeout (a 300 ms header timeout), closed (the role table lacks
// lease.read: deny by default), ids (the id generator fails for scratches).
const { fork } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { IDENTITIES, load, startApp } = require('./helpers.cjs');

const CONFIGS = Object.freeze({
  default: { limits: { ownerEntries: 5000 } },
  quota: { limits: { ownerEntries: 3 } },
  timeout: { limits: { ownerEntries: 5000, headerMs: 300, checkMs: 50 } },
  closed: { limits: { ownerEntries: 5000 }, dropRoute: 'lease.read' },
  ids: { limits: { ownerEntries: 5000 }, failScratchIds: true }
});

function appOptions(name) {
  const config = CONFIGS[name];
  const options = { limits: { ...config.limits } };
  if (config.dropRoute) {
    const table = { ...load('contract.js').roleTable };
    delete table[config.dropRoute];
    options.roleTable = table;
  }
  if (config.failScratchIds) options.newId = (kind) => (kind === 'scratch' ? 'bad' : `${kind}-${randomBytes(8).toString('hex')}`);
  return options;
}

async function startTarget(name) {
  const context = await startApp({ app: appOptions(name) });
  const tokens = Object.fromEntries(IDENTITIES.map((identity) => [identity, context.app.issueToken(identity)]));
  tokens.expired = context.app.issueToken('conductor-b', { ttlMs: 1 });
  context.clock.advance(5);
  return { port: context.port, tokens, app: context.app, close: () => context.close() };
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

module.exports = Object.freeze({ CONFIGS, appOptions, startChildTarget, startTarget });
