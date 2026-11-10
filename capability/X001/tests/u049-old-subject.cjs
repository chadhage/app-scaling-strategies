'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'timeline.js');
const bytes = fs.readFileSync(path.join(root, 'evidence', 'u049', 'retained', 'timeline.pre-u049.js'));
assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ca3569a8906ee80f6c21b182d532f61b80d00e04cf01dc365d4da428611d380c');
const load = Module._extensions['.js'];
Module._extensions['.js'] = function (subject, filename) {
  if (path.resolve(filename) === target) subject._compile(bytes.toString('utf8'), filename);
  else load(subject, filename);
};
