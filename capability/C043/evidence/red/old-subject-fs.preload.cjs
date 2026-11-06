'use strict';

// Pre-load for replaying a RED against the first publication through BOTH doors: Module._compile (required files, via
// old-subject.preload.cjs) and fs.readFileSync (files that the DOM stub reads and runs in a vm, and the files the server
// serves to the page). Only files directly in the namespace that have a retained snapshot old-subject\<name>.txt are replaced.
require('./old-subject.preload.cjs');
const fs = require('node:fs');
const path = require('node:path');

const namespace = path.resolve(__dirname, '..', '..');
const snapshots = path.join(__dirname, 'old-subject');
const read = fs.readFileSync;

fs.readFileSync = function replaced(file, ...rest) {
  if (typeof file === 'string') {
    const resolved = path.resolve(file);
    const snapshot = path.join(snapshots, `${path.basename(resolved)}.txt`);
    if (path.dirname(resolved) === namespace && fs.existsSync(snapshot)) return read.call(fs, snapshot, ...rest);
  }
  return read.call(fs, file, ...rest);
};
