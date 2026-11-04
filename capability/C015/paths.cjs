'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fail } = require('./contract.cjs');

const cardRoot = path.resolve(__dirname);
const demoNamespace = 'synthetic-restart-v1';
const testName = /^test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function resolveNamespace(namespace) {
  if (typeof namespace !== 'string' || !(namespace === demoNamespace || testName.test(namespace))) {
    fail('UNKNOWN_FIXTURE_ID', 'Only synthetic-restart-v1 or a unique named C015 test UUID fixture is supported; paths and traversal are forbidden.');
  }
  const testOnly = namespace !== demoNamespace;
  const base = path.join(cardRoot, testOnly ? 'test-scratch' : 'fixtures');
  return Object.freeze({ namespace, testOnly, base, root: path.join(base, namespace) });
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertSafePath(location, target, requiredKind) {
  const resolved = path.resolve(target);
  if (!(resolved === location.base || within(location.root, resolved)) || !within(cardRoot, resolved)) {
    fail('PATH_SCOPE', 'All filesystem targets must resolve beneath the selected owned C015 fixture.');
  }
  if (fs.lstatSync(cardRoot).isSymbolicLink() ||
      path.relative(cardRoot, fs.realpathSync(cardRoot)) !== '') {
    fail('UNSAFE_PATH', 'The owned C015 root or an ancestor resolves through a symlink.');
  }
  const relative = path.relative(cardRoot, resolved);
  let current = cardRoot;
  const pieces = relative.split(path.sep);
  for (let index = 0; index < pieces.length; index++) {
    current = path.join(current, pieces[index]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink() || path.relative(current, fs.realpathSync(current)) !== '') {
      fail('UNSAFE_PATH', 'Symlinks and junctions are forbidden in fixture paths.');
    }
    const last = index === pieces.length - 1;
    if (!last && !stat.isDirectory()) fail('UNSAFE_PATH', 'A fixture ancestor is not a directory.');
    if (last) {
      if (requiredKind === 'directory' && !stat.isDirectory()) fail('UNSAFE_PATH', 'Expected a real directory.');
      if (requiredKind === 'file' && (!stat.isFile() || stat.nlink !== 1)) {
        fail('UNSAFE_FILE', 'Expected a regular, non-hard-linked file.');
      }
      return stat;
    }
  }
  fail('PATH_SCOPE', 'The fixture root is not a writable card root.');
}

module.exports = Object.freeze({ cardRoot, demoNamespace, resolveNamespace, assertSafePath, within });
