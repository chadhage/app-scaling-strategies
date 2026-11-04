'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const model = require(path.join(root, 'model.js'));
const read = (relative) => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = json('manifest.json');

test('manifest binds the exact original source, frozen class, packet and teaching-only authority', () => {
  assert.equal(manifest.cardId, 'A-S115');
  assert.equal(manifest.sourceId, 'S115');
  assert.equal(manifest.parentId, 'D-S115');
  assert.equal(manifest.kanoUnit, 'A-S115');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S115');
  assert.equal(manifest.objective, 'Compare warm/cold standby; a healthy shallow endpoint is not complete readiness.');
  assert.equal(manifest.banner, model.BANNER);
  assert.equal(manifest.mode, 'fixed-fictional-teaching-data-only');
  for (const key of ['networkCalls', 'credentials', 'actualFaults', 'nativeProof', 'sourceParentComplete', 'productionNode24Validated']) {
    assert.equal(manifest.limits[key], false);
  }
  assert.equal(manifest.limits.additionalTestRepairOrProofCredits, 0);
});

test('declared fixed inputs, traces and bounds match executable lesson data', () => {
  assert.deepEqual(manifest.fixtures, model.FIXTURES.map((fixture) => fixture.id));
  assert.deepEqual(manifest.syntheticInputAndTrace.clientBudgetMsChoices, model.BUDGETS);
  assert.equal(manifest.syntheticInputAndTrace.demandCapacityUnits, model.DEMAND_UNITS);
  assert.equal(manifest.limits.maximumChecksPerInMemorySession, model.MAX_CHECKS);
  assert.deepEqual(manifest.syntheticInputAndTrace.warmPhaseMs, model.FIXTURES[0].recoveryPhases.map((phase) => phase.durationMs));
  assert.deepEqual(manifest.syntheticInputAndTrace.coldPhaseMs, model.FIXTURES[1].recoveryPhases.map((phase) => phase.durationMs));
  assert.ok(manifest.preconditions.length >= 3 && manifest.actions.length === 4 && manifest.expectedAssertions.length >= 8);
});

test('the exact immutable README S115/S097 and D-S115 acceptance rows are retained', () => {
  const contract = json('evidence/source-contract.json');
  assert.equal(contract.packet, 'SC-S115');
  assert.equal(contract.kanoUnit, 'A-S115');
  assert.equal(contract.sourceParentComplete, false);
  assert.equal(contract.sourceRevision, '8e7fb3cbcc61d3aa85116204735f10687f608b1c');
  const readme = read('evidence/raw/readme-source.txt');
  assert.ok(readme.includes('| S115 | **Active-passive standby:** Demonstrate that standby compute, caches, dependencies, and state are genuinely ready. |'));
  assert.ok(readme.includes('| S097 | **Rollback destination becomes cold:** Keep rollback capacity ready throughout its promised retention window. |'));
  const backlog = read('evidence/raw/backlog-source.txt');
  assert.ok(backlog.includes('| D-S115 | P2 | Add active-passive warm/cold standby comparisons across two regions. | Compute, cache, dependency access, state, and client recovery are measured; a shallow healthy endpoint cannot certify standby readiness. | P006, D-S021, D-S022 |'));
  assert.match(contract.distinction, /S097.*retention window.*LP-COMPARE/);
});

test('retained source fragments and full original Git blobs match their declared hashes', () => {
  for (const source of json('evidence/source-contract.json').sources) {
    const bytes = fs.readFileSync(path.join(root, ...source.retainedPath.split('/')));
    assert.equal(sha(bytes), source.sha256);
    assert.equal(bytes.toString('utf8'), source.exactText);
    const reference = `${json('evidence/source-contract.json').sourceRevision}:${source.gitPath}`;
    const blob = spawnSync('git', ['show', reference], { cwd: repo });
    assert.equal(blob.status, 0, blob.stderr.toString());
    assert.equal(sha(blob.stdout), source.wholeBlobSha256);
    const oid = spawnSync('git', ['rev-parse', reference], { cwd: repo });
    assert.equal(oid.status, 0, oid.stderr.toString());
    assert.equal(oid.stdout.toString().trim(), source.blobOid);
  }
});

test('portable card and default packet do not borrow S097 or native completion', () => {
  const source = read('evidence/raw/card-portable-packet-source.txt');
  assert.ok(source.includes('| A-S115 | D-S115 | S | Compare warm/cold standby; a healthy shallow endpoint is not complete readiness. | SOURCE |'));
  assert.ok(source.includes('### Portable A-card lesson contract'));
  assert.ok(source.includes('standalone, browser-openable lesson bundle'));
  assert.ok(source.includes('every other A/B card belongs to SC-Snnn'));
  assert.equal(manifest.nativeRemainder.cardId, 'B-S115');
  assert.equal(manifest.nativeRemainder.portableLessonDoesNotRemoveGates, true);
});

test('loadable genuine assertion RED and raw non-discovered replay remain byte-exact', () => {
  const red = json('evidence/red.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.replayExitCode, 1);
  assert.equal(red.failure, 'ERR_ASSERTION');
  assert.equal(red.expected, 'failure');
  assert.equal(red.actual, 'success');
  assert.equal(red.stubLoadable, true);
  assert.equal(red.missingDependencyFailure, false);
  for (const file of red.files) {
    const bytes = fs.readFileSync(path.join(root, ...file.path.split('/')));
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha(bytes), file.sha256);
  }
  assert.match(read('evidence/raw/red.tap.txt'), /ERR_ASSERTION/);
  assert.match(read('evidence/raw/red-replay.tap.txt'), /ERR_ASSERTION/);
  assert.match(read('.gitattributes'), /evidence\/raw\/\*\* -text -diff -merge/);
});

test('IaC N/A is explicit after RED and does not grant cloud or native authority', () => {
  const iac = json('evidence/iac.json');
  assert.equal(iac.applicability, 'N/A');
  assert.equal(iac.stage, 'after genuine behavioral RED, before implementation');
  for (const key of ['infrastructureGenerated', 'cloudExecuted', 'identityRegistered', 'credentialsUsed', 'deploymentPerformed', 'spendAuthorized', 'sourceParentComplete']) {
    assert.equal(iac[key], false);
  }
});

test('HTML is labelled, keyboard-native, local-only and does not shadow form.reset', () => {
  const html = read('index.html');
  assert.ok(html.includes(`id="training-banner">${model.BANNER}</p>`));
  assert.match(html, /<label for="standby">/);
  assert.match(html, /<label for="budget">/);
  assert.match(html, /id="clear-current" type="button"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'", "form-action 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive));
  }
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(read('app.js'), /innerHTML|localStorage|sessionStorage|\bfetch\(|XMLHttpRequest|WebSocket|EventSource/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('styles.css'), /:focus-visible/);
});
