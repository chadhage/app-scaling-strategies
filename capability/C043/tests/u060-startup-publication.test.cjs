'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const original = process.argv.includes('--original');
const retained = path.join(__dirname, '..', 'evidence', 'u060-review', 'superseded', 'tests');
const source = (name) => fs.readFileSync(original ? path.join(retained, `${name}.txt`) : path.join(__dirname, name), 'utf8');

function filesystem() {
  const files = new Map();
  const incomplete = [];
  const finalName = (file) => /(?:root\.start|worker-\d+\.(?:ready|start))\.json$/.test(file);
  const observe = () => {
    for (const [file, bytes] of files) if (finalName(file) && bytes.length === 0) incomplete.push(file);
  };
  const fail = (code) => { throw Object.assign(new Error(`fixture ${code}`), { code }); };
  const io = {
    mkdirSync() {}, rmdirSync() {},
    existsSync: (file) => files.has(file),
    readdirSync: (directory) => [...files.keys()].filter((file) => path.dirname(file) === directory).map((file) => path.basename(file)),
    readFileSync(file, encoding) {
      if (!files.has(file)) return fail('ENOENT');
      const bytes = files.get(file);
      return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
    },
    writeFileSync(file, value, options) {
      if (options?.flag === 'wx' && files.has(file)) return fail('EEXIST');
      files.set(file, Buffer.alloc(0));
      observe();
      files.set(file, Buffer.from(value));
    },
    linkSync(from, to) {
      if (files.has(to)) return fail('EEXIST');
      files.set(to, Buffer.from(files.get(from)));
      observe();
    },
    unlinkSync: (file) => { files.delete(file); },
  };
  return { io, files, incomplete };
}

function factsModule(io) {
  const module = { exports: {} };
  const code = fs.readFileSync(path.join(__dirname, 'u060-startup-facts.cjs'), 'utf8');
  const fakeRequire = (name) => name === 'node:fs' ? io : require(name);
  vm.compileFunction(code, ['require', 'module', '__dirname'])(fakeRequire, module, __dirname);
  return module.exports;
}

function childReady() {
  const state = filesystem();
  const directory = path.join(__dirname, 'scratch', 'fixture-publication-child');
  const token = 'fixture-child-token';
  state.files.set(path.join(directory, 'worker-202.start.json'), Buffer.from(JSON.stringify({ pid: 202, token, identityRecorded: true })));
  const fakeProcess = { pid: 202, ppid: 201, env: { C043_U060_PARENT_PID: '200', NODE_TEST_CONTEXT: 'child-v8',
    C043_U060_GATE_DIRECTORY: directory, C043_U060_START_TOKEN: token }, hrtime: { bigint: () => 0n } };
  const fakeRequire = (name) => name === 'node:fs' ? state.io
    : name === './u060-startup-facts.cjs' ? factsModule(state.io) : require(name);
  vm.compileFunction(source('u060-child-gate.preload.cjs'), ['require', 'process', '__dirname', 'module'])(
    fakeRequire, fakeProcess, __dirname, { exports: {} });
  return state;
}

async function parentFacts() {
  const state = filesystem();
  let child;
  const timers = [];
  const fakeProcess = { pid: 200, env: {}, execPath: 'fixture-node' };
  const lifecycle = {
    createOwnedAdapters: () => ({}),
    snapshotOwned: async (pid) => ({ snapshot: { entries: [{ pid, ppid: 200, createdAt: '1' }] }, unverifiable: [] }),
  };
  const tree = {
    refreshTree: async (snapshot) => ({ ...snapshot, entries: [...snapshot.entries, { pid: 202, ppid: 201, createdAt: '2' }] }),
    terminateOwned: async () => ({ terminated: [], alreadyGone: [], survivors: [], refused: [], errors: [] }),
  };
  const fakeRequire = (name) => {
    if (name === 'node:fs') return state.io;
    if (name.endsWith('/owned.cjs')) return lifecycle;
    if (name.endsWith('/tree.cjs')) return tree;
    if (name === './u060-startup-facts.cjs') return factsModule(state.io);
    return require(name);
  };
  const module = { exports: {} };
  vm.compileFunction(source('u060-mutation-runner.cjs'), ['require', 'process', '__dirname', 'module'])(fakeRequire, fakeProcess, __dirname, module);
  const runner = module.exports.createRunner({
    spawn(file, args, settings) {
      child = new EventEmitter(); child.pid = 201;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdout.destroy = () => {}; child.stderr.destroy = () => {};
      const directory = settings.env.C043_U060_GATE_DIRECTORY;
      state.files.set(path.join(directory, 'worker-202.ready.json'),
        Buffer.from(JSON.stringify({ pid: 202, ppid: 201, token: settings.env.C043_U060_START_TOKEN })));
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
    setTimeout: (callback) => { const timer = { callback }; timers.push(timer); return timer; },
    clearTimeout() {}, progress() {},
  });
  const pending = runner.runNode(['fixture.cjs'], {}, 1000);
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
  const observed = [...state.files.keys()];
  child.emit('exit', 0, null); child.emit('close', 0, null);
  const outcome = await pending;
  assert.equal(outcome.cleanup.clean, true);
  return { ...state, observed };
}

for (const name of ['root.start.json', 'worker-202.start.json']) {
  test(`U060 startup publication keeps ${name} invisible until complete identity bytes exist`, async () => {
    const state = await parentFacts();
    assert.ok(state.observed.some((file) => path.basename(file) === name), 'the actual publisher was exercised');
    assert.equal(state.incomplete.some((file) => path.basename(file) === name), false, 'final startup identity fact must not expose incomplete bytes');
  });
}
test('U060 startup publication keeps worker-ready invisible until complete identity bytes exist', () => {
  const state = childReady();
  assert.ok([...state.files.keys()].some((file) => file.endsWith('worker-202.ready.json')));
  assert.equal(state.incomplete.length, 0, 'final readiness fact must not expose incomplete bytes');
});
test('U060 startup file-level assertion is undecided, never a named mutation kill', () => {
  const code = source('u060-mutation-runner.cjs');
  const module = { exports: {} };
  vm.compileFunction(code, ['require', 'module', '__dirname'])(require, module, __dirname);
  const outcome = { code: 1, signal: null, error: null, timedOut: false, streamsClosed: true, cleanup: { clean: true },
    output: 'U060_MUTANT_APPLIED server.cjs\nnot ok 1 - tests\\server.test.cjs\n  code: ERR_ASSERTION\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n' };
  assert.equal(module.exports.judge(outcome, '').decided, false, 'a file-level failure is not a named behavioral assertion');
});
