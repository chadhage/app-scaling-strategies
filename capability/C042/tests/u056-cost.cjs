'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const NS = 'capability/C042';
const retained = (name) => path.join(root, 'evidence', 'u056-residuals', 'retained', `${name}.txt`);
const source = (name, before) => fs.readFileSync(before && fs.existsSync(retained(name)) ? retained(name) : path.join(root, 'tests', name), 'utf8');

function acceptedFixture() {
  const names = new Set();
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const name = `${NS}/evidence-addendum-${sequence}.json`;
    const addendum = JSON.parse(fs.readFileSync(path.join(root, `evidence-addendum-${sequence}.json`), 'utf8'));
    names.add(name);
    for (const file of Object.keys(addendum.base?.files ?? {})) names.add(file);
    for (const item of [...(addendum.amendments ?? []), ...(addendum.supersedes ?? []), ...(addendum.evidence ?? []), ...(addendum.added ?? [])]) names.add(item.path);
  }
  const fourth = path.join(root, 'evidence-addendum-4.json');
  const replaced = new Map(fs.existsSync(fourth) ? JSON.parse(fs.readFileSync(fourth, 'utf8')).supersedes.map((item) => [item.path, item.retained]) : []);
  for (const name of ['README.md', 'U039.md', 'tests/u039-body-rows.cjs', 'tests/u039-evidence.test.cjs', 'tests/u039-incomplete-evidence.test.cjs']) {
    const saved = path.join(root, 'evidence', 'u056-residuals', 'retained', `${path.basename(name)}.txt`);
    if (fs.existsSync(saved)) replaced.set(`${NS}/${name}`, `${NS}/evidence/u056-residuals/retained/${path.basename(name)}.txt`);
  }
  const read = (file) => fs.readFileSync(path.join(root, '..', '..', replaced.get(file) ?? file));
  const files = new Map([...names].sort().map((name) => [name, read(name)]));
  assert.equal(files.size, 362, 'the accepted fixture has the actual reviewed file set');
  return files;
}

function registered(text, filename, overrides = {}) {
  const tests = [];
  const fakeTest = (name, options, body) => tests.push({ name, body: body ?? options });
  fakeTest.before = fakeTest.after = () => {};
  const realRequire = Module.createRequire(filename);
  const required = (name) => name === 'node:test' ? fakeTest : overrides[name] ?? realRequire(name);
  const run = vm.compileFunction(text, ['require', '__dirname'], { filename });
  run(required, path.dirname(filename));
  return tests;
}

function measure(before = false) {
  const files = acceptedFixture();
  const reads = new Map();
  const counts = { walks: 0, fileReads: 0, sha256Calls: 0, gunzipCalls: 0 };
  const logical = (file) => path.relative(path.resolve(root, '..', '..'), file).split(path.sep).join('/');
  const fixtureFs = {
    ...fs,
    existsSync: (file) => files.has(logical(file)),
    readFileSync(file, encoding) {
      const name = logical(file);
      assert.equal(files.has(name), true, `fixture contains ${name}`);
      counts.fileReads += 1;
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return encoding ? files.get(name).toString(encoding) : files.get(name);
    },
    readdirSync(directory) {
      counts.walks += 1;
      const prefix = `${logical(directory)}/`;
      const children = new Map();
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const tail = file.slice(prefix.length);
        const name = tail.split('/')[0];
        children.set(name, tail.includes('/'));
      }
      return [...children].map(([name, directory]) => ({ name, isDirectory: () => directory }));
    }
  };
  const tests = registered(source('u039-evidence.test.cjs', before), path.join(__dirname, 'u039-evidence.test.cjs'), {
    'node:fs': fixtureFs,
    'node:crypto': { ...crypto, createHash(...args) { counts.sha256Calls += 1; return crypto.createHash(...args); } },
    'node:zlib': { ...zlib, gunzipSync(...args) { counts.gunzipCalls += 1; return zlib.gunzipSync(...args); } }
  });
  const selected = tests.filter(({ name }) => /^(?:the addendum chain|the amended files|tamper:|the strict run|a tree converted)/.test(name));
  for (const item of selected) item.body();
  return { fixtureFiles: files.size, selectedTests: selected.length, counts, maximumReadsOfOneFile: Math.max(...reads.values()), uniqueFilesRead: reads.size };
}

function replaySelection(before = false) {
  let args;
  const stop = {};
  const tests = registered(source('u039-incomplete-evidence.test.cjs', before), path.join(__dirname, 'u039-incomplete-evidence.test.cjs'), {
    'node:child_process': { spawnSync(_node, selected) { args = selected; throw stop; } }
  });
  try { tests.find(({ name }) => name.startsWith('the RED of the fourth fix replays')).body(); } catch (error) { if (error !== stop) throw error; }
  assert.equal(Array.isArray(args), true);
  const patterns = args.filter((arg) => arg.startsWith('--test-name-pattern=')).map((arg) => new RegExp(arg.slice('--test-name-pattern='.length)));
  const candidates = ['u039-body.test.cjs', 'u039-body-order.test.cjs'].flatMap((name) => registered(fs.readFileSync(path.join(__dirname, name), 'utf8'), path.join(__dirname, name)));
  const names = candidates.filter(({ name }) => patterns.some((pattern) => pattern.test(name))).map(({ name }) => name);
  return { nestedNodeProcesses: 1, selectedTests: names.length, names };
}

if (require.main === module) console.log(JSON.stringify({ kind: 'measured-evidence-operations', before: process.argv[2] === 'before', ...measure(process.argv[2] === 'before'), replay: replaySelection(process.argv[2] === 'before') }));
module.exports = { acceptedFixture, measure, registered, replaySelection, retained, source };
