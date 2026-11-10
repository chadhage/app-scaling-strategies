'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const virtual = path.join(__dirname, 'mutate-gen.cjs');
const old = path.join(__dirname, '..', 'evidence', 'red', 'mutation-policy-old', 'mutate-gen.cjs');
const subject = new Module(virtual, module);
subject.filename = virtual;
subject.paths = Module._nodeModulePaths(__dirname);
process.argv = [process.execPath, virtual, ...process.argv.slice(2)];
subject._compile(fs.readFileSync(old, 'utf8'), virtual);
