'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { guardOperation } = require('../C001/contract-guard.js');
const { createApp, scope } = require('./server.cjs');

const LEDGER = path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json');
const NAMES = Object.freeze(['visitor', 'conductor-a', 'conductor-b', 'operator']);
// The browser helper allows a caller-owned listener at most 15 minutes, so the fixture closes itself well before that.
const DEFAULT_LIFETIME_MS = 600000;
const MAX_LIFETIME_MS = 900000;

function readCurrentApproval(readText = () => fs.readFileSync(LEDGER, 'utf8')) {
  try {
    return JSON.parse(readText()).approvals?.C001;
  } catch {
    throw new Error('C001 current consent is unavailable; the local listener was not started.');
  }
}

// Rechecks the current C001 local-only consent first and fails closed (no listener) on anything but an exact match.
// Binds 127.0.0.1 on an automatic port only; tokens are synthetic, in-memory and valid only until the listener closes.
async function startLocal({ readApproval = readCurrentApproval, lifetimeMs = DEFAULT_LIFETIME_MS, now, randomBytes } = {}) {
  if (!Number.isInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > MAX_LIFETIME_MS) throw new RangeError('The listener lifetime is out of range.');
  const permission = await guardOperation('local.probe', readApproval());
  if (!permission.allowed) throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  const app = createApp({ now, randomBytes });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const tokens = Object.fromEntries(NAMES.map((name) => [name, app.issueToken(name, { ttlMs: lifetimeMs })]));
  const closed = new Promise((resolve) => app.server.once('close', resolve));
  const close = () => {
    clearTimeout(timer);
    app.close();
    return closed;
  };
  const timer = setTimeout(close, lifetimeMs);
  return { app, server: app.server, origin: `http://127.0.0.1:${app.server.address().port}`, tokens, lifetimeMs, close, closed };
}

// The command line: no arguments at all, so there is nothing to override. Streams and signals are injectable for tests.
async function main(argv, { log = console.log, error = console.error, onSignal = (name, handler) => process.once(name, handler) } = {}, options = {}) {
  if (argv.length !== 2) {
    error('C009 accepts no host, port, identity, role, token, lifetime or permission overrides.');
    return { code: 1 };
  }
  try {
    const local = await startLocal(options);
    log(JSON.stringify({ event: 'C009-local-listening', pid: process.pid, origin: local.origin, lifetimeMs: local.lifetimeMs, scope, tokens: local.tokens }));
    onSignal('SIGINT', local.close);
    onSignal('SIGTERM', local.close);
    return { code: 0, local };
  } catch (failure) {
    error(failure.message);
    return { code: 1 };
  }
}

if (require.main === module) {
  main(process.argv).then((result) => { process.exitCode = result.code; });
}

module.exports = Object.freeze({ main, startLocal, readCurrentApproval });
