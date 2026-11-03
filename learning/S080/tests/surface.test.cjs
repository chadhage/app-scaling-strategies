'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('./provenance.cjs');
const html = read('index.html').toString();
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest declares exact single-unit source, conditions, bounds and limits', () => {
  assert.equal(manifest.id, 'A-S080');
  assert.equal(manifest.sourceId, 'S080');
  assert.equal(manifest.parentId, 'D-S080');
  assert.equal(manifest.nativeSiblingId, 'B-S080');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S080');
  assert.equal(manifest.packet, 'SC-S080');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.iac, 'N/A');
  assert.equal(manifest.objective, 'Reassign a partition; detect missing checkpoint transfer despite successful new ownership.');
  assert.deepEqual(manifest.bounds, { partitions: 1, events: 6, maxDeliveries: 8, inputCombinations: 96, retainedAttempts: 6 });
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /B-S080 and D-S080 remain incomplete/);
  assert.match(read('README.md').toString(), /Source dependency: \*\*D-S075\*\*/);
});

test('standalone surface uses only local external assets and a restrictive explicit CSP', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 3);
  assert.deepEqual(scripts.map((entry) => entry[1].match(/src="([^"]+)"/)[1]), ['fixtures.js', 'model.js', 'app.js']);
  assert.ok(scripts.every((entry) => entry[2] === '' && entry[1].includes('defer')));
  assert.doesNotMatch(html, /\bon\w+\s*=|\bstyle\s*=|https?:|<iframe|<object|\baction\s*=/i);
  for (const [, target] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(['#lesson', 'styles.css', 'fixtures.js', 'model.js', 'app.js', 'README.md'].includes(target), target);
  }
});

test('accessible controls have unique labels, explicit buttons, alerts, skip and reset-safe forms', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((entry) => entry[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const field of ['checkpoint', 'old-probe', 'delivery', 'effects', 'prediction']) {
    assert.match(html, new RegExp(`<label for="${field}">`));
    assert.ok(ids.includes(field));
  }
  for (const [, attributes] of html.matchAll(/<button\b([^>]*)>/g)) assert.match(attributes, /type="(?:submit|button)"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /class="skip" href="#lesson"/);
  assert.match(html, /<noscript>/);
  const css = read('styles.css').toString();
  assert.match(css, /:focus-visible/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@media/);
});

test('controller uses text-only rendering and memory-only model without network or unsafe evaluation', () => {
  const app = read('app.js').toString();
  for (const file of ['app.js', 'model.js', 'fixtures.js']) {
    assert.doesNotMatch(read(file).toString(), /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|Math\.random|Date\.now|setInterval/);
  }
  assert.match(app, /textContent/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call/);
  assert.match(app, /event\.preventDefault\(\)/);
});

test('browser global scripts execute without CommonJS or a package runtime', () => {
  const context = vm.createContext({});
  for (const file of ['fixtures.js', 'model.js']) new vm.Script(read(file).toString(), { filename: file }).runInContext(context);
  const result = vm.runInContext(`JSON.stringify((() => {
    const lesson = PartitionLesson.createLesson();
    lesson.reassign({checkpoint:'missing',oldProbe:'fenced',delivery:'complete',effects:'idempotent'});
    lesson.consume();
    return lesson.verify();
  })())`, context);
  const state = JSON.parse(result);
  assert.equal(state.result.outcome, 'FAIL');
  assert.equal(state.result.ownership, 'PASS');
  assert.equal(state.result.checkpoint, 'FAIL');
  assert.equal(state.batch.totalEffects, 6);
});
