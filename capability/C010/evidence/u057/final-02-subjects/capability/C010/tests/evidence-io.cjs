'use strict';

// Test tooling, not production code: the file system the evidence checks read through. The real one by default (each real file, directory listing and
// existence answer is read once and kept: a run of the checks touches a few hundred files and a loaded machine answers each read slowly); a tamper test
// swaps in an OVERLAY (a map of altered, removed and added files over the real tree) so that an alteration costs nothing: no copy of the namespace, no
// file is ever written. Only the calls the checks make are provided: readFileSync, existsSync, readdirSync (also withFileTypes).
const path = require('node:path');
const real = require('node:fs');

const key = (file) => path.resolve(file).toLowerCase();
const kept = { files: new Map(), exists: new Map(), dirs: new Map() };
const cachedReal = Object.freeze({
  readFileSync(file, encoding) {
    let bytes = kept.files.get(key(file));
    if (bytes === undefined) { bytes = real.readFileSync(file); kept.files.set(key(file), bytes); }
    return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
  },
  existsSync(file) {
    let answer = kept.exists.get(key(file));
    if (answer === undefined) { answer = real.existsSync(file); kept.exists.set(key(file), answer); }
    return answer;
  },
  readdirSync(dir, options) {
    let entries = kept.dirs.get(key(dir));
    if (entries === undefined) { entries = real.readdirSync(dir, { withFileTypes: true }).map((entry) => ({ name: entry.name, directory: entry.isDirectory() })); kept.dirs.set(key(dir), entries); }
    return options && options.withFileTypes ? entries.map((entry) => ({ name: entry.name, isDirectory: () => entry.directory, isFile: () => !entry.directory })) : entries.map((entry) => entry.name);
  }
});

let backend = cachedReal;
let table = new Map();
let generation = 0;

function overlay(edits) {
  const entries = new Map([...edits].map(([file, value]) => [key(file), { file: path.resolve(file), value }]));
  const under = (dir) => [...entries.values()].filter((entry) => key(entry.file).startsWith(`${key(dir)}${path.sep}`));
  const missing = (file) => Object.assign(new Error(`ENOENT: no such file or directory, open '${file}'`), { code: 'ENOENT' });
  table = entries;
  return Object.freeze({
    readFileSync(file, encoding) {
      const edit = entries.get(key(file));
      if (edit === undefined) return cachedReal.readFileSync(file, encoding);
      if (edit.value === null) throw missing(file);
      return encoding ? edit.value.toString(encoding) : Buffer.from(edit.value);
    },
    existsSync(file) {
      const edit = entries.get(key(file));
      if (edit !== undefined) return edit.value !== null;
      return cachedReal.existsSync(file) || under(file).some((entry) => entry.value !== null);
    },
    readdirSync(dir, options) {
      const names = new Map();
      if (cachedReal.existsSync(dir)) for (const entry of cachedReal.readdirSync(dir, { withFileTypes: true })) names.set(entry.name, entry.isDirectory());
      for (const entry of under(dir)) {
        const relative = path.relative(dir, entry.file).split(path.sep);
        if (relative.length === 1) { if (entry.value === null) names.delete(relative[0]); else names.set(relative[0], false); } else if (entry.value !== null) names.set(relative[0], true);
      }
      const sorted = [...names.entries()].sort((first, second) => (first[0] < second[0] ? -1 : 1));
      return options && options.withFileTypes ? sorted.map(([name, isDirectory]) => ({ name, isDirectory: () => isDirectory, isFile: () => !isDirectory })) : sorted.map(([name]) => name);
    }
  });
}

const io = {
  readFileSync: (...args) => backend.readFileSync(...args),
  existsSync: (...args) => backend.existsSync(...args),
  readdirSync: (...args) => backend.readdirSync(...args),
  // Does the active overlay alter (or remove, or add) this very file? Everything else is the real file.
  edited: (file) => table.has(key(file)),
  // Runs `action` with the files of the tree as they are with `edits` applied (a Map of absolute path to Buffer, or to null for a removed file).
  withEdits(edits, action) {
    const previous = backend;
    const previousTable = table;
    backend = overlay(edits);
    generation += 1;
    try { return action(); } finally { backend = previous; table = previousTable; generation += 1; }
  },
  get generation() { return generation; }
};

module.exports = Object.freeze(io);
