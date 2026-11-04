'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const evidence = require(path.join(__dirname, '..', 'scripts', 'evidence.cjs'));
const directory = path.join(evidence.ROOT, 'evidence', 'browser');
const manifest = JSON.parse(fs.readFileSync(path.join(evidence.ROOT, 'manifest.json'), 'utf8'));
const recordPath = path.join(evidence.ROOT, ...manifest.evidence.browser.split('/'));
assert.equal(path.dirname(recordPath), directory);
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const group = (name) => {
  const observed = record.groups.find((entry) => entry.name === name);
  assert.ok(observed && observed.passed, `Missing actual observation: ${name}`);
  return observed.details;
};

test('actual browser observation uses exact card, published helper and approved local tooling', () => {
  assert.equal(record.cardId, 'A-S121');
  assert.equal(record.workerId, 'worker-A-S121');
  assert.equal(record.packet, 'SC-S121');
  assert.equal(record.sourceId, 'S121');
  assert.match(record.mode, /actual isolated file-browser/);
  assert.equal(record.helper.rawSha256, evidence.HELPER_SHA256);
  assert.equal(record.helper.publishedCommit, '53c0c0d');
  assert.equal(record.helper.lifecyclePrototypeQualified, false);
  assert.equal(record.playwrightVersion, '1.56.1');
  assert.match(record.nodeVersion, /^v22\./);
  assert.match(record.browserVersion, /^156\./);
  assert.equal(record.nativeClaim, false);
  assert.equal(record.sourceParentComplete, false);
  assert.equal(record.fiveNinesProven, false);
  assert.equal(record.additionalKanoCredits, 0);
});

test('all eighteen named actual DOM groups completed without omitted checks', () => {
  assert.deepEqual(record.groups.map((entry) => entry.name), evidence.BROWSER_GROUPS);
  assert.ok(record.groups.every((entry) => entry.passed));
  const load = group('load-banner-and-boundary');
  assert.equal(load.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(load.phase, 'baseline');
  assert.match(load.nativeClaim, /^UNVERIFIED/);
});

test('actual keyboard, visible focus, recoverable input alerts and non-erasing reset were observed', () => {
  const keyboard = group('keyboard-positive-prepared');
  assert.deepEqual(keyboard.keyboard, ['Tab', 'Tab', 'Space', 'Tab', 'Enter', 'Enter']);
  assert.equal(keyboard.focus, 'request-promotion');
  assert.equal(keyboard.focusOutline, '3px');
  assert.equal(keyboard.phase, 'prepared');
  const reset = group('reset-retains-evidence-and-allowance');
  assert.equal(reset.phase, 'baseline');
  assert.equal(reset.retainedHistoryRows, 4);
  assert.match(reset.allowance, /^12 accepted/);
  assert.equal(group('acknowledgement-error-recovery').recovered, true);
  assert.match(group('acknowledgement-error-recovery').error, /Acknowledge/);
  assert.equal(group('typed-selection-error-recovery').recoveredFixedOptions, 9);
  assert.match(group('typed-selection-error-recovery').error, /fixed teaching case/);
});

test('desired promotion and declared/healthy readiness never became completed migration evidence', () => {
  const wished = group('wished-is-not-observed');
  assert.match(wished.desired, /win-code-v2/);
  assert.match(wished.observed, /win-code-v1/);
  assert.equal(wished.counts, '0 / 0 / 0 / 0');
  for (const name of ['production-target-negative', 'declared-configuration-unknown',
    'healthy-200-negative', 'effective-setting-negative', 'state-compatibility-negative']) {
    const observed = group(name);
    assert.equal(observed.phase, 'blocked');
    assert.equal(observed.counts, '0 / 0 / 0 / 0');
    assert.match(observed.nativeClaim, /^UNVERIFIED/);
  }
  assert.equal(group('declared-configuration-unknown').classification, 'unverified');
  assert.ok(group('healthy-200-negative').gates.some((text) =>
    text.includes('shallow HTTP 200; dependency check failed')));
});

test('positive, unknown, pinned-old and recycled-worker client outcomes remain separately attributed', () => {
  assert.equal(group('completed-synthetic-journeys').counts, '3 / 3 / 0 / 0');
  for (const name of ['missing-routing-unknown', 'unfinished-journey-unknown',
    'pinned-client-no-migration-proof']) {
    assert.equal(group(name).counts, '3 / 2 / 0 / 1');
    assert.equal(group(name).classification, 'unverified-transition');
  }
  const failed = group('former-worker-failure-retained');
  assert.match(failed.failedReceipt, /volatile work abandoned/);
  assert.equal(failed.countsBeforeReset, '3 / 2 / 1 / 0');
  assert.equal(failed.retainedFailedReceiptVisible, true);
  assert.equal(failed.retainedHistoryRows, 4);
});

test('actual exhausted allowance error and reset kept earlier failed evidence and zero remaining budget', () => {
  const exhausted = group('exhausted-allowance-error-reset');
  assert.match(exhausted.error, /allowance is exhausted/);
  assert.match(exhausted.allowanceAfterReset, /^0 accepted/);
  assert.equal(exhausted.retainedHistoryRows, 16);
  assert.match(exhausted.nativeClaim, /^UNVERIFIED/);
});

test('actual CSP enforcement produced four directive observations, not a static policy-only claim', () => {
  const csp = group('real-CSP-enforcement');
  for (const flag of ['inlineBlocked', 'handlerBlocked', 'evalBlocked', 'connectBlocked']) {
    assert.equal(csp[flag], true);
  }
  const directives = csp.violations.map((entry) => entry.effectiveDirective);
  for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src']) {
    assert.ok(directives.includes(directive));
  }
  assert.ok(csp.violations.every((entry) => entry.disposition === 'enforce'));
});

test('awaited finally cleanup closed this browser and ordinary replay left the owned tree untouched', () => {
  assert.deepEqual(record.pageErrors, []);
  assert.deepEqual(record.nonFileRequests, []);
  assert.equal(record.cleanup.awaitedFinallyClose, true);
  assert.equal(record.cleanup.pageClosed, true);
  assert.equal(record.cleanup.browserDisconnected, true);
  assert.equal(record.verificationReadOnlyBeforeCapture, true);
});

test('original raw source archive and every report SHA bind actual observations to current exact bytes', () => {
  const bytes = fs.readFileSync(path.join(directory, record.sourceArchive));
  assert.equal(evidence.sha256(bytes), record.sourceArchiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
  assert.match(archive.format, /original source bytes/);
  assert.deepEqual(Object.keys(archive.files).sort(), evidence.sourceFiles());
  assert.deepEqual(record.sourceHashes, evidence.sourceHashes());
  for (const [relative, expected] of Object.entries(archive.files)) {
    const archived = Buffer.from(expected.base64, 'base64');
    const current = fs.readFileSync(path.join(evidence.ROOT, relative));
    assert.equal(evidence.sha256(archived), expected.rawSha256, relative);
    assert.equal(archived.length, expected.byteLength, relative);
    assert.deepEqual(archived, current, relative);
    assert.equal(record.sourceHashes[relative], expected.rawSha256, relative);
  }
});
