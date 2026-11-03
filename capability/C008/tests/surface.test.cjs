'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('loads shared authorities directly, in dependency order, without catalog or authority copies', () => {
  const html = read('index.html');
  assert.deepEqual([...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]), [
    '../C001/approved-contract.js', '../C001/contract-guard.js',
    '../C003/matrix-contract.js', '../C003/matrix-data.js',
    '../C005/catalog-contract.js', '../C005/catalog-data.js',
    'preparation.js', 'preparation-page.js'
  ]);
  assert.equal(fs.existsSync(path.join(root, 'catalog-data.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
  assert.match(read('preparation.js'), /catalogContract\.validateCatalog\(catalog, matrix\)/);
  assert.match(read('preparation.js'), /approvalGuard\.validateApproval\(approved\.approval\)/);
  for (const name of ['preparation.js', 'preparation-page.js']) {
    assert.doesNotMatch(read(name), /(?:node:fs|execSync|execFile|readdir|globSync|XMLHttpRequest|localStorage|indexedDB)/);
    assert.doesNotMatch(read(name), /(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\()/);
  }
});

test('CSP is local-only without inline handlers, inline scripts or execution controls', () => {
  const html = read('index.html');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'",
    "base-uri 'none'", "form-action 'none'"
  ]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<iframe|<form|<input|on(?:click|change|load)=/i);
  assert.equal([...html.matchAll(/<button /g)].length, 2);
  assert.equal([...html.matchAll(/<select /g)].length, 1);
  assert.match(html, /<label for="entry-select">/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="preparation-error" role="alert"/);
  assert.match(html, /id="entry-heading" tabindex="-1"/);
  assert.match(html, /microsoft-open-source-disclaimer/);
});

test('page retains canonical dependency, support, evidence, approval and uncertainty distinctions', () => {
  const page = read('preparation-page.js');
  for (const field of [
    'entry.prerequisites.additional', 'entry.prerequisites.inheritsBase',
    'entry.implementation', 'entry.acceptance', 'entry.sourceReferences',
    'entry.learning.reason', 'entry.native.reason', 'entry.support.reason',
    'entry.parent.reason', 'catalog.common.riskReason',
    'matrix.rows', 'row.constraints', 'constraint.text', 'row.reason',
    'approval.operatingEnvelope.maximumLiveAzureRuns', 'approval.operatingEnvelope.authorizedCloudSpend'
  ]) assert.ok(page.includes(field), field);
  for (const key of ['dependencyRules', 'sharedDefinitionOfDone', 'operatingLimits', 'acceptanceAndEvidence']) {
    assert.ok(page.includes(`'${key}'`));
  }
  assert.match(page, /Pricing is unknown/);
  assert.match(page, /not a default/);
  assert.match(page, /Native verification: unverified/);
  assert.match(page, /Actual user impact: not measured/);
  assert.match(page, /not H010 cleanup/);
});

test('layout has visible focus, reflow and hidden-state treatment without a framework', () => {
  const css = read('preparation.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline: 3px solid/);
  assert.match(css, /white-space: pre-wrap/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /\[hidden\] \{ display: none !important/);
  assert.doesNotMatch(read('index.html'), /https?:\/\/[^"]+\.(?:js|css)/);
});

test('RED sources remain non-discovered snapshots and IaC N/A precedes implementation', () => {
  assert.match(read('evidence\\red-preparation.stub.js.txt'), /state: 'not-implemented'/);
  assert.match(read('evidence\\red-assertions.cjs.txt'), /length, 152/);
  assert.match(read('evidence\\red.txt'), /0 !== 152/);
  assert.match(read('evidence\\red.txt'), /AssertionError/);
  const iac = JSON.parse(read('evidence\\iac-na.json'));
  assert.equal(iac.iacGenerated, false);
  assert.equal(iac.cloudQueries, false);
  assert.equal(iac.stage, 'IaC N/A');
  assert.match(iac.recordedBefore, /implementation/);
});

test('browser evidence is opt-in exactly 1 and sessions close in finally', () => {
  const browser = read('tests\\browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.doesNotMatch(browser, /fs\.(?:rm|unlink|truncate)/);
  assert.match(browser, /finally \{\s+await session\.close\(\);/);
  assert.match(browser, /openIsolatedLesson\('capability\\\\C008\\\\index\.html'\)/);
  assert.doesNotMatch(browser, /(?:launch\(|--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|chromiumSandbox:\s*false)/);
});
