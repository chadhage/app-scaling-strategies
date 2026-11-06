'use strict';

// RED support: loads the server AS PUBLISHED in 14cefdea (the directory in C059_RED_SUBJECT holds that file byte for byte) as if it lived in the
// namespace root, so that its relative paths (the page assets, C041 and C042) resolve exactly as they did when it was published.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const namespace = path.resolve(__dirname, '..', '..', '..');
const virtual = path.join(namespace, 'server.cjs');
const loaded = new Module(virtual, null);
loaded.filename = virtual;
loaded.paths = Module._nodeModulePaths(namespace);
loaded._compile(fs.readFileSync(path.join(path.resolve(process.env.C059_RED_SUBJECT), 'server.cjs'), 'utf8'), virtual);
module.exports = loaded.exports;
