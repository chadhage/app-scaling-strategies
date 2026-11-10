'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const catalog = require('../accepted-catalog.js');
const actual = require('../serve.cjs');
const file = path.resolve(__dirname, '..', 'serve.cjs');
const source = fs.readFileSync(file, 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function loaded({ args = [], main = false, platform = 'win32', listenError = false, closeError = false, fileSystem = fs } = {}) {
  const process = { platform, argv: ['node', 'serve.cjs', ...args], pid: 1, exitCode: 0, signals: new Map(),
    once(name, callback) { this.signals.set(name, callback); } };
  const output = { log: [], error: [], ended: [], closed: 0, timers: [] };
  const server = new EventEmitter();
  server.listen = (port, address, resolve) => {
    assert.equal(address, '127.0.0.1');
    assert.ok(Number.isInteger(port));
    if (listenError) queueMicrotask(() => server.emit('error', new Error('injected listen refusal')));
    else queueMicrotask(resolve);
  };
  server.address = () => ({ address: '127.0.0.1', port: 12345 });
  server.close = callback => queueMicrotask(() => callback(closeError ? new Error('injected close refusal') : undefined));
  server.closeAllConnections = () => { output.closed++; };
  const realRequire = Module.createRequire(file);
  const module = { exports: {} };
  const require = name => name === 'node:http' ? { createServer: callback => {
    output.request = callback;
    return server;
  } } : name === 'node:fs' ? fileSystem : realRequire(name);
  require.main = main ? module : {};
  const context = vm.createContext({
    Buffer, process, queueMicrotask,
    console: { log: value => output.log.push(value), error: value => output.error.push(value) },
    setTimeout(callback) { output.timers.push(callback); return { unref() {} }; },
    clearTimeout() {}
  });
  const wrapper = vm.compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'],
    { filename: pathToFileURL(file).href, parsingContext: context });
  wrapper(module.exports, require, module, file, path.dirname(file));
  return { api: module.exports, process, output, server };
}

test('whole unchanged host file exercises its CLI usage and argument branches without fixed listeners', async () => {
  for (const args of [['--port'], ['bad', '1'], ['--port', 'not-a-number']]) {
    const run = loaded({ args, main: true });
    await tick();
    assert.equal(run.process.exitCode, 1);
    assert.match(run.output.error.join(), /^Usage:/);
    assert.equal(run.output.log.length, 0);
  }
  for (const args of [[], ['--port', '0']]) {
    const run = loaded({ args, main: true });
    await tick();
    assert.equal(run.process.exitCode, 0);
    assert.equal(JSON.parse(run.output.log[0]).event, 'listening');
    assert.deepEqual([...run.process.signals.keys()], ['SIGINT', 'SIGTERM']);
    run.server.emit('clientError', new Error('bad input'), { end: text => run.output.ended.push(text) });
    assert.deepEqual(run.output.ended, ['HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n']);
    run.process.signals.get('SIGINT')();
    await tick();
    run.process.signals.get('SIGTERM')();
    await tick();
    assert.equal(run.output.closed, 1);
  }
});

test('CLI reports real startup refusals, and lifetime and signal paths retain close failures', async () => {
  for (const options of [{ args: ['--port', '65536'] }, { listenError: true }]) {
    const run = loaded({ ...options, main: true });
    await tick();
    assert.equal(run.process.exitCode, 1);
    assert.match(run.output.error.join(), /C041 helper refused startup/);
  }
  for (const route of ['lifetime', 'signal']) {
    const run = loaded({ main: true, closeError: true });
    await tick();
    if (route === 'lifetime') run.output.timers[0]();
    else run.process.signals.get('SIGTERM')();
    await tick();
    assert.equal(run.process.exitCode, 1, route);
    assert.equal(run.output.closed, 1, route);
  }
});

test('the owned-file guard refuses redirected and non-regular assets before listening', async () => {
  for (const mode of ['redirect', 'directory']) {
    const fileSystem = { ...fs,
      realpathSync: name => mode === 'redirect' ? `${name}.redirected` : fs.realpathSync(name),
      statSync: name => mode === 'directory' ? { isFile: () => false } : fs.statSync(name)
    };
    const run = loaded({ fileSystem });
    await assert.rejects(run.api.startHost(), /Asset must be an owned regular file/);
    assert.equal(run.output.request, undefined);
  }
  const run = loaded({ platform: 'linux' });
  const host = await run.api.startHost({ ttlMs: 1000 });
  assert.equal(host.server, run.server);
  await host.close();
  assert.equal(run.output.closed, 1);
});

test('catalog guards retain the old shape and validate new explicit hash metadata', async () => {
  const clone = () => structuredClone(catalog);
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.gate.id = 'C002'; },
    value => { value.gate.frontend = 'other'; },
    value => { delete value.gate; },
    value => { delete value.source; },
    value => { value.lessons = []; },
    value => { value.lessons = null; },
    value => { value.lessons[0].assets[0].rawSha256 = '0'.repeat(64); },
    value => { value.lessons[0].assets[0].crlfToLfSha256 = 'not-a-pin'; },
    value => { value.lessons[0].assets.push(value.lessons[0].assets[0]); },
    value => { value.lessons[0].assets = value.lessons[0].assets.filter(asset => asset.file !== 'index.html'); },
    value => { delete value.lessons[0].acceptance; },
    value => { value.lessons[0].acceptance.commit = ''; },
    value => { value.lessons[0].acceptance.acceptedAtUtc = ''; },
    value => { value.lessons[0].assets = []; },
    value => { delete value.lessons[0].acceptance.review; }
  ]) {
    const changed = clone(); mutate(changed);
    assert.throws(() => actual.validateCatalog(changed));
  }
  const legacy = clone();
  for (const lesson of legacy.lessons) for (const asset of lesson.assets) {
    delete asset.rawSha256; delete asset.crlfToLfSha256;
  }
  assert.equal(actual.validateCatalog(legacy), true, 'raw-only legacy schema remains supported');
  for (const options of [{ ttlMs: '1000' }, { port: NaN }]) {
    await assert.rejects(actual.startHost(options), RangeError);
  }
});

test('unnamed and file-named legacy integrity refusals remain typed errors', () => {
  assert.throws(() => actual.verifyAsset({}, Buffer.from('edited')), /\(unnamed asset\)/);
  assert.throws(() => actual.verifyAsset({ file: 'control.js' }, Buffer.from('edited')), /control\.js/);
});

test('catalog browser-global branch loads the actual full source and preserves immutable API shape', () => {
  const catalogFile = path.resolve(__dirname, '..', 'accepted-catalog.js');
  const context = vm.createContext({});
  new vm.Script(fs.readFileSync(catalogFile, 'utf8'), { filename: pathToFileURL(catalogFile).href }).runInContext(context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.C041AcceptedCatalog)), catalog);
  assert.equal(Object.isFrozen(context.C041AcceptedCatalog.lessons[0].assets[0]), true);
  assert.equal(Object.getOwnPropertyDescriptor(context, 'C041AcceptedCatalog').writable, false);
});
