'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const { readRegular } = require('..\\pins.cjs');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'captured.js'), 'utf8'), sandbox, { timeout: 1000 });
const captured = JSON.parse(JSON.stringify(sandbox.C036Captured));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
freeze(captured);
function loadOwnedReader(readCurrent) {
  const filename = path.join(root, 'attribution.js');
  const loaded = new Module(filename, module);
  const requireOriginal = Module.createRequire(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(root);
  loaded.require = (request) => request === './current.cjs' ? Object.freeze({ readCurrent }) : requireOriginal(request);
  loaded._compile(readRegular(path.join('capability', 'C036', 'attribution.js')).toString('utf8'), filename);
  return loaded.exports;
}
async function capturedGate() {
  return loadOwnedReader(async () => structuredClone(captured.context)).open();
}
async function freshFixtureOwner() {
  const { randomUUID } = require('node:crypto');
  const { persist, restore } = require('..\\..\\C015\\store.cjs');
  const { makeState } = require('..\\..\\C015\\contract.cjs');
  const { resolveNamespace, assertSafePath } = require('..\\..\\C015\\paths.cjs');
  const { requireCurrentConsent } = require('..\\..\\C015\\consent.cjs');
  const { hash, readGates } = require('..\\pins.cjs');
  const { readCurrent } = require('..\\current.cjs');
  const baseline = await readCurrent();
  const namespace = `test-${randomUUID()}`;
  const location = resolveNamespace(namespace);
  if (fs.existsSync(location.root)) throw new Error('Fresh test UUID must not exist.');
  const runId = 'synthetic-run-001';
  const tracked = new Map();
  const directories = new Set();
  let epoch = 0;
  let cleaned = false;
  function track() {
    for (const directory of [location.root, path.join(location.root, runId)]) {
      if (fs.existsSync(directory)) {
        assertSafePath(location, directory, 'directory');
        directories.add(directory);
      }
    }
    for (const name of ['writer.lock', ...['001', '002', '003'].flatMap((suffix) =>
      [path.join(runId, `epoch-${suffix}.json`), path.join(runId, `pending-${suffix}.json`)])]) {
      const file = path.join(location.root, name);
      if (fs.existsSync(file) && !tracked.has(file)) {
        assertSafePath(location, file, 'file');
        tracked.set(file, hash(fs.readFileSync(file)));
      }
    }
  }
  async function advance() {
    if (arguments.length || cleaned || epoch >= 3) throw new Error('Only the exact next closed epoch in this fresh own fixture is supported.');
    const next = epoch + 1;
    try {
      await persist(namespace, makeState(runId, next));
      epoch = next;
    } finally { track(); }
  }
  async function readOwnedFixture() {
    if (cleaned) throw new Error('Cleaned test owner cannot be read.');
    const gates = readGates();
    const readStartedAtUtc = new Date().toISOString();
    const receipt = await restore(namespace, runId);
    return { ...baseline, gates, receipt, readStartedAtUtc, readCompletedAtUtc: new Date().toISOString() };
  }
  async function cleanup() {
    for (const [file, sha256] of tracked) {
      if (path.dirname(file) !== location.root && path.dirname(file) !== path.join(location.root, runId)) throw new Error('Cleanup escaped this exact fresh fixture.');
      await requireCurrentConsent();
      assertSafePath(location, file, 'file');
      if (hash(fs.readFileSync(file)) !== sha256) throw new Error('Tracked created file changed; refuse cleanup.');
      fs.unlinkSync(file);
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
      if (![location.root, path.join(location.root, runId)].includes(directory) || directory === location.base) throw new Error('Never clean a category root or other UUID.');
      await requireCurrentConsent();
      assertSafePath(location, directory, 'directory');
      fs.rmdirSync(directory);
    }
    cleaned = true;
    if (fs.existsSync(location.root)) throw new Error('Exact created test UUID remains.');
  }
  await advance();
  return Object.freeze({
    namespace, root: location.root, advance, cleanup,
    async openGate() {
      if (arguments.length) throw new Error('No test expected-context injection.');
      return loadOwnedReader(readOwnedFixture).open();
    },
    trackedFiles() { return [...tracked.keys()]; }
  });
}
module.exports = Object.freeze({ capturedGate, freshFixtureOwner, captured });
