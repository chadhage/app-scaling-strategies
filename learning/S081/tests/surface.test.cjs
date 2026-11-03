'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./provenance.cjs');
const fixtures = require('..\\fixtures.js');
const html = read('index.html').toString();
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest identifies exact objective, one frozen unit, worked actions and honest limits', () => {
  for (const [key, value] of Object.entries({
    id: 'A-S081', sourceId: 'S081', parentId: 'D-S081', nativeSiblingId: 'B-S081', workerId: 'worker-A-S081',
    kano: 'S', kanoUnit: 'A-S081', packet: 'SC-S081', mode: 'synthetic', entry: 'index.html', iac: 'N/A',
    objective: 'Advance desired/observed states; a warm boolean cannot bypass routing/drain gates.',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
  })) assert.equal(manifest[key], value, key);
  assert.equal(html.split(manifest.banner).length - 1, 1);
  assert.equal(manifest.bounds.inputCombinations, 648);
  assert.equal(manifest.bounds.states, fixtures.states.length);
  assert.equal(manifest.bounds.retainedAttempts, fixtures.maxAttempts);
  assert.equal(manifest.bounds.maxTraceEvents, 16);
  assert.ok(manifest.assertions.includes('Desired requests do not advance observed state'));
  const docs = read('README.md').toString();
  for (const phrase of ['B-S081 and D-S081 remain incomplete', 'IaC', 'Node24', 'CAPTURE_BROWSER_EVIDENCE=1',
    '14 failures', '14 genuine ERR_ASSERTION', 'read-only', 'CRLF', 'no credit', 'memory-only']) {
    assert.ok(docs.includes(phrase), phrase);
  }
});

test('every allowlisted input is labelled; defaults and native reset are not shadowed', () => {
  for (const [id, choices] of Object.entries(fixtures.choices)) {
    assert.ok(html.includes(`<label for="${id}">`), id);
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
    assert.deepEqual([...select.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]), choices);
    assert.equal(choices[0], fixtures.defaults[id]);
  }
  assert.match(html, /<label for="prediction">/);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /href="#main"/);
  assert.match(html, /id="main" tabindex="-1"/);
  assert.doesNotMatch(html, /\b(?:id|name)=["']reset["']/);
  assert.match(read('app.js').toString(), /HTMLFormElement\.prototype\.reset\.call/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(read('styles.css').toString(), /overflow-x: auto/);
});

test('CSP and executable assets are local, restrictive and resource-free', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(policy.includes(directive), directive);
  }
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

test('BDD and visible inspection preserve intended versus observed evidence and honest denominators', () => {
  assert.equal(Object.values(fixtures.choices).reduce((count, values) => count * values.length, 1), 648);
  assert.deepEqual(fixtures.states, ['CREATED', 'WARMING', 'READY', 'CANARY', 'ACTIVE', 'DRAINING', 'RETAINED', 'RETIRED']);
  assert.equal(fixtures.legacyWarm, true);
  for (const id of ['desired-state', 'observed-state', 'gate-rows', 'trace-rows', 'routing-metrics',
    'prediction-result', 'attempt-totals', 'history-count', 'current-proof', 'retained-proof']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  const bdd = read('lifecycle.feature').toString();
  for (const phrase of ['warm', 'desired', 'UNKNOWN', 'seventh attempt', 'CSP', 'out-of-order', 'retention']) {
    assert.ok(bdd.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
});
