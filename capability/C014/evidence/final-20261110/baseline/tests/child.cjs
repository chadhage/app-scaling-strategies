'use strict';

// Test tooling, not production code: starts child-server.cjs (or the attacker) in its own process with a small heap and a cleaned environment, waits for its
// first message, and ends it by the handle it was started with (never by name). NODE_V8_COVERAGE gets an own, empty value: spawn would re-inject the caller's
// directory into a copy of process.env that merely lacks the key (L-0140).
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH = path.join(__dirname, 'scratch');

function launch(file, { env = {}, heapMb = 64, startupMs = 30000 } = {}) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const cleaned = { ...process.env, ...env, NODE_V8_COVERAGE: '' };
  delete cleaned.NODE_TEST_CONTEXT;
  const child = fork(file, [], { env: cleaned, execArgv: [`--max-old-space-size=${heapMb}`], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], cwd: SCRATCH, windowsHide: true });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));
  const waiting = new Map();
  let counter = 0;
  const messages = [];
  child.on('message', (message) => {
    if (message.type === 'answer' && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); } else messages.push(message);
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  // the channel closes after the last message was delivered: only then is "the child is gone" a fact about the answers it owes
  const gone = Promise.all([exited, new Promise((resolve) => child.once('disconnect', resolve))]);
  const first = (type) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action, value) => { if (!settled) { settled = true; clearTimeout(timer); action(value); } };
    const timer = setTimeout(() => finish(reject, new Error(`no ${type} message from the child within ${startupMs} ms`)), startupMs);
    const take = () => {
      const found = messages.findIndex((message) => message.type === type);
      if (found < 0) return false;
      finish(resolve, messages.splice(found, 1)[0]);
      return true;
    };
    const look = () => { if (!settled && !take()) setTimeout(look, 20); };
    // an answer that arrived just before the child ended is still an answer: the queue is read once more when the channel is closed
    gone.then(() => { if (!settled && !take()) finish(reject, new Error('the child exited before it answered')); });
    look();
  });
  const ask = (op, extra = {}) => new Promise((resolve, reject) => {
    counter += 1;
    waiting.set(counter, (message) => (message.error ? reject(new Error(message.error)) : resolve(message.result)));
    child.send({ op, id: counter, ...extra }, (error) => { if (error) reject(error); });
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send({ op: 'close', id: -1 }, () => {});
      const timer = setTimeout(() => child.kill(), 5000);
      await exited;
      clearTimeout(timer);
    }
  };
  return { child, pid: child.pid, ask, first, stop, output: () => Buffer.concat(output).toString('utf8'), exited };
}

// A server in another process, with the surface runSweep() and the matrix expect: port, service.plant / issueToken (over IPC), consoleText, close.
async function startChild({ mode = 'real', limits, heapMb = 64 } = {}) {
  const env = { C014_CHILD_MODE: mode, ...(limits ? { C014_CHILD_LIMITS: JSON.stringify(limits) } : {}) };
  const handle = launch(path.join(__dirname, 'child-server.cjs'), { env, heapMb });
  try {
    const { port } = await handle.first('listening');
    return {
      port, pid: handle.pid, stats: () => handle.ask('stats'), consoleText: handle.output, close: handle.stop,
      service: { plant: (place, value) => handle.ask('plant', { place, value }), issueToken: (identity, options) => handle.ask('issueToken', { identity, options }) }
    };
  } catch (error) {
    await handle.stop();
    throw new Error(`${error.message}; child output: ${handle.output().slice(0, 400)}`);
  }
}

// The attacker is a separate process too: it shares no event loop with the server under test. `targets` is a list of { key, port, sockets, shape, ... }. With a
// `beforeRelease` callback the attacker is held at the point where every socket has written its last byte, the callback runs (it polls a fact, for example how much a
// control server has read), and only then are the held sockets released.
async function runAttacker(targets, { beforeRelease } = {}) {
  const handle = launch(path.join(__dirname, 'flood-attacker.cjs'), { env: { C014_ATTACK: JSON.stringify(targets) }, heapMb: 128, startupMs: 90000 });
  try {
    if (beforeRelease) {
      await handle.first('written');
      await beforeRelease();
      handle.child.send({ type: 'release' });
    }
    const report = await handle.first('report');
    return report.sockets;
  } catch (error) {
    throw new Error(`${error.message}; attacker output: ${handle.output().replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+/g, '<HOME>').slice(0, 600)}`);
  } finally { await handle.stop(); }
}

module.exports = Object.freeze({ launch, startChild, runAttacker, SCRATCH });
