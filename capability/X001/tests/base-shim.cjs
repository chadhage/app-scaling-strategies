'use strict';

// Preload for replaying a RED of the fix against the code the review REJECTED: timeline.js, describe.js and page.js are served from the frozen
// first-publication snapshots (evidence\fix\base, byte-identical to commit 368332e2a881, checked by tests\red-replay-fix.test.cjs) instead of the
// final files, through require and through fs.readFileSync (the DOM stub reads page.js and the model by path). X001_BASE_MUTANTS=D1,D2,... applies
// the reviewer's single-line mutants (the list below) to those first-publication bytes; every `find` must occur exactly once.
//   node --require .\capability\X001\tests\base-shim.cjs --test <test file>
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const NAMES = ['timeline.js', 'describe.js', 'page.js'];
const MUTANTS = Object.freeze({
  B12: ['timeline.js', 'position: index + 1, epoch: step.flags.gap.epoch', 'position: index, epoch: step.flags.gap.epoch'],
  D1: ['describe.js', "['reconnects', 'Reconnects', counts.reconnects]", "['reconnects', 'Reconnects', counts.disconnects]"],
  D2: ['describe.js', "['resyncs', 'Resyncs', counts.resyncs]", "['resyncs', 'Resyncs', counts.reconnects]"],
  D6: ['describe.js', "['epoch-changes', 'Epoch changes', state.epochChanges.length]", "['epoch-changes', 'Epoch changes', state.gaps.length]"],
  D7: ['describe.js', "['connection', 'Connection', state.connection]", "['connection', 'Connection', 'open']"],
  P12: ['page.js', "$('verified').textContent = check.ok", "$('verified').textContent = true"],
});

function sourceOf(name) {
  let text = fs.readFileSync(path.join(root, 'evidence', 'fix', 'base', `${name.replace('.js', '')}.first.js`), 'utf8');
  for (const key of (process.env.X001_BASE_MUTANTS || '').split(',').filter(Boolean)) {
    const [file, find, replace] = MUTANTS[key] || [];
    if (!file) throw new Error(`unknown reviewer mutant ${key}`);
    if (file !== name) continue;
    if (text.split(find).length !== 2) throw new Error(`mutant ${key}: the line must occur exactly once in ${name}`);
    text = text.replace(find, () => replace);
  }
  return text;
}

const originals = new Map(NAMES.map((name) => [path.join(root, name), name]));
const realRead = fs.readFileSync;
fs.readFileSync = function read(file, ...rest) {
  const name = typeof file === 'string' ? originals.get(path.resolve(file)) : undefined;
  if (name === undefined) return realRead.call(this, file, ...rest);
  const text = sourceOf(name);
  const encoding = typeof rest[0] === 'string' ? rest[0] : rest[0] && rest[0].encoding;
  return encoding ? text : Buffer.from(text, 'utf8');
};

const cache = new Map();
const realLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  const name = parent && parent.filename ? originals.get(path.resolve(path.dirname(parent.filename), request)) : undefined;
  if (name === undefined) return realLoad.call(this, request, parent, isMain);
  if (!cache.has(name)) {
    const filename = path.join(root, name);
    const served = new Module(filename, parent);
    served.filename = filename;
    served.paths = Module._nodeModulePaths(path.dirname(filename));
    served._compile(sourceOf(name), filename);
    cache.set(name, served.exports);
  }
  return cache.get(name);
};

module.exports = Object.freeze({ MUTANTS: Object.keys(MUTANTS), NAMES });
