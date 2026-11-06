'use strict';

// RED support: loads journey.js AS PUBLISHED in dfdace94 (the directory in C059_RED_SUBJECT holds that file byte for byte) as if it lived in the namespace root, so that its
// relative require of the pinned C042 contract resolves exactly as it did when it was published.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const namespace = path.resolve(__dirname, '..', '..', '..');
const virtual = path.join(namespace, 'journey.js');
const loaded = new Module(virtual, null);
loaded.filename = virtual;
loaded.paths = Module._nodeModulePaths(namespace);
loaded._compile(fs.readFileSync(path.join(path.resolve(process.env.C059_RED_SUBJECT), 'journey.js'), 'utf8'), virtual);
module.exports = loaded.exports;
