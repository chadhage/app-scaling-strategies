'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const lesson = path.resolve(__dirname, '..');
const red = path.join(lesson, 'evidence', 'raw', 'red');
const stubPath = path.join(red, 'model.js.snapshot');
const stub = new Module(stubPath, module);
stub.filename = stubPath;
stub.paths = module.paths;
stub._compile(fs.readFileSync(stubPath, 'utf8'), stubPath);
const testsPath = path.join(red, 'model.test.cjs.snapshot');
const tests = new Module(testsPath, module);
tests.filename = testsPath;
tests.paths = module.paths;
tests.require = (id) => id === '../model.js' ? stub.exports : require(id);
tests._compile(fs.readFileSync(testsPath, 'utf8'), testsPath);
