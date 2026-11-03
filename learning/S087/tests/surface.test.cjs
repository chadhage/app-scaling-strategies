'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, read } = require('./provenance.cjs');
const fixtures = require('..\\fixtures.js');
const html = read('index.html').toString();

test('standalone manifest declares exact source objective, frozen ownership, worked inputs and honest limits', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const [key, value] of Object.entries({
    cardId: 'A-S087', workerId: 'worker-A-S087', sourceId: 'S087', parentId: 'D-S087',
    siblingId: 'B-S087', kano: 'S', kanoUnit: 'A-S087', packet: 'SC-S087', entryGate: 'SOURCE',
    entry: 'index.html', mode: 'synthetic',
    objective: 'Apply only part of a routing change; remaining clients must retain a valid destination.',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
  })) assert.equal(manifest[key], value, key);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length >= 3);
  for (const key of ['managementCalls', 'credentials', 'nativeAcceptanceCompleted']) assert.equal(manifest[key], false);
  assert.match(manifest.parentAcceptance, /pending/);
  for (const phrase of ['Desired percentages do not imply convergence', 'six', 'UNKNOWN', 'not real retirement',
    'B-S087 and D-S087 remain incomplete', '15 genuine ERR_ASSERTION']) assert.ok(read('README.md').toString().includes(phrase), phrase);
});

test('entry uses only existing local assets and an exact prominent banner under restrictive CSP', () => {
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((value) => !value.startsWith('#'));
  assert.deepEqual(assets.sort(), ['README.md', 'app.js', 'fixtures.js', 'model.js', 'styles.css'].sort());
  for (const asset of assets) assert.ok(fs.statSync(path.join(root, asset)).isFile());
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:|<iframe|<script(?![^>]*\bsrc=)[^>]*>|style=|\son\w+=/i);
});

test('exact allowlisted selectors, unique labels and native-reset-safe form controls are keyboard-addressable', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [id, expected] of Object.entries({ ...fixtures.options, prediction: ['', ...fixtures.outcomes] })) {
    const body = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1];
    assert.deepEqual([...body.matchAll(/value="([^"]*)"/g)].map((match) => match[1]), expected);
    assert.ok(html.includes(`<label for="${id}">`));
  }
  assert.match(html, /class="skip" href="#main"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('app.js').toString(), /HTMLFormElement\.prototype\.reset\.call/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
});

test('browser model loads without Node or a framework and preserves desired/observed distinction', () => {
  const context = vm.createContext({});
  for (const file of ['fixtures.js', 'model.js']) new vm.Script(read(file).toString()).runInContext(context);
  const result = vm.runInContext(`(() => {
    const lesson = S087Model.createLesson();
    const requested = lesson.request({target:'100', propagation:'partial', old:'retained'});
    lesson.observe();
    const done = lesson.releaseOld();
    return JSON.stringify({requested, done});
  })()`, context);
  const { requested, done } = JSON.parse(result);
  assert.equal(requested.current.observation, null);
  assert.equal(done.current.observation.effectivePercent, 50);
  assert.equal(done.current.observation.journeys.success, 8);
  assert.equal(done.current.retention, 'RETAIN_REQUIRED');
  assert.equal(done.current.outcome, 'FAILURE');
});

test('lesson code has no network, storage, unsafe rendering, time or random result path', () => {
  const code = ['fixtures.js', 'model.js', 'app.js'].map((file) => read(file).toString()).join('\n');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|eval|setTimeout|setInterval)\b|innerHTML|outerHTML|document\.write|Math\.random|Date\.now|https?:/);
  assert.match(read('app.js').toString(), /textContent/);
});
