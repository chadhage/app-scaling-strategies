'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./provenance.cjs');

test('portable manifest identifies the exact frozen source and bounded teaching contract', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const [key, value] of Object.entries({
    id: 'A-S085', sourceId: 'S085', parentId: 'D-S085', nativeSiblingId: 'B-S085',
    workerId: 'worker-A-S085', kano: 'S', kanoUnit: 'A-S085', packet: 'SC-S085',
    entryGate: 'SOURCE', mode: 'synthetic', entry: 'index.html', iac: 'N/A',
  })) assert.equal(manifest[key], value, key);
  assert.equal(manifest.objective, 'Submit competing promotions; only the valid lock/epoch owner may act.');
  assert.deepEqual(manifest.bounds, { inputCombinations: 8, submissionsPerAttempt: 2, maxTraceEvents: 5, retainedAttempts: 6 });
  const html = read('index.html').toString();
  assert.ok(html.includes(manifest.banner));
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  for (const phrase of ['never real deployment operations', 'B-S085 and D-S085 remain incomplete',
    'not an actual concurrent-controller', 'memory-only']) assert.ok(html.includes(phrase), phrase);
});

test('CSP, local assets, semantic controls and safe native reset are declared', () => {
  const html = read('index.html').toString();
  const app = read('app.js').toString();
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?! src=)|(?:id|name)="reset"/i);
  for (const id of ['first-session', 'contender-condition', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /href="#main"/);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|fetch\(|XMLHttpRequest|localStorage|sessionStorage|WebSocket/);
});
