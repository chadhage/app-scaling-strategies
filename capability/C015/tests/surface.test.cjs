'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const snapshot = require('..\\observed-snapshot.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
test('the exact training banner, local snapshot boundaries and original frozen D are visible', () => {
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.match(html, /does not write files, restart a process, reread live storage/);
  assert.match(html, /H001, H004, cloud execution, and production Node 24 remain incomplete/);
  assert.equal(manifest.cardId, 'C015');
  assert.equal(manifest.kanoUnit, 'C015');
  assert.equal(manifest.kano, 'D');
  assert.equal(manifest.packet, 'H001');
  assert.equal(manifest.extraCreditsForTestsEvidenceOrRefinement, 0);
});

test('static browser source has no execution path, network, browser storage or HTML interpolation', () => {
  assert.doesNotMatch(app, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|Worker|eval)\b|\binnerHTML\b|\.insertAdjacentHTML/);
  assert.doesNotMatch(html, /<script[^>]*>[^<\s]|onclick=|onsubmit=|https?:\/\//i);
  assert.match(html, /script-src 'self'/);
  for (const directive of ['connect-src', 'object-src', 'base-uri', 'form-action', 'frame-src', 'worker-src']) {
    assert.ok(html.includes(`${directive} 'none'`), directive);
  }
  assert.match(app, /actualFilesystemOperationNow: false/);
  assert.match(app, /UNKNOWN_RUN_ID/);
  assert.match(app, /UNKNOWN_SCOPE/);
  assert.match(app, /LOCAL_ONLY/);
});

test('read-only bundled values exactly match actual raw writer and fresh reader capture, not a prediction', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'evidence', snapshot.evidenceFile), 'utf8'));
  assert.equal(raw.passed, true);
  assert.equal(raw.source, snapshot.source);
  assert.equal(raw.capturedAtUtc, snapshot.capturedAtUtc);
  assert.deepEqual(snapshot.runs, raw.runs.map(({ files, ...run }) => run));
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.runs[0].result.state));
  for (const run of snapshot.runs) {
    assert.equal(run.result.writesPerformed, 0);
    assert.ok(!run.writerPids.includes(run.readerPid));
    assert.equal(run.result.powerLossGuarantee, false);
  }
});

test('both C001/C002 contracts are consumed read-only rather than replacing their envelope schema', () => {
  const contract = fs.readFileSync(path.join(root, 'contract.cjs'), 'utf8');
  const consent = fs.readFileSync(path.join(root, 'consent.cjs'), 'utf8');
  const types = fs.readFileSync(path.join(root, 'store.d.ts'), 'utf8');
  const ps = fs.readFileSync(path.join(root, 'consent-current.ps1'), 'utf8');
  assert.match(contract, /C002\\\\validator\.js/);
  assert.match(contract, /C002\\\\synthetic-fixture\.js/);
  assert.match(consent, /C001\\\\contract-guard\.js/);
  assert.match(types, /import type.*RunEnvelope.*RunEnvelopeLimits/);
  assert.match(ps, /Local\\AppScalingStrategies_KanbanState_v1/);
  assert.match(ps, /finally/);
  assert.match(ps, /ReleaseMutex/);
  assert.match(ps, /\.Dispose\(\)/);
  assert.doesNotMatch(contract, /requestsPerSecond:.*type:|liveAzureRuns:.*const:/);
});

test('the exact parent-approved standard publisher preserves the mutex, remote HEAD gate, scoped D commit, annotation and atomic push', () => {
  const boundary = JSON.parse(fs.readFileSync(path.join(root, 'publisher-boundary.json'), 'utf8'));
  const bytes = fs.readFileSync(path.resolve(root, '..', '..', boundary.standardPublisher));
  const { createHash } = require('node:crypto');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), boundary.parentApprovedSha256);
  const publisher = bytes.toString('utf8');
  assert.match(publisher, /Local\\AppScalingStrategies_KanbanPublisher_v1/);
  assert.match(publisher, /C015='D'/);
  assert.ok(publisher.indexOf('$mutex.WaitOne') < publisher.indexOf("Run-Git @('rev-parse','HEAD')"));
  assert.ok(publisher.indexOf('if($head -ne $remoteBeforeCommit)') < publisher.indexOf("Run-Git (@('add'"));
  assert.ok(publisher.includes('$Message.StartsWith("[$CardId][$kanoClass]")'));
  assert.match(publisher, /'commit',\s*'--only'/);
  assert.match(publisher, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
  assert.match(publisher, /'tag',\s*'-a'/);
  assert.ok(publisher.includes('kanban/$CardId/$short'));
  assert.match(publisher, /'push',\s*'--atomic'/);
  assert.match(publisher, /'merge-base',\s*'--is-ancestor'/);
  assert.doesNotMatch(publisher, /'reset'|'amend'|'--force'|'add', '\.'|Remove-Item|\.docs\\wiki\\.*Write/);
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.ok(attributes.includes('evidence/*.raw -text whitespace=cr-at-eol,-blank-at-eol'));
  for (const glob of ['evidence/*.raw.json', 'evidence/*.snapshot', 'fixtures/**']) {
    assert.ok(attributes.includes(`${glob} -text whitespace=cr-at-eol`));
  }
  assert.equal(fs.existsSync(path.join(root, 'publish.ps1')), false);
  assert.equal(boundary.sharedSourceEdits, 0);
  assert.equal(boundary.retiredOwnedAdapterExecutableRemoved, true);
});
