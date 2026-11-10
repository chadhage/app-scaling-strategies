'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseHtml } = require('./dom.cjs');
const { VALID } = require('./fixtures.cjs');
const checker = require('./subject.cjs').load('a11y-check.js');

test('equivalence demonstration: an empty composite is still refused because its number of tab stops is zero, not one', () => {
  const html = VALID.replace(/<div id="r1"[\s\S]*?Second lesson<\/div>/, '');
  const document = parseHtml(html);
  document.getElementById('result-h').focus();
  const empty = document.getElementById('lessons');
  assert.equal(empty.children.length, 0);
  const findings = checker.check(document).findings;
  assert.ok(findings.some((finding) => finding.code === 'ROVING_TABINDEX'), JSON.stringify(findings));
  const control = parseHtml(VALID);
  control.getElementById('result-h').focus();
  assert.deepEqual(checker.check(control).findings, []);
});
