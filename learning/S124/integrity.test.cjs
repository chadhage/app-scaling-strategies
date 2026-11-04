'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const model = require('./model.js');

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts));
const json = (...parts) => JSON.parse(read(...parts));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

test('exact source acceptance, frozen unit, fictional DATA and incomplete native/parent scope', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.id, 'A-S124');
  assert.equal(manifest.parentId, 'D-S124');
  assert.equal(manifest.packet, 'SC-S124');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S124');
  assert.equal(manifest.objective, 'Compare slots and separate plans; identify true isolation and lifecycle-control differences.');
  assert.equal(manifest.sourceContract.acceptance, 'Real capacity isolation, cost, routing, drain control, and user outcomes are compared without claiming independent fault domains for shared slots.');
  assert.equal(manifest.banner, model.BANNER);
  assert.equal(manifest.nativeProofComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.accepted, false);
  assert.match(manifest.routingComparisonAxes, /External routing is not exclusive to separate plans/);
  const source = json('evidence', 'source-review.json');
  assert.equal(source.readBeforeDesign, true);
  assert.equal(source.sources.portableCard.kanoUnit, manifest.kanoUnit);
  assert.equal(source.sources.portableCard.packet, manifest.packet);
  assert.equal(source.sources.backlog.acceptance, manifest.sourceContract.acceptance);
  assert.equal(source.nativeSourceAcceptanceMet, false);
  assert.equal(source.sourceParentComplete, false);
  assert.equal(source.additionalCredits, 0);
  const iac = json('evidence', 'iac-na.json');
  assert.equal(iac.iac, 'N/A');
  assert.equal(iac.recordedBeforeImplementation, true);
  assert.deepEqual(iac.operationsPerformed, []);
  assert.equal(iac.additionalCredits, 0);
  const html = read('index.html').toString();
  assert.match(html, /DATA ONLY/);
  assert.match(html, /fixed fictional teaching observations/);
  assert.match(html, /not automatically certify independent dependencies or fault domains/);
  assert.match(html, /B-S124 native proof and D-S124 remain incomplete/);
  assert.match(html, /Router, dependency and other service costs are excluded/);
  assert.match(html, /Plan placement and routing mechanism are separate axes/);
});

test('archived behavioral RED remains loadable, byte-exact and outside autodiscovery', () => {
  const red = json('evidence', 'raw', 'red-proof.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.expectedAssertions, 2);
  assert.equal(red.stdoutSha256, hash(read('evidence', 'raw', 'red-stdout.txt')));
  assert.equal(red.stderrSha256, hash(read('evidence', 'raw', 'red-stderr.txt')));
  for (const [file, expected] of Object.entries(red.snapshots)) {
    assert.equal(hash(read('evidence', 'red-stub', file)), expected, `Historical raw snapshot ${file}`);
    assert.doesNotMatch(file, /(?:^test[.-]|[.-]test[.-]|[.-]spec[.-])/);
  }
  assert.equal(hash(canonical(read('placement.feature'))), hash(canonical(read('evidence', 'red-stub', 'placement.feature'))));
  const output = read('evidence', 'raw', 'red-stdout.txt').toString();
  assert.match(output, /AssertionError \[ERR_ASSERTION\]/);
  assert.match(output, /actual: 'awaiting-compare'/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|SyntaxError/);
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.project(stub.transition(stub.initialState(), {
    type: 'compare', strategy: 'shared-slots', fixture: 'healthy',
  })).phase, 'awaiting-compare');
  const load = json('evidence', 'raw', 'stub-load.json');
  assert.equal(load.phase, 'loadable-stub-before-RED');
  assert.equal(load.observed.afterCompareClick, 'awaiting-compare');
  assert.equal(load.observed.computeUnits, '0');
  assert.deepEqual(load.observed.pageErrors, []);
  assert.equal(load.observed.browserVersion, '156.0.4314.50');
  assert.match(load.cleanup, /awaited.*completed/);
  assert.equal(Date.parse(load.observedAtUtc) < Date.parse(red.observedAtUtc), true);
  assert.match(json('evidence', 'iac-na.json').recordedAfter, /2026-11-04T00:49:59\.560Z/);
});

test('working-tree raw byte hashes and canonical Git LF source hashes are distinct and read-only', () => {
  const proof = json('evidence', 'source-hashes.json');
  assert.equal(proof.cardId, 'A-S124');
  assert.equal(proof.normalVerification, 'READ-ONLY');
  assert.match(proof.canonicalPolicy, /canonical Git LF.*raw.*CRLF.*-text -eol/);
  for (const [file, expected] of Object.entries(proof.files)) {
    const bytes = read(file);
    assert.equal([expected.workingTreeSha256, expected.canonicalGitSha256].includes(hash(bytes)), true,
      `Captured raw or canonical-checkout source bytes: ${file}`);
    assert.equal(hash(canonical(bytes)), expected.canonicalGitSha256, `Canonical source bytes: ${file}`);
    assert.equal(canonical(bytes).includes(13), false);
  }
  const attributes = read('.gitattributes').toString();
  assert.match(attributes, /evidence\/raw\/\*\.json -text -eol -diff/);
  assert.match(attributes, /evidence\/red-stub\/\*\.cjs -text -eol -diff/);
  assert.doesNotMatch(attributes, /^\* -text/m);
});

test('preserved verification limitations are not mislabeled as GREEN or behavioral implementation RED', () => {
  const notes = json('evidence', 'verification-notes.json');
  assert.equal(notes.additionalCredits, 0);
  for (const entry of notes.preservedFailures) {
    const proof = json('evidence', ...entry.proof.split('/'));
    assert.equal(proof.exitCode, 1);
  }
  const firstCSP = notes.preservedFailures[1];
  assert.equal(json('evidence', ...firstCSP.failedObservationRecord.split('/')).checksPassed, false);
  assert.equal(hash(read('evidence', ...firstCSP.originalAssertionSnapshot.split('/'))), firstCSP.originalAssertionSha256);
  assert.equal(firstCSP.productionProbeLoaded, false);
  assert.equal(firstCSP.securityFlagsWeakened, false);
});

test('fixed published tooling is qualified only for the actual bounded local browser observations', () => {
  const tooling = json('evidence', 'raw', 'tooling-preflight.json');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /CN=Microsoft Corporation/);
  assert.equal(tooling.nodeVersion, 'v22.23.4');
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.equal(tooling.edgeVersion, '156.0.4314.50');
  assert.equal(tooling.browserHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  for (const field of ['packagesInstalled', 'browserDownloaded', 'unsafeFlagsUsed', 'inactivePrototypeUsed',
    'productionNode24Validated', 'nativeProof']) assert.equal(tooling[field], false);
  const records = fs.readdirSync(path.join(__dirname, 'evidence', 'raw'))
    .filter((name) => /^browser-.*\.json$/.test(name))
    .map((name) => json('evidence', 'raw', name));
  const verified = records.filter((record) => record.checksPassed);
  assert.equal(verified.length > 0, true, 'A genuine successful recorded browser run must exist');
  for (const record of verified) {
    assert.equal(record.mode, 'actual-isolated-headless-browser');
    assert.equal(record.browserVersion, '156.0.4314.50');
    assert.equal(record.helperSha256, tooling.browserHelperSha256);
    assert.deepEqual(record.pageErrors, []);
    assert.deepEqual(record.remoteRequests, []);
    assert.equal(record.existingOwnedBytesUnchanged, true);
    assert.match(record.cleanup, /awaited.*completed/);
    assert.equal(record.additionalCredits, 0);
    assert.equal(record.observations.some((item) => item.name === 'actual-CSP-enforcement'), true);
    assert.equal(record.observations.some((item) => item.name === 'actual-resource-failure-startup-UX'), true);
    assert.equal(record.observations.some((item) => item.name === 'measured-dependency-outage'), true);
    assert.equal(record.observations.some((item) => item.name === 'keyboard-reset-with-shadowed-native-method'), true);
    const csp = record.observations.find((item) => item.name === 'actual-CSP-enforcement');
    assert.equal(csp.evalMethod, 'Normal page-loaded test script; not DevTools-evaluated code');
    assert.deepEqual(csp.policy.evalProbe, { evalBlocked: true, errorName: 'EvalError' });
    assert.equal(csp.policy.evalRan, false);
    assert.equal(csp.policy.violations.some((item) => item.blockedURI === 'eval'), true);
  }
});

test('production has no cloud interfaces or unsafe code; declarations, CSP and capture guards are explicit', () => {
  const production = `${read('model.js')}\n${read('app.js')}`;
  assert.doesNotMatch(production, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|new\s+Function\b/);
  assert.doesNotMatch(production, /\b(?:localStorage|sessionStorage|indexedDB|sendBeacon)\b|innerHTML|document\.write/);
  const html = read('index.html').toString();
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'",
    "img-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'"]) assert.equal(html.includes(directive), true);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\/|<script[^>]*>[^<\s]/);
  assert.doesNotMatch(html, /csp-probe\.js/);
  assert.match(read('app.js').toString(), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('app.js').toString(), /HTMLFormElement\.prototype\.reset\.call\(routingForm\)/);
  const browser = read('browser.test.cjs').toString();
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /finally \{\s*await session\.close\(\)/);
  assert.doesNotMatch(browser, /bypassCSP|--no-sandbox|ignoreHTTPSErrors|openIsolatedLoopback/);
  const declarations = read('model.d.ts').toString();
  assert.match(declarations, /readonly independentDependencies: false/);
  assert.match(declarations, /readonly independentFaultDomains: 'unverified'/);
  assert.match(declarations, /percent: 100/);
  for (const fixture of Object.keys(model.FIXTURES)) assert.equal(declarations.includes(`'${fixture}'`), true);
});
