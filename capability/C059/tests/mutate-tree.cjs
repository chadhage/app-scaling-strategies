'use strict';

// Test tooling: the private tree of a mutation worker and the proof that it is pristine again after every mutant (fourth fix, review D2: a run left a `data` folder in the tree of the worker and
// the next mutant was "killed" by an unrelated test that saw it). snapshot() reads every file of the tree, digest() is one SHA-256 over every path and every byte, and restore() puts the tree
// back exactly as the snapshot: files that were changed are rewritten, files that were added are removed, folders that were added are removed. The generator compares digest() with the one of the
// pristine tree after EVERY mutant, restores when they differ, and records how many paths it had to repair.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function snapshot(tree) {
  const files = new Map();
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full); else files.set(path.relative(tree, full), fs.readFileSync(full));
    }
  };
  walk(tree);
  return files;
}

function digest(files) {
  const hash = crypto.createHash('sha256');
  for (const name of [...files.keys()].sort()) hash.update(`${name}\0`).update(crypto.createHash('sha256').update(files.get(name)).digest());
  return hash.digest('hex');
}

// Returns the number of paths that had to be repaired (0: the tree was already pristine). The folders of the pristine tree are kept; every other folder is removed.
function restore(tree, pristine) {
  const now = snapshot(tree);
  let repaired = 0;
  for (const [name, bytes] of now) {
    if (!pristine.has(name)) { fs.rmSync(path.join(tree, name), { force: true }); repaired += 1; } else if (!pristine.get(name).equals(bytes)) { fs.writeFileSync(path.join(tree, name), pristine.get(name)); repaired += 1; }
  }
  for (const [name, bytes] of pristine) {
    if (!now.has(name)) { fs.mkdirSync(path.dirname(path.join(tree, name)), { recursive: true }); fs.writeFileSync(path.join(tree, name), bytes); repaired += 1; }
  }
  const keep = new Set([...pristine.keys()].flatMap((name) => { const parts = name.split(path.sep); return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join(path.sep)); }));
  const prune = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(directory, entry.name);
      if (!keep.has(path.relative(tree, full))) { fs.rmSync(full, { recursive: true, force: true }); repaired += 1; } else prune(full);
    }
  };
  prune(tree);
  return repaired;
}

module.exports = Object.freeze({ digest, restore, snapshot });
