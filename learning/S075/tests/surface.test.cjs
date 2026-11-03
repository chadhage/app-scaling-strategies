'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./provenance.cjs');
const fixtures = require('..\\fixtures.js');
const html = read('index.html').toString();
const manifest = JSON.parse(read('manifest.json'));

test('portable entry and manifest declare exact source, one frozen unit, worked actions and honest limits', () => {
  assert.equal(manifest.id, 'A-S075');
  assert.equal(manifest.sourceId, 'S075');
  assert.equal(manifest.parentId, 'D-S075');
  assert.equal(manifest.nativeSiblingId, 'B-S075');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S075');
  assert.equal(manifest.packet, 'SC-S075');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.objective, 'Add consumers; detect duplicate owners and duplicate business effects.');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(html.split(manifest.banner).length - 1, 1);
  assert.equal(manifest.bounds.inputCombinations, 64);
  assert.equal(manifest.bounds.retainedAttempts, fixtures.maxAttempts);
  assert.ok(manifest.assertions.includes('Delivery duplicates are distinct from duplicate effects'));
  const docs = read('README.md').toString();
  for (const phrase of ['B-S075 and D-S075 remain incomplete', 'IaC', 'Node24', 'CAPTURE_BROWSER_EVIDENCE=1',
    '17 failures', '6 actual assertion failures', 'read-only', 'CRLF', 'no credit']) {
    assert.ok(docs.includes(phrase), phrase);
  }
});

test('every allowlisted input has a matching explicit label and browser options; native reset is not shadowed', () => {
  for (const [id, choices] of Object.entries(fixtures.choices)) {
    assert.ok(html.includes(`<label for="${id}">`));
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
    assert.deepEqual([...select.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]), choices);
  }
  assert.ok(html.includes('<label for="prediction">'));
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /href="#main"/);
  assert.match(html, /id="main" tabindex="-1"/);
  assert.doesNotMatch(html, /\b(?:id|name)=["']reset["']/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(read('styles.css').toString(), /overflow-x: auto/);
});

test('CSP is restrictive and executable assets are local, external-file-only and resource-free', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(policy.includes(directive), directive);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.equal([...html.matchAll(/<script\b/g)].length, 3);
  assert.doesNotMatch(html, /\bon\w+\s*=|<style\b|\bstyle=|(?:src|href)=["'](?:https?:|\/\/|data:)/i);
  for (const file of ['fixtures.js', 'model.js', 'app.js']) {
    assert.doesNotMatch(read(file).toString(),
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|eval)\s*\(|innerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.write/);
  }
});

test('BDD, fixture denominator and UI retain separate ownership, delivery, effects, unknown and learning results', () => {
  assert.equal(fixtures.events.length, 6);
  assert.equal(new Set(fixtures.events.map((event) => event.id)).size, 6);
  assert.equal(fixtures.partitions.length, 3);
  assert.equal(Object.values(fixtures.choices).reduce((count, values) => count * values.length, 1), 64);
  for (const id of ['ownership-result', 'ownership-metrics', 'delivery-metrics', 'effect-metrics',
    'coverage-metrics', 'event-totals', 'prediction-result', 'totals', 'history-count', 'retained-proof']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  const bdd = read('consumer-scale-out.feature').toString();
  for (const phrase of ['duplicate', 'UNKNOWN', 'seventh attempt', 'CSP', 'out-of-order', 'new consumers']) {
    assert.ok(bdd.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
});
