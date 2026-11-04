'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function raw(entry) {
  const bytes = gunzipSync(read(path.join('evidence', entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
}
const source = json('evidence\\source.json');

test('exact frozen source, portable A/B contract and SC-S114 packet are preserved', () => {
  const expected = {
    readme: '| S114 | **Unplanned regional failure:** Validate detection, alternate capacity, data availability, and client recovery against the agreed interruption budget. |',
    backlog: '| D-S114 | P2 | Add unplanned owned-origin/dependency isolation and regional recovery orchestration. | Detection, surviving capacity, transaction outcomes, and client recovery meet the declared budget where evidenced; full-region claims are not fabricated. | P006, D-S066 |',
    kanban: '| A-S114 | D-S114 | S | Fail owned regional origins/dependencies; distinguish proxy observations from full-region guarantees. | SOURCE |',
  };
  assert.deepEqual(source.exact, expected);
  for (const entry of source.entries.filter((item) => item.name !== 'helper')) {
    const current = fs.readFileSync(path.join(repo, ...entry.source.split('/')));
    for (const bytes of [raw(entry.working), raw(entry.canonicalGit), current]) {
      const text = bytes.toString('utf8');
      assert.ok(text.split(/\r?\n/).includes(expected[entry.name]));
      if (entry.name === 'kanban') {
        assert.ok(text.includes('| B-S114 | D-S114 | S | Conduct one bounded origin/dependency isolation; verify detection, surviving capacity, and honest recovery scope. | CORE, DATA, REGION |'));
        for (const phrase of ['### Portable A-card lesson contract', 'A worker cannot award its own Done credit.', 'every other A/B card belongs to SC-Snnn', 'Subdivision preserves the original `kanoUnit`']) assert.ok(text.includes(phrase));
      }
    }
  }
  assert.equal(source.card.id, 'A-S114');
  assert.equal(source.card.kanoUnit, 'A-S114');
  assert.equal(source.card.kano, 'S');
  assert.equal(source.card.packet, 'SC-S114');
  assert.deepEqual(source.card.parents, ['D-S114']);
  assert.equal(source.card.technicalEntryGate, 'SOURCE');
  assert.equal(source.nativeSibling.complete, false);
});

test('raw working CRLF and canonical Git LF sources remain independently verifiable', () => {
  for (const entry of source.entries) {
    const working = raw(entry.working);
    const canonical = raw(entry.canonicalGit);
    assert.deepEqual(canonical, execFileSync('git', ['show', `${entry.canonicalCommit}:${entry.source}`], { cwd: repo }));
    assert.ok(entry.working.crlf > 0);
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.notEqual(entry.working.sha256, entry.canonicalGit.sha256);
    assert.equal(hash(lf(working)), entry.workingLfSha256);
    assert.equal(lf(working).equals(canonical), entry.workingLfEqualsCanonical);
    assert.equal(working.equals(canonical), entry.workingEqualsCanonicalBytes);
  }
});

test('genuine loadable-stub RED precedes explicit IaC N/A and changed implementation', () => {
  const red = json('evidence\\red.json');
  const na = json('evidence\\iac-na.json');
  assert.equal(red.precheck.status, 0);
  assert.equal(red.status, 1);
  assert.equal(red.signal, null);
  assert.equal(red.error, null);
  assert.equal(red.acceptedBehavioralRed, true);
  assert.match(raw(red.precheck.stdout).toString(), /Loadable stub API/);
  raw(red.precheck.stderr);
  const output = raw(red.stdout).toString('utf8');
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /actual: 'positive'/);
  assert.match(output, /expected: 'unknown'/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|SyntaxError/);
  raw(red.stderr);
  red.snapshots.forEach(raw);
  const stub = raw(red.snapshots.find((entry) => entry.source === 'model.js'));
  const context = { module: { exports: {} } };
  vm.runInNewContext(stub.toString('utf8'), context);
  const isolated = context.module.exports.applyAction(context.module.exports.createState(), { type: 'isolate' });
  assert.equal(isolated.conclusion, 'positive', 'The preserved executable stub really contains the demonstrated defect.');
  assert.notEqual(hash(read('model.js')), hash(stub));
  assert.deepEqual(lf(read('lesson.feature')), lf(raw(red.snapshots.find((entry) => entry.source === 'lesson.feature'))));
  assert.equal(na.stage, 'IaC N/A');
  assert.equal(na.stubUnchangedAtThisStage, true);
  assert.equal(na.previousStageSha256, hash(read('evidence\\red.json')));
  assert.deepEqual(na.generatedInfrastructureFiles, []);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(na.recordedAtUtc));
});

test('narrow raw byte attributes existed before RED and proof is outside discovery', () => {
  const red = json('evidence\\red.json');
  assert.match(raw(red.snapshots.find((entry) => entry.source === '.gitattributes')).toString(), /^evidence\/raw\/\*\* -text$/m);
  assert.match(read('.gitattributes').toString(), /^evidence\/raw\/\*\* -text$/m);
  const attrs = execFileSync('git', ['check-attr', 'text', 'eol', '--', 'learning\\S114\\evidence\\raw\\source\\readme.working.raw.gz'], { cwd: repo, encoding: 'utf8' });
  assert.ok(attrs.includes(': text: unset'));
  assert.ok(attrs.includes(': eol: unspecified'));
  const files = (directory) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [entry.name]);
  assert.ok(files(path.join(root, 'evidence', 'raw')).every((file) => file.endsWith('.raw.gz')));
  assert.ok(files(path.join(root, 'tests')).every((file) => file.endsWith('.test.cjs')));
});

test('helper binds published bytes only, not the inactive recovery prototype', () => {
  const entry = source.entries.find((item) => item.name === 'helper');
  const working = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.deepEqual(working, raw(entry.working));
  assert.equal(hash(working), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(entry.canonicalCommit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(entry.canonicalGit.sha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const runner = read('tools\\browser.cjs').toString();
  assert.match(runner, /openIsolatedLesson\('learning\\\\S114\\\\index\.html'\)/);
  assert.match(runner, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.match(runner, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.doesNotMatch(runner, /openIsolatedLoopback|chromium\.launch|--no-sandbox|bypassCSP|disable-web-security|recovery-prototype/);
});

test('bundle, manifest and honest remainder preserve DATA ONLY, original S unit and native gates', () => {
  const manifest = json('manifest.json');
  const remainder = json('remainder.json');
  assert.equal(manifest.objective, source.card.deliver);
  assert.equal(manifest.sourceRequiredBehavior, 'Validate detection, alternate capacity, data availability, and client recovery against the agreed interruption budget.');
  assert.equal(manifest.sourceAcceptance, 'Detection, surviving capacity, transaction outcomes, and client recovery meet the declared budget where evidenced; full-region claims are not fabricated.');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.cardId, 'A-S114');
  assert.equal(manifest.kanoUnit, 'A-S114');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S114');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.equal(remainder.relatedToDo.id, 'B-S114');
  assert.equal(remainder.relatedToDo.state, 'To Do');
  assert.equal(remainder.relatedToDo.readiness, false);
  assert.deepEqual(remainder.relatedToDo.technicalGates, ['CORE', 'DATA', 'REGION']);
  assert.equal(remainder.relatedToDo.unchangedAcceptance, manifest.sourceAcceptance);
  assert.equal(remainder.sourceParentComplete, false);
  assert.equal(remainder.additionalKanoCredits, 0);
  const html = read('index.html').toString();
  assert.ok(html.includes(manifest.banner));
  assert.ok(html.includes('fixed fictional teaching DATA ONLY'));
  assert.ok(html.includes('Fixture labels and sampled proxy checks cannot certify an actual Azure-region outage or full regional continuity.'));
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) assert.ok(policy.includes(directive));
  assert.doesNotMatch(html, /\b(?:id|name)="reset"|\bon\w+=|https?:\/\//);
  const ui = read('lesson.js').toString();
  assert.match(ui, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(ui, /innerHTML|document\.write|\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/);
});
