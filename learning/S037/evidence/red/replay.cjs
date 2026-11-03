'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const stubPath = path.join(__dirname, 'model.stub.snapshot');
const stub = new Module(stubPath, module);
stub.filename = stubPath;
stub._compile(fs.readFileSync(stubPath, 'utf8'), stubPath);
const originalTest = fs.readFileSync(path.join(__dirname, 'contract.source.snapshot'), 'utf8');
const replay = new Module(path.join(__dirname, 'contract-replay.cjs'), module);
replay.filename = path.join(__dirname, 'contract-replay.cjs');
replay.paths = module.paths;
const nativeRequire = replay.require.bind(replay);
replay.require = (id) => id === '../model.js' ? stub.exports : nativeRequire(id);
replay._compile(originalTest, replay.filename);
