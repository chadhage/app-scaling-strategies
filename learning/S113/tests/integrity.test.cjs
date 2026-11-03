'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const { root, repo, evidence, hash, lf, read, json } = require('../tools/proof.cjs');
const source = json('evidence\\source.json');
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(evidence, entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const listFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? listFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);

test('exact S113, D-S113, portable A/B acceptance and frozen packet agree', () => {
  const expected = {
    readme: { S113: '| S113 | **Planned regional evacuation:** Warm the destination region, synchronize required state, and migrate ownership and traffic safely. |' },
    backlog: { 'D-S113': '| D-S113 | P2 | Add **Evacuate selected region** with destination warm-up, state synchronization, and writer handoff. | Required state and capacity exist before migration; actual regional routes and exclusive ownership converge safely. | P006, D-S069 |' },
    kanban: {
      'A-S113': '| A-S113 | D-S113 | S | Evacuate a region; require warm capacity, synchronized state, and exclusive writer ownership. | SOURCE |',
      'B-S113': '| B-S113 | D-S113 | S | Conduct one planned regional handoff; verify real routing, data boundary, and writer eligibility. | CORE, DATA, REGION |',
    },
  };
  for (const entry of source.entries.filter((item) => item.name !== 'helper')) {
    const current = fs.readFileSync(path.join(repo, ...entry.source.split('/')), 'utf8');
    for (const text of [raw(entry.working).toString('utf8'), raw(entry.canonicalGit).toString('utf8'), current]) {
      for (const [id, exact] of Object.entries(expected[entry.name])) assert.equal(row(text, id), exact);
      if (entry.name === 'kanban') {
        assert.ok(text.includes('### Portable A-card lesson contract'));
        assert.ok(text.includes('**Training rehearsal - synthetic data - not a live Azure result**'));
        assert.ok(text.includes('A worker cannot award its own Done credit.'));
        assert.ok(text.includes('every other A/B card belongs to SC-Snnn'));
        assert.ok(text.includes('Subdivision preserves the original `kanoUnit`'));
      }
    }
  }
  assert.equal(source.card.id, 'A-S113');
  assert.equal(source.card.kano, 'S');
  assert.equal(source.card.kanoUnit, 'A-S113');
  assert.equal(source.card.packet, 'SC-S113');
  assert.deepEqual(source.card.parents, ['D-S113']);
  assert.equal(source.card.technicalEntryGate, 'SOURCE');
  assert.equal(source.nativeSibling.id, 'B-S113');
  assert.equal(source.nativeSibling.packet, 'SC-S113');
  assert.equal(source.nativeSibling.technicalEntryGate, 'CORE, DATA, REGION');
  assert.equal(source.packet, 'SC-S113');
});

test('working raw CRLF bytes and canonical Git LF blobs are independently retained', () => {
  for (const entry of source.entries) {
    const working = raw(entry.working);
    const canonical = raw(entry.canonicalGit);
    const git = execFileSync('git', ['show', `${entry.canonicalCommit}:${entry.source}`], { cwd: repo });
    assert.deepEqual(canonical, git);
    assert.ok(entry.working.crlf > 0);
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.equal(hash(lf(working)), entry.workingLfSha256);
    assert.equal(lf(working).equals(canonical), entry.workingLfEqualsCanonical);
    assert.equal(working.equals(canonical), entry.workingEqualsCanonicalBytes);
    assert.notEqual(entry.working.sha256, entry.canonicalGit.sha256);
  }
});

test('byte attributes preceded retained raw/stub proof outside autodiscovery', () => {
  assert.match(read('.gitattributes').toString('utf8'), /^evidence\/raw\/\*\* -text\r?$/m);
  const attrs = execFileSync('git', ['check-attr', 'text', 'eol', '--',
    'learning\\S113\\evidence\\raw\\source\\readme-working.raw.gz'], { cwd: repo, encoding: 'utf8' });
  assert.match(attrs, /: text: unset/);
  assert.match(attrs, /: eol: unspecified/);
  assert.ok(listFiles(path.join(evidence, 'raw')).every((file) => file.endsWith('.raw.gz')));
  assert.ok(listFiles(path.join(root, 'tests')).every((file) => file.endsWith('.test.cjs')));
  const red = json('evidence\\red-001.json');
  assert.deepEqual(lf(read('.gitattributes')), lf(raw(red.snapshots.find((item) => item.source === '.gitattributes'))));
});

test('genuine behavioral RED from loadable stub precedes IaC N/A and implementation', () => {
  const red = json('evidence\\red-001.json');
  const iac = json('evidence\\iac-na.json');
  assert.equal(red.acceptedBehavioralRed, true);
  assert.equal(red.precheck.status, 0);
  assert.equal(red.status, 1);
  assert.equal(red.signal, null);
  assert.equal(red.error, null);
  assert.match(raw(red.precheck.stdout).toString('utf8'), /Loadable stub API and standalone scripts/);
  assert.match(raw(red.stdout).toString('utf8'), /ERR_ASSERTION/);
  assert.match(raw(red.stdout).toString('utf8'), /actual: 'positive'/);
  assert.match(raw(red.stdout).toString('utf8'), /expected: 'negative'/);
  assert.doesNotMatch(raw(red.stdout).toString('utf8'), /MODULE_NOT_FOUND|SyntaxError/);
  raw(red.stderr);
  raw(red.precheck.stderr);
  red.snapshots.forEach(raw);
  assert.equal(iac.stage, 'IaC N/A');
  assert.equal(iac.stubUnchangedAtThisStage, true);
  assert.equal(iac.previousStageSha256, hash(read('evidence\\red-001.json')));
  assert.deepEqual(iac.generatedInfrastructureFiles, []);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
  const stub = red.snapshots.find((item) => item.source === 'model.js');
  assert.notEqual(hash(lf(read('model.js'))), hash(lf(raw(stub))));
  assert.deepEqual(lf(read('lesson.feature')), lf(raw(source.bdd)));
  assert.deepEqual(lf(read('lesson.feature')), lf(raw(red.snapshots.find((item) => item.source === 'lesson.feature'))));
  assert.ok(lf(read('tests\\model.test.cjs')).toString('utf8')
    .startsWith(lf(raw(red.snapshots.find((item) => item.source === 'tests\\model.test.cjs'))).toString('utf8')));
});

test('published helper binds exact raw bytes and canonical 53c0c0d without unsafe prototype', () => {
  const entry = source.entries.find((item) => item.name === 'helper');
  const current = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(hash(current), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.deepEqual(current, raw(entry.working));
  assert.equal(entry.canonicalCommit, '53c0c0d');
  assert.equal(entry.canonicalGit.sha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const browser = read('tools\\browser.cjs').toString('utf8');
  assert.match(browser, /openIsolatedLesson\('learning\\\\S113\\\\index\.html'\)/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|--no-sandbox|bypassCSP|disable-web-security|lifecycle-recovery/);
});

test('standalone scripts and restrictive CSP have no remote operations, clocks or reset shadowing', () => {
  const html = read('index.html').toString('utf8');
  const script = read('lesson.js').toString('utf8');
  const model = read('model.js').toString('utf8');
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)|\son\w+\s*=|\sstyle\s*=/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map((match) => match[1]), ['lesson.css']);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
  assert.match(script, /form\.reset\(\)/);
  assert.doesNotMatch(`${script}\n${model}`, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|innerHTML|\beval\s*\(|new Date|Date\.now|Math\.random|setInterval|setTimeout/);
  assert.ok(html.includes('Fixed fictional teaching DATA ONLY.'));
  assert.ok(html.includes('not a recovery or writer-restore operation'));
  assert.ok(html.includes('role="alert" tabindex="-1"'));
  assert.ok(html.includes('role="status" aria-live="polite"'));
});

test('manifest and relevant To Do remainder keep one original unit and incomplete native/source parent', () => {
  const manifest = json('manifest.json');
  const remainder = json('remainder.json');
  assert.equal(manifest.objective, source.card.deliver);
  assert.equal(manifest.sourceRequiredBehavior, 'Warm the destination region, synchronize required state, and migrate ownership and traffic safely.');
  assert.equal(manifest.sourceAcceptance, 'Required state and capacity exist before migration; actual regional routes and exclusive ownership converge safely.');
  for (const value of [manifest, remainder]) {
    assert.equal(value.cardId, 'A-S113');
    assert.equal(value.kanoUnit, 'A-S113');
    assert.equal(value.kano, 'S');
    assert.equal(value.packet, 'SC-S113');
    assert.equal(value.sourceParentComplete, false);
    assert.equal(value.additionalKanoCredits, 0);
  }
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.nativeSibling, 'B-S113');
  assert.equal(manifest.owner, 'worker-A-S113');
  assert.equal(remainder.refinement[0].id, 'B-S113');
  assert.equal(remainder.refinement[0].state, 'To Do');
  assert.equal(remainder.refinement[0].readiness, false);
  assert.equal(remainder.refinement[0].technicalEntryGate, 'CORE, DATA, REGION');
  assert.deepEqual(remainder.refinement[1].dependencies, ['P006', 'D-S069']);
  assert.equal(remainder.refinement[1].readiness, false);
  assert.match(read('guide.txt').toString('utf8'), /Node 22 is local test tooling, not production Node 24 validation/);
});
