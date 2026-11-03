'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest preserves exact source acceptance, portable scope and frozen packet identity', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S053');
  assert.equal(manifest.parentId, 'D-S053');
  assert.equal(manifest.packet, 'SC-S053');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S053');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.exactSourceBehavior, 'Use versioned endpoints or transitional adapters instead of abruptly changing a live contract.');
  assert.equal(manifest.exactParentAcceptance, 'A stable compatible route can migrate all consumers; a breaking API cannot be force-rerouted and declared uninterrupted.');
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.bounds.configurationCombinations, 36);
  assert.ok(manifest.limits.some((limit) => limit.includes('B-S053')));
});

test('HTML is standalone, prominently labelled and has distinct accessible controls', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('aria-live="polite"'));
  for (const id of ['deployment', 'route', 'upgrades', 'observation']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}" name="${id}"`));
  }
  assert.ok(!/\b(?:name|id)="reset"/i.test(html));
  assert.ok(html.includes('id="restart" type="button"'));
  assert.ok(html.includes('scope="col"'));
  assert.ok(html.includes('Microsoft Open Source Disclaimer'));
});

test('local CSP denies connections, inline execution, forms, frames, workers and objects', () => {
  const html = read('index.html');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy);
  for (const clause of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(policy.includes(clause), clause);
  assert.ok(!/unsafe-inline|unsafe-eval|https:|data:|blob:/.test(policy));
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  assert.ok(!/<script\b(?![^>]*\bsrc=)[^>]*>| on\w+=|style="/i.test(html));
});

test('runtime contains no network, persistence, HTML injection or implicit reset behavior', () => {
  const app = read('lesson.js');
  const model = read('model.js');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|innerHTML|eval\s*\(/.test(app + model));
  assert.ok(app.includes('HTMLFormElement.prototype.reset.call(form)'));
  assert.ok(app.includes('error.focus()') && app.includes("get('deployment').focus()"));
  assert.ok(!/Math\.random|Date\.now|setTimeout|setInterval/.test(app + model));
  assert.ok(read('styles.css').includes(':focus-visible'));
});
