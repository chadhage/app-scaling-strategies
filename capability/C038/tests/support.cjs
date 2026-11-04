'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(root, '..', 'C036', 'captured.js'), 'utf8'), sandbox, { timeout: 1000 });
const captured = JSON.parse(JSON.stringify(sandbox.C036Captured));
function load(filename, replacements) {
  const instance = new Module(filename, module);
  const original = Module.createRequire(filename);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance.require = (request) => Object.hasOwn(replacements, request) ? replacements[request] : original(request);
  instance._compile(fs.readFileSync(filename, 'utf8'), filename);
  return instance.exports;
}
function fixtureSubject(read = async () => structuredClone(captured.context), validate = async () => true) {
  const attribution = load(path.join(root, '..', 'C036', 'attribution.js'), {
    './current.cjs': { readCurrent: read }
  });
  return load(path.join(root, 'readiness.js'), {
    '..\\C036\\attribution.js': attribution, './sources.cjs': { assertInputs: validate }
  });
}
async function fixtureSession() { return fixtureSubject().open(); }
async function inspect(id) {
  const session = await fixtureSession();
  return session.inspectText(JSON.stringify(session.getEvidence(id)));
}
module.exports = Object.freeze({ captured, load, fixtureSubject, fixtureSession, inspect });
