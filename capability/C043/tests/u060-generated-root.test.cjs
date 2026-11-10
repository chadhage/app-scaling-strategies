'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { turns } = require('./u060-finite-transport.cjs');

async function finite(work) {
  let settled = false;
  let value;
  let failure;
  Promise.resolve(work).then((answer) => { settled = true; value = answer; }, (error) => { settled = true; failure = error; });
  await turns();
  assert.equal(settled, true, 'the operation must settle after its finite injected collaborators complete');
  if (failure) throw failure;
  return value;
}

function rootFixture(context) {
  const calls = [];
  const options = { allowed: true };
  const readLedger = () => JSON.stringify({ approvals: { C001: { fixture: 'synthetic-current-approval' } } });
  const ledger = path.resolve(__dirname, '..', '..', '..', '.docs', 'wiki', 'flow-state.json');
  const readFile = fs.readFileSync;
  context.mock.method(fs, 'readFileSync', function fixtureLedger(file, ...args) {
    if (typeof file === 'string' && path.resolve(file) === ledger) {
      const encoding = typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
      return encoding ? readLedger() : Buffer.from(readLedger());
    }
    return readFile.call(this, file, ...args);
  });
  const engine = { inspect: (key) => ({ key }), halt: () => calls.push(['engine.halt']) };
  const runner = { halt: () => calls.push(['runner.halt']) };
  const replace = (relative, additions) => {
    const filename = require.resolve(relative);
    const original = require(filename);
    require.cache[filename].exports = { ...original, ...additions };
    context.after(() => { require.cache[filename].exports = original; });
  };
  replace('../../C001/contract-guard.js', {
    guardOperation: async (operation, approval) => { calls.push(['guard', operation, approval]); return { allowed: options.allowed, reasons: [{ code: 'FIXTURE_DENIED' }] }; },
  });
  replace('../../C042/journal.cjs', {
    createMemoryIo: () => { const io = { kind: 'memory' }; calls.push(['memory', io]); return io; },
    createFileIo: (directory) => { const io = { kind: 'file', directory }; calls.push(['file', directory, io]); return io; },
  });
  replace('../../C042/engine.cjs', {
    openEngine: async (configuration) => { calls.push(['openEngine', configuration]); return engine; },
    delayExecutor: (ms) => { const executor = () => {}; calls.push(['delayExecutor', ms, executor]); return executor; },
  });
  replace('../runner.cjs', {
    openRunner: async (configuration) => { calls.push(['openRunner', configuration]); return runner; },
  });
  context.mock.method(http, 'createServer', (configuration, handler) => {
    const server = new EventEmitter();
    Object.assign(server, {
      handler, address: () => ({ port: 43210 }),
      listen: (port, host, done) => {
        calls.push(['listen', port, host]);
        assert.equal(server.listenerCount('error'), 1, 'the listener failure must have a rejection owner before bind begins');
        if (options.listenError) server.emit('error', options.listenError);
        else done();
      },
      close: (done) => { calls.push(['close']); done(); },
      closeAllConnections: () => calls.push(['closeAllConnections']),
    });
    calls.push(['createServer', configuration]);
    return server;
  });
  const filename = require.resolve('../server.cjs');
  const prior = require.cache[filename];
  delete require.cache[filename];
  const api = require(filename);
  context.after(() => { if (prior) require.cache[filename] = prior; else delete require.cache[filename]; });
  for (const name of ['createLocalServer', 'closeServer', 'composeService', 'startLocal', 'runCli', 'parseArguments']) {
    assert.equal(typeof api[name], 'function', `the actual ${name} API remains exported`);
  }
  return { api, calls, options, engine, runner, readLedger, filename };
}

test('U060 finite composition facts retain both journals, monotonic clock, step inspection and the zero-delay boundary', async (context) => {
  const f = rootFixture(context);
  await turns();
  assert.equal(f.calls.length, 0, 'requiring the library cannot start its CLI or read consent');
  for (const settleMs of [0, 1]) {
    f.calls.length = 0;
    const stepIo = { fixture: 'step journal' };
    const runIo = { fixture: 'run journal' };
    const clock = () => 73;
    assert.deepEqual(await finite(f.api.composeService({ stepIo, runIo, settleMs, clock })), { engine: f.engine, runner: f.runner });
    const engine = f.calls.find(([name]) => name === 'openEngine')[1];
    const run = f.calls.find(([name]) => name === 'openRunner')[1];
    assert.equal(engine.io, stepIo);
    assert.equal(run.io, runIo);
    assert.equal(run.engine, f.engine);
    assert.equal(run.clock, clock);
    assert.deepEqual(run.verify('synthetic-step-key'), { key: 'synthetic-step-key' });
    const delay = f.calls.find(([name]) => name === 'delayExecutor');
    assert.equal(Boolean(delay), settleMs > 0, 'zero delay must not install a delayed executor');
    assert.equal(engine.executor, delay?.[2]);
    if (delay) assert.equal(delay[1], settleMs);
  }
});

test('U060 finite start facts require consent and a valid data name before any listener or journal operation', async (context) => {
  const f = rootFixture(context);
  const invalidLedger = [() => '{not json', () => { throw new Error('injected read refusal'); }];
  for (const readLedger of invalidLedger) await assert.rejects(f.api.startLocal({ readLedger }), /current consent is unavailable/);
  assert.deepEqual(f.calls, []);
  f.options.allowed = false;
  await assert.rejects(f.api.startLocal({ readLedger: f.readLedger }), /local consent denied: FIXTURE_DENIED/);
  assert.deepEqual(f.calls.map(([name]) => name), ['guard']);
  f.options.allowed = true;
  for (const dataName of ['nul', 'bad/name', 'trailing.', 'x'.repeat(33)]) {
    const before = f.calls.length;
    await assert.rejects(f.api.startLocal({ readLedger: f.readLedger, dataName }), /data name must be/);
    assert.deepEqual(f.calls.slice(before).map(([name]) => name), ['guard']);
  }
  f.calls.length = 0;
  const server = await finite(f.api.startLocal({ readLedger: f.readLedger }));
  assert.equal(server.runner, f.runner); assert.equal(server.engine, f.engine);
  assert.deepEqual(f.calls[0], ['guard', 'local.probe', { fixture: 'synthetic-current-approval' }]);
  assert.equal(f.calls.filter(([name]) => name === 'memory').length, 2);
  assert.equal(f.calls.filter(([name]) => name === 'file').length, 0);
  assert.deepEqual(f.calls.at(-1), ['listen', 0, '127.0.0.1']);
  f.calls.length = 0;
  await finite(f.api.startLocal({ readLedger: f.readLedger, dataName: 'synthetic-store' }));
  const files = f.calls.filter(([name]) => name === 'file');
  assert.equal(files.length, 2);
  assert.equal(files[0][1].endsWith(path.join('data', 'synthetic-store', 'steps')), true);
  assert.equal(files[1][1].endsWith(path.join('data', 'synthetic-store', 'runs')), true);
  const explicit = { stepIo: { fixture: 'explicit step' }, runIo: { fixture: 'explicit run' } };
  f.calls.length = 0;
  await finite(f.api.startLocal({ readLedger: f.readLedger, dataName: 'synthetic-store', io: explicit, settleMs: 1 }));
  assert.equal(f.calls.some(([name]) => name === 'memory' || name === 'file'), false);
  assert.equal(f.calls.find(([name]) => name === 'openEngine')[1].io, explicit.stepIo);
  assert.equal(f.calls.find(([name]) => name === 'openRunner')[1].io, explicit.runIo);
});

test('U060 finite CLI facts reject overrides, accept inclusive delay bounds, report storage and register exact shutdown', async (context) => {
  const f = rootFixture(context);
  assert.deepEqual(f.api.parseArguments([]), { dataName: null, settleMs: 0 });
  assert.deepEqual(f.api.parseArguments(['--data-dir=synthetic-store', '--settle-ms=0']), { dataName: 'synthetic-store', settleMs: 0 });
  assert.deepEqual(f.api.parseArguments(['--settle-ms=60000']), { dataName: null, settleMs: 60000 });
  for (const args of [['--settle-ms=60001'], ['--settle-ms=-1'], ['--data-dir=a', '--data-dir=b'], ['--host=127.0.0.1'], ['--port=0'], ['--data-dir=']]) {
    assert.equal(f.api.parseArguments(args), null, JSON.stringify(args));
  }
  for (const args of [[], ['--data-dir=synthetic-store']]) {
    const logs = [];
    const errors = [];
    let signal;
    const code = await f.api.runCli(args, {
      start: async (received) => {
        assert.deepEqual(received, { dataName: args.length ? 'synthetic-store' : null, settleMs: 0 });
        return f.api.createLocalServer({ engine: f.engine, runner: f.runner });
      },
      log: (line) => logs.push(JSON.parse(line)), error: (line) => errors.push(line), onSignal: (handler) => { signal = handler; },
    });
    assert.equal(code, 0);
    assert.deepEqual(errors, []);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, 'C043-local-listening');
    assert.equal(logs[0].origin, 'http://127.0.0.1:43210');
    assert.equal(logs[0].journal, args.length ? 'capability/C043/data/synthetic-store' : 'memory (not persisted)');
    assert.equal(logs[0].scope.productionRuntimeValidated, false);
    assert.equal(typeof signal, 'function');
    await finite(signal());
    assert.deepEqual(f.calls.slice(-4), [['runner.halt'], ['engine.halt'], ['close'], ['closeAllConnections']]);
  }
  let started = 0;
  const errors = [];
  assert.equal(await f.api.runCli(['--port=0'], { start: async () => { started += 1; }, error: (line) => errors.push(line) }), 1);
  assert.equal(started, 0);
  assert.match(errors[0], /accepts only/);
  assert.equal(await f.api.runCli([], { start: async () => { throw new Error('injected refused startup'); }, error: (line) => errors.push(line) }), 1);
  assert.equal(errors.at(-1), 'injected refused startup');
});

test('U060 finite actual CLI-entry facts invoke the parser and propagate its nonzero exit without opening a socket', async (context) => {
  const f = rootFixture(context);
  const originalMain = process.mainModule;
  const originalArgv = process.argv;
  const originalExit = process.exitCode;
  const errors = [];
  context.mock.method(console, 'error', (line) => errors.push(line));
  const main = new Module(f.filename);
  main.filename = f.filename;
  main.paths = Module._nodeModulePaths(path.dirname(f.filename));
  try {
    process.mainModule = main;
    process.argv = [process.execPath, f.filename, '--port=0'];
    process.exitCode = undefined;
    main.load(f.filename);
    await turns();
    assert.equal(process.exitCode, 1, 'the real entry propagates the refused CLI invocation');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /accepts only/);
    assert.equal(f.calls.length, 0, 'invalid entry arguments cannot start consent, storage or transport work');
  } finally {
    process.mainModule = originalMain;
    process.argv = originalArgv;
    process.exitCode = originalExit;
  }
});

test('U060 finite default signal wiring registers both exact shutdown callbacks without installing real handlers', async (context) => {
  const f = rootFixture(context);
  const signals = [];
  const once = process.once;
  context.mock.method(process, 'once', function record(event, handler) {
    if (event === 'SIGINT' || event === 'SIGTERM') { signals.push([event, handler]); return this; }
    return once.call(this, event, handler);
  });
  const server = f.api.createLocalServer({ engine: f.engine, runner: f.runner });
  assert.equal(await f.api.runCli([], { start: async () => server, log() {}, error: (message) => assert.fail(message) }), 0);
  assert.deepEqual(signals.map(([event]) => event), ['SIGINT', 'SIGTERM']);
  assert.equal(signals[0][1], signals[1][1]);
  await finite(signals[0][1]());
  assert.deepEqual(f.calls.slice(-4), [['runner.halt'], ['engine.halt'], ['close'], ['closeAllConnections']]);
});

test('U060 finite bind-error facts reject through the listener owner instead of an unhandled transport error', async (context) => {
  const f = rootFixture(context);
  const failure = new Error('injected bind refusal');
  f.options.listenError = failure;
  await assert.rejects(finite(f.api.startLocal({ readLedger: f.readLedger })), (error) => error === failure);
  assert.deepEqual(f.calls.at(-1), ['listen', 0, '127.0.0.1']);
});
