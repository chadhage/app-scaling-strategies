'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inventory, enumerate, extraOracle } = require('./ast.cjs');
const oracle = require('../../C011/tests/u074-domain-oracle.cjs');
test('independent AST oracle detects missing nested statements declarations conditions initializers and modules', () => {
  const source = "'use strict'; const held = new Set(); function f(x) { for (let i=0;i<2;i++) { if(x && i!==1) return false; } return true; } module.exports = f;";
  const actual = enumerate('specimen.js', source), expected = oracle.enumerate('specimen.js', source);
  assert.deepEqual(actual.statements.map(row => row.key).sort(), expected.statements.map(row => row.key).sort());
  assert.deepEqual(actual.conditions.map(row => row.key).sort(), expected.conditions.map(row => row.key).sort());
  const extra = extraOracle('specimen.js', source);
  assert.deepEqual(actual.initializers.map(row => row.key).sort(), extra.initializers.sort());
  assert.deepEqual(actual.modules.map(row => row.key).sort(), extra.modules.sort());
  assert.ok(actual.statements.some(row => row.type === 'VariableDeclaration' && row.parentType === 'ForStatement'));
  assert.ok(actual.initializers.some(row => row.binding === 'held'));
});
test('whole actual production domain agrees with separate independent traversals', () => {
  const report = inventory();
  assert.equal(report.files.length, 4);
  assert.ok(report.domains.every(domain => domain.statements.length > 0));
  assert.ok(report.domains.find(domain => domain.file === 'model.js').conditions.length > 20);
  for (const domain of report.domains) {
    for (const row of [...domain.statements, ...domain.conditions, ...domain.initializers, ...domain.modules]) {
      assert.ok(report.definitions.some(definition => definition.key === row.key), row.key);
    }
  }
});
