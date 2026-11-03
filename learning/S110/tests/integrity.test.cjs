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
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(evidence, entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const source = json('evidence\\source.json');

test('exact S110, D-S110, portable A/B source and packet remain separate', () => {
  const expected = {
    readme: {
      S110: '| S110 | **Edge configuration propagation:** Retain old origins until routing changes have converged sufficiently for safe retirement. |',
    },
    backlog: {
      'D-S110': '| D-S110 | P1 | Add actual gateway configuration changes and distributed origin/cohort probes. | Old origins remain until required observed propagation/drain gates pass; desired configuration is not mistaken for complete edge convergence. | P006 |',
    },
    kanban: {
      'A-S110': '| A-S110 | D-S110 | S | Propagate an edge change; nominal configuration must not imply all origins have converged. | SOURCE |',
      'B-S110': '| B-S110 | D-S110 | S | Conduct one actual global-route change; verify sampled effective destinations and old-origin retention. | CORE, DATA, HOST, C095 |',
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
  assert.equal(source.card.id, 'A-S110');
  assert.equal(source.card.kano, 'S');
  assert.equal(source.card.kanoUnit, 'A-S110');
  assert.equal(source.card.packet, 'SC-S110');
  assert.deepEqual(source.card.parents, ['D-S110']);
  assert.equal(source.card.technicalEntryGate, 'SOURCE');
  assert.equal(source.nativeSibling.id, 'B-S110');
  assert.equal(source.nativeSibling.packet, 'SC-S110');
});

test('raw working CRLF bytes and canonical Git LF blobs are independently checked', () => {
  for (const entry of source.entries) {
    const working = raw(entry.working);
    const canonical = raw(entry.canonicalGit);
    const git = execFileSync('git', ['show', `${entry.canonicalCommit}:${entry.source}`], { cwd: repo });
    assert.deepEqual(canonical, git);
    assert.ok(entry.working.crlf > 0);
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.notEqual(entry.working.sha256, entry.canonicalGit.sha256);
    assert.equal(hash(lf(working)), entry.workingLfSha256);
    assert.equal(lf(working).equals(canonical), entry.workingLfEqualsCanonical);
    assert.equal(working.equals(canonical), entry.workingEqualsCanonicalBytes);
  }
});

test('narrow byte attributes preceded proof; raw and stub proof stay outside discovery', () => {
  assert.match(read('.gitattributes').toString(), /^evidence\/raw\/\*\* -text$/m);
  const attrs = execFileSync('git', ['check-attr', 'text', 'eol', '--',
    'learning\\S110\\evidence\\raw\\source\\readme.working.raw.gz'], { cwd: repo, encoding: 'utf8' });
  assert.ok(attrs.includes(': text: unset'));
  assert.ok(attrs.includes(': eol: unspecified'));
  const files = (directory) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [entry.name]);
  assert.ok(files(path.join(evidence, 'raw')).every((file) => file.endsWith('.raw.gz')));
  assert.ok(files(path.join(root, 'tests')).every((file) => file.endsWith('.test.cjs')));
});

test('loadable-stub behavioral assertion RED precedes IaC N/A and changed implementation', () => {
  const red = json('evidence\\red-001.json');
  const na = json('evidence\\iac-na.json');
  assert.equal(red.precheck.status, 0);
  assert.equal(red.status, 1);
  assert.equal(red.signal, null);
  assert.equal(red.error, null);
  assert.equal(red.acceptedBehavioralRed, true);
  assert.match(raw(red.precheck.stdout).toString('utf8'), /Loadable stub API/);
  raw(red.precheck.stderr);
  const output = raw(red.stdout).toString('utf8');
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /actual: 'positive'/);
  assert.match(output, /expected: 'unknown'/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|SyntaxError/);
  raw(red.stderr);
  red.snapshots.forEach(raw);
  assert.equal(na.stage, 'IaC N/A');
  assert.equal(na.stubUnchangedAtThisStage, true);
  assert.equal(na.previousStageSha256, hash(read('evidence\\red-001.json')));
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(na.recordedAtUtc));
  assert.notEqual(hash(read('model.js')), red.snapshots.find((item) => item.source === 'model.js').sha256);
  assert.deepEqual(lf(read('lesson.feature')), lf(raw(red.snapshots.find((item) => item.source === 'lesson.feature'))));
});

test('approved published helper working bytes and canonical Git bytes are not conflated', () => {
  const entry = source.entries.find((item) => item.name === 'helper');
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(hash(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(entry.canonicalCommit, '53c0c0d');
  assert.equal(entry.canonicalGit.sha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.deepEqual(helper, raw(entry.working));
  const browser = read('tools\\browser.cjs').toString();
  assert.match(browser, /openIsolatedLesson\('learning\\\\S110\\\\index\.html'\)/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|--no-sandbox|bypassCSP|disable-web-security/);
});

test('manifest and remainder preserve exact source objective and one original S unit', () => {
  const manifest = json('manifest.json');
  const remainder = json('remainder.json');
  assert.equal(manifest.objective, source.card.deliver);
  assert.equal(manifest.sourceAcceptance, 'Old origins remain until required observed propagation/drain gates pass; desired configuration is not mistaken for complete edge convergence.');
  assert.equal(manifest.sourceRequiredBehavior, 'Retain old origins until routing changes have converged sufficiently for safe retirement.');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.cardId, 'A-S110');
  assert.equal(manifest.kanoUnit, 'A-S110');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S110');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.match(manifest.iac, /^N\/A/);
  assert.equal(remainder.originalKanoUnit, 'A-S110');
  assert.equal(remainder.ledgerChangedByWorker, false);
  for (const item of remainder.relevantToDo) {
    assert.equal(item.state, 'To Do');
    assert.equal(item.readiness, false);
    assert.ok(item.blocker);
  }
  assert.equal(remainder.relevantToDo[0].portableProofSubstitutionAllowed, false);
});

test('standalone assets use restrictive CSP, accessible labels and no reset shadowing', () => {
  const html = read('index.html').toString();
  const lesson = read('lesson.js').toString();
  const model = read('model.js').toString();
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(directive));
  }
  assert.match(html, /<label for="fixture">/);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /\bon\w+\s*=|\b(?:name|id)="reset"|https?:|<script(?![^>]*\bsrc=)/i);
  assert.match(lesson, /form\.reset\(\)/);
  assert.match(lesson, /error\.focus\(\)/);
  assert.doesNotMatch(lesson + model, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|Date\(|Math\.random|setInterval|setTimeout/);
});

test('browser proof writes require exact deliberate capture and normal validation stays read-only', () => {
  const runner = read('tools\\browser.cjs').toString();
  assert.match(runner, /const capture = process\.env\.CAPTURE_BROWSER_EVIDENCE === '1';/);
  assert.match(runner, /if \(capture\) \{[\s\S]*fs\.writeFileSync/);
  assert.match(runner, /JSON\.stringify\(beforeTree\) === JSON\.stringify\(tree\(\)\)/);
  assert.equal(runner.split('if (capture) {')[0].includes('fs.writeFileSync'), false);
  assert.doesNotMatch(read('tools\\syntax.cjs').toString(), /writeFile|mkdir|appendFile|unlink|rmSync/);
  assert.doesNotMatch(read('tests\\model.test.cjs').toString(), /writeFile|appendFile|unlink|rmSync/);
  assert.ok(read('guide.txt').toString().includes('do NOT enable capture'));
});
