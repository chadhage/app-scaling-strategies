'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const { hash, tree } = require('../tools/proof.cjs');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const read = (relative) => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(evidence, ...entry.file.split('/'))));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  if (Object.hasOwn(entry, 'crlf')) assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const source = json('evidence/source.json');

test('the exact README, backlog, portable A contract, frozen card and SC-S108 packet are preserved', () => {
  const expected = {
    readme: {
      S108: '| S108 | **WAF/policy differences:** Ensure valid candidate application requests and assets are not unexpectedly blocked. |',
    },
    backlog: {
      'D-S108': '| D-S108 | P1 | Add approved sandbox WAF/policy differences against benign valid requests. | Unexpected blocks of valid journeys/assets are detected and policy recovery is verified; rules affect only leased routes. | P006 |',
    },
    kanban: {
      'A-S108': '| A-S108 | D-S108 | S | Apply a mismatched WAF policy to valid traffic; detect blocked journeys/assets. | SOURCE |',
      'B-S108': '| B-S108 | D-S108 | S | Conduct one bounded leased-route policy comparison; verify actual benign request effects and restoration. | CORE, DATA, HOST, C094 |',
    },
  };
  for (const entry of source.entries.filter((item) => item.name !== 'helper')) {
    const current = fs.readFileSync(path.join(repo, ...entry.source.split('/')), 'utf8');
    for (const snapshot of [raw(entry.working).toString('utf8'), raw(entry.canonicalGit).toString('utf8'), current]) {
      for (const [id, exact] of Object.entries(expected[entry.name])) assert.equal(row(snapshot, id), exact);
      if (entry.name === 'kanban') {
        assert.ok(snapshot.includes('### Portable A-card lesson contract'));
        assert.ok(snapshot.replace(/\r\n/g, '\n').includes(source.portableA.text.replace(/\r\n/g, '\n')));
        assert.ok(snapshot.includes('A worker cannot award its own Done credit.'));
        assert.ok(snapshot.includes('Subdivision preserves the original `kanoUnit`'));
      }
    }
  }
  assert.equal(source.card.id, 'A-S108');
  assert.equal(source.card.kano, 'S');
  assert.equal(source.card.kanoUnit, 'A-S108');
  assert.equal(source.card.packet, 'SC-S108');
  assert.equal(source.card.technicalEntryGate, 'SOURCE');
  assert.deepEqual(source.card.parents, ['D-S108']);
  assert.equal(source.packet.id, 'SC-S108');
  assert.deepEqual(source.packet.originalMembers.map((card) => card.id), ['A-S108', 'B-S108']);
  assert.equal(source.packet.additionalCredits, 0);
});

test('working CRLF bytes and immutable canonical Git blobs have independently checked raw provenance', () => {
  for (const entry of source.entries) {
    const working = raw(entry.working);
    const canonical = raw(entry.canonicalGit);
    assert.deepEqual(canonical, execFileSync('git', ['--no-pager', 'show', `${entry.canonicalCommit}:${entry.source}`], { cwd: repo }));
    assert.equal(hash(lf(working)), entry.workingLfSha256);
    assert.equal(lf(working).equals(canonical), entry.workingLfEqualsCanonical);
    assert.equal(working.equals(canonical), entry.workingEqualsCanonicalBytes);
    assert.ok(entry.working.crlf > 0, `${entry.name} historical working bytes were CRLF`);
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.notEqual(entry.working.sha256, entry.canonicalGit.sha256);
  }
  const bytes = Buffer.from('first\r\nsecond\r\n');
  assert.notDeepEqual(bytes, lf(bytes));
  assert.notEqual(hash(bytes), hash(lf(bytes)));
  assert.deepEqual(lf(bytes), Buffer.from('first\nsecond\n'));
});

test('raw attributes were established early and preserved RED sources are not auto-discoverable', () => {
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text$/m);
  const attributes = execFileSync('git', ['check-attr', 'text', 'eol', '--', 'learning\\S108\\evidence\\raw\\source\\readme.working.raw.gz'],
    { cwd: repo, encoding: 'utf8' });
  assert.match(attributes, /text: unset/);
  assert.match(attributes, /eol: unspecified/);
  const rawFiles = tree(path.join(evidence, 'raw')).map(([file]) => file);
  assert.ok(rawFiles.length > 0);
  assert.ok(rawFiles.every((file) => file.endsWith('.raw.gz')));
  assert.ok(rawFiles.every((file) => !file.endsWith('.test.cjs')));
});

test('genuine loadable-stub assertion RED preceded explicit resource-free IaC N/A and implementation', () => {
  const red = json('evidence/red-001.json');
  const na = json('evidence/iac-na.json');
  assert.equal(red.status, 1);
  assert.equal(red.acceptedResult, true);
  assert.equal(red.precheck.status, 0);
  assert.match(raw(red.precheck.stdout).toString('utf8'), /Loadable stub API/);
  const output = raw(red.stdout).toString('utf8');
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /ready/);
  assert.match(output, /applied/);
  assert.doesNotMatch(output + raw(red.stderr).toString('utf8'), /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(na.previousStageSha256, hash(fs.readFileSync(path.join(evidence, 'red-001.json'))));
  assert.equal(na.stage, 'IaC N/A');
  assert.equal(na.stubUnchangedAtThisStage, true);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(na.recordedAtUtc));
  const stub = red.snapshots.find((entry) => entry.source === 'model.js');
  assert.notEqual(hash(fs.readFileSync(path.join(root, 'model.js'))), stub.sha256);
  const feature = red.snapshots.find((entry) => entry.source === 'lesson.feature');
  assert.deepEqual(lf(fs.readFileSync(path.join(root, 'lesson.feature'))), lf(raw(feature)));
  const originalTests = raw(red.snapshots.find((entry) => entry.source === 'tests/model.test.cjs')).toString('utf8');
  assert.ok(read('tests/model.test.cjs').replace(/\r\n/g, '\n').startsWith(originalTests.replace(/\r\n/g, '\n')));
  assert.equal(na.cloudOperations, 0);
  assert.equal(na.additionalKanoCredits, 0);
});

test('the published pinned browser helper is not replaced by an inactive lifecycle prototype', () => {
  const helper = source.entries.find((entry) => entry.name === 'helper');
  assert.equal(helper.canonicalCommit, '53c0c0d');
  assert.equal(helper.working.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(helper.canonicalGit.sha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.deepEqual(raw(helper.working), fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs')));
  const runner = read('tools/browser.cjs');
  assert.match(runner, /openIsolatedLesson\(/);
  assert.match(runner, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(runner, /openIsolatedLoopback|chromium\.launch|bypassCSP:\s*true|--no-sandbox|disable-web-security/);
  assert.match(runner, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(read('README.txt'), /overall context\/shutdown deadline limitation/);
});

test('the manifest and existing native remainder preserve one original unit and exact incomplete source acceptance', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S108');
  assert.equal(manifest.sourceId, 'S108');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S108');
  assert.equal(manifest.packet, 'SC-S108');
  assert.equal(manifest.owner, 'worker-A-S108');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.sourceAcceptance, 'Unexpected blocks of valid journeys/assets are detected and policy recovery is verified; rules affect only leased routes.');
  assert.equal(manifest.iac, 'N/A — resource-free browser lesson');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.equal(manifest.syntheticInput.maximumComparisons, 4);
  assert.equal(manifest.syntheticInput.maximumHistoryRecords, 16);
  const remainder = json('remainder.json');
  assert.equal(remainder.nativeSibling, 'B-S108');
  assert.deepEqual(remainder.technicalEntryGates, ['CORE', 'DATA', 'HOST', 'C094']);
  assert.equal(remainder.boardStateChangedByThisFile, false);
  assert.equal(remainder.newCards, 0);
  assert.equal(remainder.additionalKanoCredits, 0);
  assert.equal(remainder.sourceParentComplete, false);
  assert.match(remainder.blocker, /do not satisfy real sandbox acceptance/);
});

test('the standalone surface uses restrictive CSP, safe DOM text, strict local inputs and accessible controls', () => {
  const html = read('index.html');
  const js = read('lesson.js');
  const sourceText = html + js + read('model.js');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(rule));
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<iframe|<object|(?:name|id)="reset"/i);
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|\.reset\(/);
  assert.match(js, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(sourceText, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|document\.cookie|serviceWorker|eval\s*\(|new Function/);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(js.includes('error.focus()'));
  assert.ok(js.includes('policy.focus()'));
  assert.ok(read('lesson.css').includes(':focus-visible'));
  for (const id of ['policy', 'recovery']) assert.ok(html.includes(`<label for="${id}">`));
});

test('test capture fails closed without the exact deliberate flag and cannot rewrite any owned file', () => {
  const before = tree(root);
  const run = spawnSync(process.execPath, ['learning\\S108\\tools\\capture-run.cjs', 'green'], {
    cwd: repo, timeout: 15000, env: { ...process.env, CAPTURE_TEST_EVIDENCE: 'true', CAPTURE_BROWSER_EVIDENCE: '0' },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr.toString('utf8'), /exact CAPTURE_TEST_EVIDENCE=1/);
  assert.deepEqual(tree(root), before);
});

test('actual browser proof retains the failed DevTools eval attempt and qualifies ordinary-page DOM keyboard error reset failure and CSP', () => {
  const first = json('evidence/browser-001.json');
  assert.equal(first.outcome, 'failed');
  const failed = JSON.parse(raw(first.transcript).toString('utf8'));
  assert.equal(failed.failure.name, 'AssertionError');
  assert.equal(failed.steps.length, 21);
  assert.equal(failed.closeAwaited, true);
  assert.equal(failed.pageClosed, true);
  assert.match(raw(first.snapshots.find((entry) => entry.source === 'tools/browser.cjs')).toString('utf8'), /\(0, eval\)/);
  const record = json('evidence/browser-002.json');
  const transcript = JSON.parse(raw(record.transcript).toString('utf8'));
  assert.equal(record.outcome, 'passed');
  assert.equal(record.nativeValidated, false);
  assert.equal(record.nodeProduction24Validated, false);
  assert.equal(record.additionalKanoCredits, 0);
  assert.equal(transcript.steps.length, 24);
  assert.equal(transcript.preflight.signatureStatus, 'Valid');
  assert.match(transcript.preflight.signer, /CN=Microsoft Corporation/);
  assert.equal(transcript.browserVersion, '156.0.4314.50');
  assert.equal(transcript.playwright, '1.56.1');
  assert.equal(transcript.node, 'v22.23.4');
  assert.equal(transcript.closeAwaited, true);
  assert.equal(transcript.pageClosed, true);
  assert.equal(transcript.ownedTreeUnchangedBeforeCapture, true);
  assert.deepEqual(transcript.pageErrors, []);
  assert.ok(transcript.requestedUrls.every((url) => url.startsWith('file:') || url.startsWith('data:')));
  assert.ok(transcript.requestedUrls.some((url) => url.endsWith('/tools/csp-probe.js')));
  const steps = transcript.steps;
  assert.equal(steps[1].dom.result, 'unknown');
  assert.equal(steps[2].dom.result, 'negative');
  assert.match(steps[2].dom.requests.find((request) => request.id === 'script').cells[2], /^403 block; rule POLICY-ASSET/);
  assert.equal(steps[3].dom.result, 'unknown');
  assert.equal(steps[4].dom.result, 'positive');
  assert.match(steps[4].dom.comparison, /^Comparison: negative/);
  assert.equal(steps[7].dom.result, 'negative');
  assert.equal(steps[8].dom.result, 'positive');
  assert.equal(steps[11].dom.result, 'unknown');
  assert.equal(steps[13].dom.result, 'unknown');
  const bound = steps[14].dom;
  assert.equal(bound.history.length, 16);
  assert.match(bound.metrics, /positive: 1; negative: 2; unknown: 1/);
  assert.match(bound.recoveryMetrics, /positive: 2; negative: 1; unknown: 1/);
  assert.match(bound.history[1].text, /script: 403, rule POLICY-ASSET/);
  assert.equal(steps[15].dom.error.hidden, false);
  assert.equal(steps[15].dom.history.length, 16);
  assert.equal(steps[15].dom.focus, 'error');
  assert.equal(steps[16].dom.history.length, 0);
  assert.equal(steps[16].dom.error.hidden, true);
  assert.equal(steps[16].dom.focus, 'policy');
  for (const index of [17, 19]) {
    assert.equal(steps[index].dom.error.hidden, false);
    assert.equal(steps[index].dom.history.length, 0);
    assert.equal(steps[index].dom.focus, 'error');
    assert.match(steps[index].dom.error.text, /^No action recorded: Choose one fixed policy/);
  }
  for (const index of [18, 20]) {
    assert.equal(steps[index].dom.error.hidden, true);
    assert.equal(steps[index].dom.focus, 'policy');
  }
  const csp = steps[21].csp;
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.handlerExecuted, false);
  assert.equal(csp.evalExecuted, false);
  assert.equal(csp.evalBlocked, true);
  assert.equal(csp.connectionBlocked, true);
  assert.match(csp.evalContext, /Ordinary self-loaded local script/);
  for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src']) {
    assert.ok(csp.violations.some((violation) => violation.directive === directive));
  }
  assert.equal(steps[22].dom.result, 'unknown');
  assert.equal(steps[22].dom.error.hidden, false);
  assert.ok(steps[22].dom.controls.every((control) => control.disabled));
  assert.match(steps[22].dom.status, /no synthetic result/);
  assert.equal(steps[23].dom.history.length, 0);
  assert.equal(steps[23].dom.error.hidden, true);
  assert.equal(steps[23].dom.result, 'unknown');
  for (const snapshot of record.snapshots) {
    assert.deepEqual(lf(fs.readFileSync(path.join(root, ...snapshot.source.split('/')))), lf(raw(snapshot)));
  }
  assert.ok(Date.parse(json('evidence/green-003.json').finishedAtUtc) <= Date.parse(record.startedAtUtc));
  assert.ok(Date.parse(json('evidence/syntax-003.json').finishedAtUtc) <= Date.parse(record.startedAtUtc));
});

test('every retained run has verifiable immutable raw output and source snapshots without invented native or extra credits', () => {
  const records = fs.readdirSync(evidence).filter((file) => /^(?:red|green|syntax|canonical|browser|readonly)-\d{3}\.json$/.test(file));
  assert.ok(records.includes('red-001.json'));
  assert.ok(records.includes('browser-001.json'));
  assert.ok(records.includes('browser-002.json'));
  for (const file of records) {
    const record = JSON.parse(fs.readFileSync(path.join(evidence, file)));
    if (record.stdout) raw(record.stdout);
    if (record.stderr) raw(record.stderr);
    if (record.transcript) raw(record.transcript);
    if (record.preflight) raw(record.preflight);
    for (const snapshot of record.snapshots || []) raw(snapshot);
    if (['green', 'syntax', 'canonical', 'readonly'].includes(record.stage)) {
      assert.equal(record.acceptedResult, true);
      assert.equal(record.status, 0);
      assert.equal(record.ownedTreeUnchangedDuringRun, true);
      assert.equal(record.additionalKanoCredits, 0);
      assert.equal(record.nativeValidated, false);
      assert.equal(record.nodeProduction24Validated, false);
    }
    if (record.stage === 'readonly') {
      const report = JSON.parse(raw(record.stdout).toString('utf8'));
      assert.equal(report.ownedTreeUnchanged, true);
      assert.equal(report.commands.length, 4);
      assert.ok(report.commands.every((command) => command.status === 0));
      for (const command of report.commands) {
        assert.equal(hash(Buffer.from(command.stdoutBase64, 'base64')), command.stdoutSha256);
        assert.equal(hash(Buffer.from(command.stderrBase64, 'base64')), command.stderrSha256);
      }
    }
  }
});
