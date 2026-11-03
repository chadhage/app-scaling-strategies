'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable manifest identifies the exact frozen card, parent and packet without native credit', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S048');
  assert.equal(manifest.sourceId, 'S048');
  assert.equal(manifest.parentId, 'D-S048');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S048');
  assert.equal(manifest.packet, 'SC-S048');
  assert.equal(manifest.owner, 'worker-A-S048');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.entryPoint, 'learning/S048/index.html');
  assert.equal(manifest.executionMode, 'synthetic');
  for (const field of ['objective', 'preconditions', 'actions', 'assertions', 'limits']) {
    assert.ok(manifest[field].length > 0, field);
  }
  assert.equal(manifest.bounds.attempts, 8);
  assert.equal(manifest.testRuntime.productionNode24Approval, false);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  assert.match(manifest.limits.join('\n'), /B-S048 and original D-S048 native acceptance remain separate and unfulfilled/);
});

test('IaC is explicitly N/A after the preserved RED, not permission to provision', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const red = JSON.parse(read(path.join('evidence', 'red', 'run.json')));
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.iac.redCompletedAtUtc, red.completedAtUtc);
  assert.match(manifest.iac.decisionStage, /after.*RED.*before implementation/);
  assert.match(manifest.iac.reason, /no cloud, IaC, scaffold, identity, deployment, expenditure/);
});

test('visible source, exercise, exact training banner, limitations and native separation are present', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  for (const term of ['A-S048', 'D-S048', 'SC-S048', 'B-S048', 'exactly one effect', 'not a completed job', 'Unknown effects']) {
    assert.ok(html.includes(term), term);
  }
  assert.match(html, /no Azure or batch-runtime calls occur/);
  assert.match(html, /<noscript>/);
});

test('CSP allows only local scripts and styles, and prohibits inline execution and connections', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|javascript:|https?:\/\/|unsafe-inline|unsafe-eval/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
});

test('controls have explicit labels, announced errors and an unshadowed reset method', () => {
  const html = read('index.html');
  for (const id of ['retirement', 'checkpoint', 'effects', 'observation', 'resume-delay-ms', 'budget-ms', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`), id);
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.doesNotMatch(read('app.js'), /(?:form|rehearsal-form)\.reset\(/);
  assert.match(html, /id="reset-rehearsal"/);
});

test('runtime uses private deterministic state and text-only rendering without network or storage APIs', () => {
  const app = read('app.js'), model = read('model.js');
  assert.doesNotMatch(app + model, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|Math\.random|Date\.now|setTimeout/);
  assert.match(app, /textContent/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /lesson\.reset\(\)/);
  assert.match(model, /History limit: 8/);
  const context = {};
  vm.runInNewContext(model, context, { timeout: 1000 });
  assert.equal(typeof context.BatchRetirementLesson.createLesson, 'function');
  const lesson = context.BatchRetirementLesson.createLesson();
  assert.equal(lesson.snapshot().phase, 'idle');
});

test('small-view layout, visible keyboard focus and bounded scroll containers are declared', () => {
  const css = read('styles.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline: 3px/);
  assert.match(css, /@media \(max-width: 42rem\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /minmax\(0, 1fr\)/);
});
