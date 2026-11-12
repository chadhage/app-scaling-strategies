'use strict';
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const production = Object.freeze(['server.cjs']);
const rootTestTooling = Object.freeze(['verify.cjs']);
const suites = Object.freeze(['acceptance.test.cjs', 'authority.test.cjs', 'boundary.test.cjs', 'imports.test.cjs', 'protocol.test.cjs']);
function verifySelection() {
  const actualProduction = fs.readdirSync(root).filter(name => /\.(cjs|js)$/.test(name)).sort();
  const actualSuites = fs.readdirSync(__dirname).filter(name => /\.test\.cjs$/.test(name)).sort();
  assert.deepEqual(actualProduction, [...production, ...rootTestTooling].sort(), 'EVERY_COMPLETE_NEW_EXECUTABLE_CLASSIFIED_PRODUCTION_OR_TEST_TOOLING');
  assert.deepEqual(actualSuites, [...suites].sort(), 'NO_HIDDEN_OR_OMITTED_TEST_SUITE');
  return { production, rootTestTooling, suites, tests: suites.map(file => path.join(__dirname, file)) };
}
module.exports = { root, production, rootTestTooling, suites, verifySelection };
