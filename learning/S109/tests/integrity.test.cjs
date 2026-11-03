'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(root, 'evidence', entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
};
const source = json('evidence\\source.json');
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));

test('exact source acceptance, portable contract and original packet are independently preserved', () => {
  const expected = {
    readme: { S109: '| S109 | **Outbound connection/SNAT pressure:** Maintain sufficient outbound connectivity as instance and connection counts grow. |' },
    backlog: { 'D-S109': '| D-S109 | P2 | Add bounded outbound-connection pressure and pool/connection-management comparison. | Native network capacity evidence and journey budgets are evaluated; unavailable SNAT signals remain unverified rather than inferred from app counts. | P006 |' },
    kanban: {
      'A-S109': '| A-S109 | D-S109 | S | Raise outbound connections; missing native SNAT evidence must stay unverified. | SOURCE |',
      'B-S109': '| B-S109 | D-S109 | S | Conduct one approved outbound-pressure run; verify native evidence availability and bounded user impact. | CORE, DATA, HOST, C090 |',
    },
  };
  assert.deepEqual(source.card, {
    technicalEntryGate: 'SOURCE', kano: 'S', priority: 'P2', kanoUnit: 'A-S109',
    deliver: 'Raise outbound connections; missing native SNAT evidence must stay unverified.',
    packet: 'SC-S109', id: 'A-S109', parents: ['D-S109'],
  });
  for (const entry of source.entries.filter((item) => item.name !== 'helper')) {
    const current = fs.readFileSync(path.join(repo, entry.source), 'utf8');
    for (const snapshot of [raw(entry.working).toString('utf8'), raw(entry.canonicalGit).toString('utf8'), current]) {
      for (const [id, exact] of Object.entries(expected[entry.name])) assert.equal(row(snapshot, id), exact);
      if (entry.name === 'kanban') {
        for (const clause of [
          '### Portable A-card lesson contract',
          '**Training rehearsal - synthetic data - not a live Azure result**',
          'A worker cannot award its own Done credit.',
          'Subdivision preserves the original `kanoUnit`',
          'every other A/B card belongs to SC-Snnn',
          'all original acceptance clauses pass',
        ]) assert.ok(snapshot.includes(clause), clause);
      }
    }
  }
});

test('raw CRLF working source and canonical Git LF bytes are never conflated', () => {
  for (const entry of source.entries) {
    const working = raw(entry.working);
    const canonical = raw(entry.canonicalGit);
    const gitPath = entry.source.replace(/\\/g, '/');
    assert.deepEqual(canonical, execFileSync('git', ['show', `${entry.canonicalCommit}:${gitPath}`], { cwd: repo }));
    assert.equal(hash(lf(working)), entry.workingLfSha256);
    assert.equal(lf(working).equals(canonical), entry.workingLfEqualsCanonical);
    assert.equal(working.equals(canonical), entry.workingEqualsCanonicalBytes);
    assert.ok(entry.working.crlf > 0);
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.notEqual(entry.working.sha256, entry.canonicalGit.sha256);
  }
  const feature = raw(source.bdd);
  assert.deepEqual(lf(feature), lf(Buffer.from(read('lesson.feature'))));
  assert.notDeepEqual(lf(Buffer.from('a\r\nb\r\n')), Buffer.from('a\r\nb\r\n'));
});

test('genuine loadable-stub assertion RED precedes IaC N/A and implementation', () => {
  const red = json('evidence\\red.json');
  const iac = json('evidence\\iac-na.json');
  assert.equal(red.status, 1);
  assert.equal(red.precheck.status, 0);
  assert.equal(red.acceptedResult, true);
  assert.match(raw(red.precheck.stdout).toString('utf8'), /Loadable stub API/);
  const stdout = raw(red.stdout).toString('utf8');
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /ready/);
  assert.match(stdout, /pending/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError/);
  raw(red.stderr);
  raw(red.precheck.stderr);
  const stub = red.snapshots.find((item) => item.source === 'model.js');
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(raw(stub).toString('utf8'), context, { timeout: 1000 });
  assert.equal(typeof context.module.exports.transition, 'function');
  for (const entry of red.snapshots) {
    const historical = raw(entry);
    if (entry.source !== 'model.js' && entry.source !== 'index.html') {
      assert.deepEqual(lf(historical), lf(fs.readFileSync(path.join(root, entry.source))));
    }
  }
  assert.notEqual(hash(fs.readFileSync(path.join(root, 'model.js'))), stub.sha256);
  assert.equal(iac.stage, 'IaC N/A');
  assert.equal(iac.stubUnchangedAtThisStage, true);
  assert.equal(iac.previousStageSha256, hash(Buffer.from(read('evidence\\red.json'))));
  assert.ok(Date.parse(source.finishedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.startedAtUtc));
});

test('binary raw attributes precede proof capture and archived RED is outside discovery', () => {
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text -eol$/m);
  raw(source.attributes);
  const attrs = execFileSync('git', ['check-attr', 'text', 'eol', '--',
    'learning\\S109\\evidence\\raw\\source\\readme-working.raw.gz'], { cwd: repo, encoding: 'utf8' });
  assert.match(attrs, /text: unset/);
  assert.match(attrs, /eol: unset/);
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [entry.name]);
  assert.ok(walk(path.join(root, 'evidence', 'raw')).every((name) => name.endsWith('.raw.gz')));
});

test('manifest and native remainder preserve one original unit and exact source limits', () => {
  const manifest = json('manifest.json');
  const remainder = json('remainder.json');
  assert.equal(manifest.cardId, 'A-S109');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, manifest.cardId);
  assert.equal(manifest.packet, 'SC-S109');
  assert.deepEqual(manifest.parentIds, ['D-S109']);
  assert.equal(manifest.objective, source.card.deliver);
  assert.equal(manifest.sourceAcceptance, remainder.sourceAcceptanceStillRequired);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.equal(remainder.relatedCardId, 'B-S109');
  assert.equal(remainder.originalKanoUnit, 'B-S109');
  assert.equal(remainder.readiness, false);
  assert.equal(remainder.boardStateChangedByThisFile, false);
  assert.deepEqual(remainder.technicalEntryGates, ['CORE', 'DATA', 'HOST', 'C090']);
  assert.deepEqual(remainder.sourceParentPrerequisites, ['P006']);
  assert.equal(remainder.newCards, 0);
  assert.equal(remainder.additionalKanoCredits, 0);
});

test('lesson is standalone, CSP-restricted, keyboard-operable and has no connection primitives', () => {
  const html = read('index.html');
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|<script(?![^>]*\bsrc=)|\bstyle\s*=|https?:\/\/|<iframe/i);
  assert.match(html, /id="boot-error" role="alert"/);
  assert.match(html, /id="error" role="alert" hidden/);
  assert.match(html, /id="reset-lesson" type="button"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('lesson.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible/);
  for (const file of ['model.js', 'lesson.js']) {
    assert.doesNotMatch(read(file),
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|Worker|setInterval|setTimeout|require)\b/);
    assert.doesNotMatch(read(file), /innerHTML|localStorage|sessionStorage/);
  }
});

test('only the approved published helper and deliberate exact capture flag are qualified', () => {
  const helper = source.entries.find((item) => item.name === 'helper');
  const current = fs.readFileSync(path.join(repo, helper.source));
  assert.equal(hash(current), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.deepEqual(current, raw(helper.working));
  assert.equal(helper.canonicalCommit, '53c0c0d');
  assert.equal(helper.canonicalGit.sha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const browser = read('tools\\browser.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /openIsolatedLesson\('learning\\\\S109\\\\index\.html'\)/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|bypassCSP|--no-sandbox|disable-web-security|npm|install/);
});
