'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const red = path.join(__dirname, '..', 'evidence', 'red');
const stubFile = path.join(red, 'upload.source.snapshot');
const stub = new Module(stubFile, module);
stub.filename = stubFile;
stub._compile(fs.readFileSync(stubFile, 'utf8'), stubFile);
const assertionFile = path.join(red, 'assertion.source.snapshot');
const assertion = new Module(assertionFile, module);
assertion.filename = assertionFile;
assertion.require = (id) => id === '../upload.js' ? stub.exports : require(id);
assertion._compile(fs.readFileSync(assertionFile, 'utf8'), assertionFile);
