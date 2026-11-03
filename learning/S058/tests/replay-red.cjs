'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const folder = path.resolve(__dirname, '..');
const red = path.join(folder, 'evidence', 'red');
const stub = new Module(path.join(folder, 'model.js'), module);
stub.filename = path.join(folder, 'model.js');
stub.paths = module.paths;
stub._compile(fs.readFileSync(path.join(red, 'model.js.snapshot'), 'utf8'), stub.filename);
const assertions = new Module(path.join(__dirname, 'model.test.cjs'), module);
assertions.filename = path.join(__dirname, 'model.test.cjs');
assertions.paths = module.paths;
const originalRequire = assertions.require.bind(assertions);
assertions.require = (id) => id === '../model.js' ? stub.exports : originalRequire(id);
assertions._compile(fs.readFileSync(path.join(red, 'model.test.cjs.snapshot'), 'utf8'), assertions.filename);
