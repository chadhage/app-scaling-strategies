'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inventory } = require('./ast.cjs');
test('complete independently grounded AST metadata roundtrips as actual JSON without omitted undefined fields', () => {
  const domain = inventory();
  assert.deepEqual(JSON.parse(JSON.stringify(domain)), domain, 'the persisted complete domain is the same JSON-compatible data, not a repaired raw report');
  const assignments = domain.domains.flatMap(row => row.initializers).filter(row => row.type === 'AssignmentExpression');
  assert.ok(assignments.length > 10);
  assert.ok(assignments.every(row => row.declarationKind === null), 'assignment initializers have explicit null declaration kind');
});
