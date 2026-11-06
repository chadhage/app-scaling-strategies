'use strict';

// N4 of the second review: two guard mutants survived all hermetic files, both real test gaps.
// A6: the compatibility mapping NFKC applied to the organization IN qualify.cjs made look-alikes of "Microsoft Corporation" pass
//     with an EMPTY reason list; only subject.cjs was tested against them, never the verdict of qualifyEdge().
// B10: the version-line pattern of the requalification lost its line start anchor, so a test TITLE that contains
//     "# Real Chromium <version>" counted as proof that a browser ran.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const requalify = require('../requalify.cjs');
const { fixtureAdapters, MS_ISSUER } = require('./support.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const MS = 'Microsoft Corporation';
const LOOKALIKES = [
  ['a no-break space in place of the space', 'Microsoft\u00A0Corporation'],
  ['an em space in place of the space', 'Microsoft\u2003Corporation'],
  ['an ideographic space in place of the space', 'Microsoft\u3000Corporation'],
  ['a fullwidth M', '\uFF2Dicrosoft Corporation'],
  ['fullwidth letters everywhere', '\uFF2D\uFF49\uFF43\uFF52\uFF4F\uFF53\uFF4F\uFF46\uFF54 \uFF23orporation'],
];
const signedBy = (organization) => fixtureAdapters({
  signature: () => ({ status: 'Valid', subject: `CN=Microsoft Corporation, O=${organization}, L=Redmond, S=WA, C=US`, issuer: MS_ISSUER, thumbprint: 'CD'.repeat(20) }),
});

test('control: the exact organization is accepted by the verdict of qualifyEdge()', async () => {
  const report = await qualifyEdge({ adapters: signedBy(MS) });
  assert.deepEqual([report.ok, report.reasonCodes], [true, []]);
  assert.equal(report.signature.publisher, MS);
});

for (const [what, organization] of LOOKALIKES) {
  test(`the verdict refuses an organization with ${what}: PUBLISHER_NOT_MICROSOFT, never an empty reason list`, async () => {
    const report = await qualifyEdge({ adapters: signedBy(organization) });
    assert.equal(report.ok, false);
    assert.deepEqual(report.reasonCodes, ['PUBLISHER_NOT_MICROSOFT']);
    assert.match(report.reasons[0], /^PUBLISHER_NOT_MICROSOFT: the signer is not Microsoft Corporation: /);
  });
}

test('a test TITLE that contains "# Real Chromium <version>" is not a browser sighting, a nested diagnostic line is', { timeout: 120000 }, async () => {
  const env = { ...process.env };
  const titled = await requalify.runSuite('title-hash-suite.cjs', { cwd: fixtures, timeoutMs: 90000, env });
  assert.equal(titled.testsPassed, true);
  assert.deepEqual(titled.browserVersionsSeen, []);
  assert.equal(titled.passed, false);
  const nested = await requalify.runSuite('nested-diagnostic-suite.cjs', { cwd: fixtures, timeoutMs: 90000, env });
  assert.equal(nested.testsPassed, true);
  assert.deepEqual(nested.browserVersionsSeen, ['156.0.4314.58']);
  assert.equal(nested.passed, true);
});
