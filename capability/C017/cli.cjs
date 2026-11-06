'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { guardOperation } = require('../C001/contract-guard.js');
const { createEngine } = require('./engine.cjs');
const { createLocalServer, listen, closeOwned, scope } = require('./server.cjs');

const here = path.resolve(__dirname);
const ranges = Object.freeze({
  '--steps': ['steps', 1, 8], '--units': ['units', 1, 1000], '--step-delay-ms': ['stepDelayMs', 0, 60000],
  '--hold-before-step': ['holdBeforeStep', 1, 8], '--hold-in-step': ['holdInStep', 1, 8], '--ttl-ms': ['ttlMs', 1000, 3600000],
});
const defaults = Object.freeze({ dir: path.join(here, 'state'), steps: 4, units: 5, stepDelayMs: 1500, holdBeforeStep: 0, holdInStep: 0, ttlMs: 600000 });

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { ...defaults };
  for (const arg of argv) {
    const match = /^(--[a-z-]+)=(.+)$/.exec(arg);
    if (!match) throw new UsageError('C017 accepts only --name=value options and no host, port, identity or outcome overrides.');
    const [, name, value] = match;
    if (name === '--dir') {
      const dir = path.resolve(value);
      if (dir !== here && !dir.startsWith(here + path.sep)) throw new UsageError('The journal directory must be inside capability\\C017.');
      options.dir = dir;
    } else if (Object.hasOwn(ranges, name)) {
      const [key, min, max] = ranges[name];
      const number = Number(value);
      if (!/^\d+$/.test(value) || number < min || number > max) throw new UsageError(`${name} must be an integer from ${min} to ${max}.`);
      options[key] = number;
    } else throw new UsageError(`Unknown option ${name.slice(0, 40)}.`);
  }
  return options;
}

function readApproval() {
  try {
    const file = path.join(here, '..', '..', '.docs', 'wiki', 'flow-state.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).approvals?.C001;
  } catch {
    throw new Error('C001 current consent is unavailable; the local listener was not started.');
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (!ms) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    return undefined;
  });
}

// Rehearsal gates: the default pace waits stepDelayMs before every step; a held gate never opens, so a rehearsed crash is deterministic.
function makeGates(options) {
  const never = () => new Promise(() => {});
  return {
    beforeStep: (step, { signal }) => (step === options.holdBeforeStep ? never() : sleep(options.stepDelayMs, signal)),
    inStep: (step) => (step === options.holdInStep ? never() : undefined),
    inCompensation: (step, { signal }) => sleep(options.stepDelayMs, signal),
  };
}

async function main(argv, deps = {}) {
  const options = parseArgs(argv);
  const permission = await (deps.guard || guardOperation)('local.probe', (deps.readApproval || readApproval)());
  if (!permission.allowed) throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  const engine = createEngine({ dir: options.dir, steps: options.steps, unitsPerStep: options.units, gates: makeGates(options) });
  const server = await listen(createLocalServer({ engine }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => { await engine.close(); await closeOwned(server); };
  (deps.log || console.log)(JSON.stringify({ event: 'C017-local-listening', pid: process.pid, origin, dir: options.dir, steps: options.steps, scope }));
  return { server, engine, stop, options, origin };
}

// Wiring for a real terminal: the owned listener closes on Ctrl+C, SIGTERM, the exact stdin word "stop", or the TTL.
async function runCli(argv, host = process, deps = {}) {
  const started = await main(argv, deps);
  let closing = false;
  const ttl = setTimeout(() => stop(), started.options.ttlMs);
  async function stop() {
    if (closing) return;
    closing = true;
    clearTimeout(ttl);
    host.removeListener('SIGINT', stop);
    host.removeListener('SIGTERM', stop);
    host.stdin.destroy();
    await started.stop();
    (deps.log || console.log)(JSON.stringify({ event: 'C017-local-closed', pid: process.pid, listening: started.server.listening }));
  }
  let input = '';
  host.stdin.setEncoding('utf8');
  host.stdin.on('data', (chunk) => {
    input += chunk;
    if (input.includes('\n') || input.length > 64) {
      if (input.trim() !== 'stop') host.exitCode = 1;
      stop().catch(() => { host.exitCode = 1; });
    }
  });
  host.once('SIGINT', stop);
  host.once('SIGTERM', stop);
  return { ...started, stopAll: stop };
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ UsageError, parseArgs, readApproval, makeGates, main, runCli, defaults });
