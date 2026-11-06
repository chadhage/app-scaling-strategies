'use strict';

// F5 of the independent review of U009: --json was unconfined. It resolved against the current directory and overwrote whatever was there,
// including a production source file of the measured root. The rule now: only a new file or a previous gate report (it carries the gate schema) is
// replaced; directories, special device names and script names are refused with exit 2 before anything is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeScratch, dispose, writeTree } = require('./support.cjs');
const { runGateCli, readJson, relativeToRepository } = require('./clisupport.cjs');

const SOURCE = "'use strict';\nfunction f(x) { return x + 1; }\nmodule.exports = { f };\n";
const TEST = "'use strict';\nconst test = require('node:test');\nconst lib = require('../lib.cjs');\ntest('f', () => { lib.f(1); });\n";
const state = { scratch: null, runs: {}, bytes: {} };

test.before(async () => {
  state.scratch = makeScratch('f5');
  const base = state.scratch;
  const root = writeTree(path.join(base, 'ns'), { 'lib.cjs': SOURCE, 'tests/lib.test.cjs': TEST });
  const foreign = { 'notes.txt': 'precious notes\n', 'other.json': '{ "schema": "other/1", "keep": true }\n', 'no-schema.json': '{ "pass": true }\n' };
  writeTree(base, foreign);
  fs.mkdirSync(path.join(base, 'a-directory'));
  state.bytes = { 'ns/lib.cjs': SOURCE, ...foreign };
  const gateScratch = path.join(base, 'gate-scratch');
  const common = ['--root', relativeToRepository(root), '--scratch', gateScratch];
  const jobs = {
    production: [...common, '--json', path.join(root, 'lib.cjs')],
    notes: [...common, '--json', path.join(base, 'notes.txt')],
    otherSchema: [...common, '--json', path.join(base, 'other.json')],
    noSchema: [...common, '--json', path.join(base, 'no-schema.json')],
    directory: [...common, '--json', path.join(base, 'a-directory')],
    device: [...common, '--json', 'NUL'],
    deviceWithExtension: [...common, '--json', 'nul.json'],
    scriptName: [...common, '--json', path.join(base, 'report.cjs')],
    created: [...common, '--json', path.join(base, 'new', 'deeper', 'report.json')]
  };
  const entries = await Promise.all(Object.entries(jobs).map(async ([name, args]) => [name, await runGateCli(args, { timeout: 120000 })]));
  state.runs = Object.fromEntries(entries);
  state.root = root;
});

test.after(() => {
  if (state.scratch) dispose(state.scratch);
});

const refused = (name) => {
  const { status, report, timedOut } = state.runs[name];
  assert.equal(timedOut, false, name);
  assert.equal(status, 2, `${name}: refused as a usage error`);
  assert.equal(report.pass, false, name);
  assert.equal(report.error.code, 'USAGE', name);
  return report.error.message;
};

test('a production source file of the measured root is never overwritten by --json', () => {
  assert.match(refused('production'), /--json/);
  assert.equal(fs.readFileSync(path.join(state.root, 'lib.cjs'), 'utf8'), SOURCE);
});

test('an existing file that is not a previous gate report is never overwritten', () => {
  for (const [name, file] of [['notes', 'notes.txt'], ['otherSchema', 'other.json'], ['noSchema', 'no-schema.json']]) {
    assert.match(refused(name), /not a previous gate report/, name);
    assert.equal(fs.readFileSync(path.join(state.scratch, file), 'utf8'), state.bytes[file], file);
  }
});

test('a directory is refused', () => {
  assert.match(refused('directory'), /directory/);
  assert.deepEqual(fs.readdirSync(path.join(state.scratch, 'a-directory')), []);
});

test('special device names are refused, with or without an extension', () => {
  if (process.platform !== 'win32') return;
  assert.match(refused('device'), /reserved|device/i);
  assert.match(refused('deviceWithExtension'), /reserved|device/i);
});

test('a script name is refused because a report there would be enumerated as production code', () => {
  assert.match(refused('scriptName'), /script/i);
  assert.equal(fs.existsSync(path.join(state.scratch, 'report.cjs')), false);
});

test('a new file below a folder that does not exist yet is still written', () => {
  const { status, report } = state.runs.created;
  assert.equal(status, 0);
  assert.deepEqual(readJson(path.join(state.scratch, 'new', 'deeper', 'report.json')), report);
});
