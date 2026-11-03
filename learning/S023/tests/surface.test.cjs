'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const lesson = require('../lesson.js');

const here = path.resolve(__dirname, '..');
const root = path.resolve(here, '..', '..');
const read = name => fs.readFileSync(path.join(here, name), 'utf8');
const json = name => JSON.parse(read(name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('manifest preserves the exact S023 objective, atomic S unit, bounds and limits', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.id, 'A-S023');
  assert.equal(manifest.parentId, 'D-S023');
  assert.equal(manifest.sourceId, 'S023');
  assert.equal(manifest.packet, 'SC-S023');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S023');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.deepEqual(manifest.defaults, lesson.DEFAULTS);
  assert.deepEqual(manifest.fixtures, lesson.FIXTURES);
  assert.deepEqual(manifest.bounds, { maxObservations: 6, minBudgetMs: 50, maxBudgetMs: 500, businessAssertions: 3 });
  assert.match(manifest.objective, /login.*read.*transaction/i);
  assert.match(manifest.limits.join(' '), /B-S023.*D-S023.*unqualified/);
  assert.match(manifest.limits.join(' '), /Node 22.*not production Node 24/);
  assert.equal(manifest.verification.browserHelperSha256, helperHash);
  assert.equal(lesson.MAX_RUNS, 6);
});

test('source provenance contains exact S023 and D-S023 rows plus the portable A-card contract', () => {
  const source = json(path.join('evidence', 'source-inputs.json'));
  assert.match(source.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.card.id, 'A-S023');
  assert.equal(source.card.kano, 'S');
  assert.equal(source.card.kanoUnit, 'A-S023');
  assert.equal(source.card.owner, 'worker-A-S023');
  assert.deepEqual(source.card.parents, ['D-S023']);
  assert.equal(source.packet.id, 'SC-S023');
  for (const item of source.sources) {
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.equal(hash(item.excerpt), item.excerptSha256);
  }
  const excerpts = source.sources.map(item => item.excerpt).join('\n');
  assert.ok(excerpts.includes('| S023 | **Representative journey warm-up:** Exercise safe login, read, and transaction paths using isolated test fixtures. |'));
  assert.match(excerpts, /D-S023.*isolated login\/read\/transaction fixtures.*Readiness requires real safe business-path evidence/);
  assert.match(excerpts, /A-S023.*Warm a representative business path; detect a shallow probe that missed a failing transaction/);
  assert.match(excerpts, /Portable A-card lesson contract/);
  assert.match(excerpts, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.deepEqual(source.packet.additionalCompanions, []);
});

test('genuine behavioral RED, non-discovered snapshots and explicit post-RED IaC N/A remain intact', () => {
  const red = json(path.join('evidence', 'behavioral-red.json'));
  const stdout = read(path.join('evidence', 'behavioral-red.stdout.txt'));
  const stderr = read(path.join('evidence', 'behavioral-red.stderr.txt'));
  assert.equal(red.commands.length, 1);
  assert.equal(red.commands[0].status, 1);
  assert.equal(red.commands[0].error, null);
  assert.equal(hash(stdout), red.stdoutSha256);
  assert.equal(hash(stderr), red.stderrSha256);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /healthy HTTP 200 must not approve a rejected business transaction/);
  assert.match(stdout, /actual: 'unknown'/);
  assert.match(stdout, /expected: 'failure'/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
  for (const [source, snapshot] of [['lesson.js', 'lesson.stub.js.txt'],
    [path.join('tests', 'lesson.test.cjs'), 'lesson.test.cjs.txt'], ['journey.feature', 'journey.feature.txt']]) {
    assert.equal(hash(fs.readFileSync(path.join(here, 'evidence', 'red', snapshot))), red.inputs[source]);
  }
  const snapshots = fs.readdirSync(path.join(here, 'evidence', 'red'));
  assert.ok(snapshots.every(name => name.endsWith('.txt')));
  const stub = json(path.join('evidence', 'stub-load.json'));
  assert.ok(stub.commands.every(command => command.status === 0));
  const iac = json(path.join('evidence', 'iac-na.json'));
  assert.equal(iac.disposition, 'N/A');
  assert.equal(iac.afterBehavioralRedCompletedAtUtc, red.completedAtUtc);
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.match(iac.reason, /No resources/);
});

test('HTML is standalone, accessible by native controls and locked to owned static assets', () => {
  const html = read('index.html');
  const app = read('app.js');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(csp.split(';').map(value => value.trim()).includes(directive));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|style\s*=/i);
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(match => match[1]), ['lesson.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link\b[^>]*href="([^"]+)"/g)].map(match => match[1]), ['styles.css']);
  assert.equal([...html.matchAll(/<script\b/g)].length, 2);
  for (const id of ['check-mode', 'fixture', 'budget-ms', 'isolated']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="announcement" role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /errorPanel\.focus\(\)/);
  assert.match(app, /byId\('check-mode'\)\.focus\(\)/);
  assert.doesNotMatch(app + read('lesson.js'), /innerHTML|outerHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|Math\.random|Date\./);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /not an uninterrupted migration or native readiness guarantee/);
  for (const file of ['lesson.js', 'app.js', 'styles.css', 'README.md', 'journey.feature']) assert.ok(fs.statSync(path.join(here, file)).isFile());
});

test('browser code pins the approved helper and keeps deliberate capture separate from normal verification', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* text eol=lf$/m);
  assert.match(attributes, /^evidence\/\*\* binary$/m);
  for (const file of ['lesson.js', 'app.js', 'index.html', 'styles.css', 'journey.feature',
    'manifest.json', 'README.md', 'capture.cjs', '.gitattributes',
    path.join('tests', 'lesson.test.cjs'), path.join('tests', 'surface.test.cjs'), path.join('tests', 'browser.test.cjs')]) {
    assert.ok(!read(file).includes('\r'), `source must retain final LF hash across checkout: ${file}`);
  }
  assert.equal(hash(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), helperHash);
  const tooling = json(path.join('evidence', 'tooling-preflight.json'));
  assert.equal(tooling.helperSha256, helperHash);
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.edgeVersion, /^156\./);
  assert.match(tooling.node, /^v22\./);
  const browser = read(path.join('tests', 'browser.test.cjs'));
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|browserType\.launch|--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true/);
});
