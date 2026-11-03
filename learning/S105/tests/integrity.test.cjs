'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, ...file.split('/')), 'utf8');
const json = (file) => JSON.parse(read(file));
const source = json('evidence/source.json');
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(evidence, ...entry.file.split('/'))));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  return bytes;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));

test('raw working bytes and canonical Git blobs are independently qualified, not conflated', () => {
  assert.equal(source.card.id, 'A-S105');
  assert.equal(source.card.kano, 'S');
  assert.equal(source.card.kanoUnit, 'A-S105');
  assert.equal(source.card.packet, 'SC-S105');
  for (const entry of source.entries) {
    const working = raw(entry.working);
    const canonical = raw(entry.canonicalGit);
    const canonicalGit = execFileSync('git', ['show', `${entry.canonicalCommit}:${entry.source}`], { cwd: repo });
    assert.deepEqual(canonical, canonicalGit);
    assert.equal((working.toString('utf8').match(/\r\n/g) || []).length, entry.working.crlf);
    assert.equal((canonical.toString('utf8').match(/\r\n/g) || []).length, entry.canonicalGit.crlf);
    const normalized = Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(hash(normalized), entry.workingLfSha256);
    assert.equal(normalized.equals(canonical), entry.workingLfEqualsCanonical);
    assert.equal(working.equals(canonical), entry.workingEqualsCanonicalBytes);
    assert.ok(entry.working.crlf > 0);
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.notEqual(entry.working.sha256, entry.canonicalGit.sha256);
  }
});

test('exact source acceptance, original inventory and portable contract remain distinguishable', () => {
  const expected = {
    readme: {
      S105: '| S105 | **Non-swapped configuration:** Validate managed identity, networking, and other slot-specific properties at the effective destination. |',
    },
    backlog: {
      'D-S105': '| D-S105 | P1 | Add non-swapped identity/network/configuration differences and effective-destination validation. | Real slot-specific settings/access are observed after transition; mistaken assumptions about swapped identity/configuration fail visibly. | P001, D-S024 |',
    },
    kanban: {
      'A-S105': '| A-S105 | D-S105 | S | Swap settings with distinct identities/networks; identify properties that do not move. | SOURCE |',
      'B-S105': '| B-S105 | D-S105 | S | Conduct one native slot-configuration transition; verify effective identity/network access after swap. | CORE, DATA, ASANY, C064 |',
    },
  };
  for (const entry of source.entries.filter((item) => item.name !== 'helper')) {
    const current = fs.readFileSync(path.join(repo, ...entry.source.split('/')), 'utf8');
    for (const snapshot of [raw(entry.working).toString('utf8'), raw(entry.canonicalGit).toString('utf8'), current]) {
      for (const [id, exact] of Object.entries(expected[entry.name])) assert.equal(row(snapshot, id), exact);
      if (entry.name === 'kanban') {
        assert.ok(snapshot.includes('### Portable A-card lesson contract'));
        assert.ok(snapshot.includes('**Training rehearsal - synthetic data - not a live Azure result**'));
        assert.ok(snapshot.includes('A worker cannot award its own Done credit.'));
        assert.ok(snapshot.includes('Subdivision preserves the original `kanoUnit`'));
        assert.ok(snapshot.includes('Packets group evidence, not execution'));
      }
    }
  }
  assert.deepEqual(source.card.parents, ['D-S105']);
  assert.equal(source.card.technicalEntryGate, 'SOURCE');
});

test('only the exact approved published helper bytes and API are qualified', () => {
  const helper = source.entries.find((entry) => entry.name === 'helper');
  const current = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(hash(current), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(helper.canonicalCommit, '53c0c0d');
  assert.equal(helper.canonicalGit.sha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.deepEqual(raw(helper.working), current);
  const runner = read('tools/browser.cjs');
  assert.match(runner, /openIsolatedLesson\(/);
  assert.match(runner, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(runner, /openIsolatedLoopback|chromium\.launch|bypassCSP:\s*true|--no-sandbox|disable-web-security/);
});

test('raw byte attributes are narrowly established before evidence and RED is not test-discoverable', () => {
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text$/m);
  const target = 'learning/S105/evidence/raw/source/readme.working.raw.gz';
  const attributes = execFileSync('git', ['check-attr', 'text', 'eol', '--', target], { cwd: repo, encoding: 'utf8' });
  assert.ok(attributes.includes(': text: unset'));
  assert.ok(attributes.includes(': eol: unspecified'));
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [entry.name]);
  assert.ok(walk(path.join(evidence, 'raw')).every((file) => file.endsWith('.raw.gz')));
});

test('actual loadable-stub assertion RED preceded resource-free IaC N/A and implementation', () => {
  const red = json('evidence/red-001.json');
  const na = json('evidence/iac-na.json');
  assert.equal(red.status, 1);
  assert.equal(red.precheck.status, 0);
  assert.equal(red.acceptedResult, true);
  assert.match(raw(red.precheck.stdout).toString('utf8'), /Loadable stub API/);
  const stdout = raw(red.stdout).toString('utf8');
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /serving-v1/);
  assert.match(stdout, /candidate-v2/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError/);
  raw(red.stderr);
  for (const snapshot of red.snapshots) raw(snapshot);
  assert.equal(na.previousStageSha256, hash(fs.readFileSync(path.join(evidence, 'red-001.json'))));
  assert.equal(na.stage, 'IaC N/A');
  assert.equal(na.stubUnchangedAtThisStage, true);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(na.recordedAtUtc));
  const stub = red.snapshots.find((snapshot) => snapshot.source === 'model.js');
  assert.notEqual(hash(fs.readFileSync(path.join(root, 'model.js'))), stub.sha256);
  assert.equal(hash(fs.readFileSync(path.join(root, 'lesson.feature'))), red.snapshots.find((snapshot) => snapshot.source === 'lesson.feature').sha256);
});

test('manifest preserves one synthetic original S unit and explicitly leaves native/source acceptance incomplete', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S105');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S105');
  assert.equal(manifest.packet, 'SC-S105');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.nativeSibling, 'B-S105');
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.equal(manifest.objective, source.card.deliver);
  assert.equal(manifest.syntheticInput.maxRehearsals, 6);
  assert.equal(manifest.syntheticInput.maxHistoryEvents, 12);
  assert.ok(manifest.sourceAcceptance.startsWith('Real slot-specific'));
  assert.match(manifest.sourceQualification, /fictional teaching data only/);
  assert.match(read('README.txt'), /source parent or native sibling is Done/);
});

test('native To Do refinement retains the original unit and actual blockers without admitting or completing it', () => {
  const remainder = json('remainder.json');
  assert.equal(remainder.relatedCardId, 'B-S105');
  assert.equal(remainder.originalKanoUnit, 'B-S105');
  assert.equal(remainder.parentId, 'D-S105');
  assert.equal(remainder.packet, 'SC-S105');
  assert.equal(remainder.recommendedState, 'To Do');
  assert.equal(remainder.readiness, false);
  assert.equal(remainder.boardStateChangedByThisFile, false);
  assert.equal(remainder.newCards, 0);
  assert.equal(remainder.additionalKanoCredits, 0);
  assert.deepEqual(remainder.technicalEntryGates, ['CORE', 'DATA', 'ASANY', 'C064']);
  assert.match(remainder.blocker, /Synthetic fixture values and access observations do not satisfy/);
});

test('standalone page uses restrictive CSP, safe text rendering and no live operation APIs', () => {
  const html = read('index.html');
  const js = read('lesson.js');
  const publicSource = html + js + read('model.js');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(rule));
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<iframe|<object|(?:name|id)="reset"/i);
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|\.reset\(/);
  assert.doesNotMatch(publicSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|document\.cookie|serviceWorker|eval\s*\(|new Function/);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(js.includes('error.focus()'));
  assert.ok(js.includes('fixture.focus()'));
});

test('actual browser transcript proves the local observations and preserves the earlier tooling failure honestly', () => {
  const failed = json('evidence/browser-001.json');
  assert.equal(failed.outcome, 'failed');
  const failedTranscript = JSON.parse(raw(failed.transcript).toString('utf8'));
  assert.equal(failedTranscript.steps.length, 0);
  assert.match(failedTranscript.failure.message, /powershell\.exe|security module|Microsoft\.PowerShell\.Security/);
  const passedFiles = fs.readdirSync(evidence).filter((file) => /^browser-\d{3}\.json$/.test(file))
    .sort().map((file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8')))
    .filter((record) => record.outcome === 'passed');
  assert.ok(passedFiles.length > 0);
  const passed = passedFiles.at(-1);
  const transcript = JSON.parse(raw(passed.transcript).toString('utf8'));
  assert.equal(transcript.steps.length, 15);
  assert.equal(transcript.preflight.signatureStatus, 'Valid');
  assert.match(transcript.preflight.signer, /CN=Microsoft Corporation/);
  assert.equal(transcript.browserVersion, '156.0.4314.50');
  assert.deepEqual(transcript.pageErrors, []);
  assert.equal(transcript.closeAwaited, true);
  assert.equal(transcript.pageClosed, true);
  assert.equal(transcript.ownedTreeUnchangedBeforeCapture, true);
  assert.ok(transcript.requestedUrls.every((url) => url.startsWith('file:') || url.startsWith('data:')));
  const steps = transcript.steps;
  assert.equal(steps[1].dom.result, 'unknown');
  assert.equal(steps[2].dom.result, 'negative');
  assert.equal(steps[3].dom.result, 'positive');
  assert.equal(steps[5].dom.result, 'unknown');
  assert.match(steps[6].dom.status, /Separate destination access: positive/);
  assert.match(steps[7].dom.error.text, /^FIXTURE:/);
  assert.equal(steps[7].dom.history.length, 10);
  assert.equal(steps[9].dom.history.length, 12);
  assert.equal(steps[10].dom.history.length, 0);
  assert.equal(steps[10].dom.focus, 'fixture');
  assert.match(steps[11].dom.error.text, /^PREDICTION:/);
  assert.equal(steps[12].dom.error.hidden, true);
  const csp = steps[13].csp;
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.handlerExecuted, false);
  assert.equal(csp.connectionBlocked, true);
  for (const directive of ['script-src-elem', 'script-src-attr', 'connect-src']) {
    assert.ok(csp.violations.some((entry) => entry.directive === directive));
  }
  assert.match(steps[14].dom.error.text, /^MODEL_UNAVAILABLE:/);
  assert.ok(steps[14].dom.controls.every((control) => control.disabled));
  for (const snapshot of passed.snapshots) {
    assert.equal(hash(fs.readFileSync(path.join(root, ...snapshot.source.split('/')))), snapshot.sha256);
  }
});

test('every retained run record has verifiable raw output and source provenance', () => {
  const records = fs.readdirSync(evidence).filter((file) => /^(?:red|green|syntax|browser)-\d{3}\.json$/.test(file));
  assert.ok(records.includes('red-001.json'));
  for (const file of records) {
    const record = JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
    if (record.stdout) raw(record.stdout);
    if (record.stderr) raw(record.stderr);
    if (record.transcript) raw(record.transcript);
    if (record.preflight) raw(record.preflight);
    for (const snapshot of record.snapshots || []) raw(snapshot);
    if (record.stage === 'browser' && record.outcome === 'passed') {
      assert.equal(record.closeAwaited, true);
      assert.equal(record.ownedTreeUnchangedBeforeCapture, true);
      assert.equal(record.nodeProduction24Validated, false);
      assert.equal(record.nativeValidated, false);
    }
  }
});
