'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./u041-support.cjs');

const exportsByFile = {
  'gate.cjs': ['USAGE', 'parseArgs', 'displayPath', 'mapPool', 'makeRunDirectory', 'missingFolders', 'removeCreatedFolders', 'isEmptyFile', 'runGate', 'main', 'entry'],
  'glob.cjs': ['MAX_PATTERN_LENGTH', 'normalizePattern', 'hasMagic', 'compileGlob', 'globToRegExp', 'matchesGlob']
};

for (const [file, names] of Object.entries(exportsByFile)) {
  test(`U041 importer contract: ${file} is loadable and exports the complete documented interface`, () => {
    let module;
    assert.doesNotThrow(() => { module = load(file); }, `${file} must load as a first-party module`);
    assert.deepEqual(Object.keys(module).sort(), [...names].sort());
    assert.equal(Object.isFrozen(module), true);
    for (const name of names) assert.equal(typeof module[name], ['USAGE'].includes(name) ? 'string' : name === 'MAX_PATTERN_LENGTH' ? 'number' : 'function', name);
  });
}
