'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('standalone manifest binds the exact S077 source, objective and bounded synthetic contract', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const source = JSON.parse(read('evidence\\source-contract.json'));
  assert.equal(manifest.cardId, 'A-S077');
  assert.equal(manifest.sourceId, 'S077');
  assert.equal(manifest.parentId, 'D-S077');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S077');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Redeliver one message; distinguish repeated delivery from repeated business effects.');
  assert.match(source.sourceRow, /Preserve one business effect even when the broker delivers a message again/);
  assert.equal(manifest.bounds.configurations, 6);
  assert.equal(manifest.bounds.maximumDeliveries, 2);
  assert.equal(manifest.bounds.retainedAttempts, 6);
  for (const key of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length >= 4);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(read('README.md'), /B-S077 and D-S077 remain incomplete/);
  assert.match(read('README.md'), /not actual broker redelivery, durable deduplication/i);
});

test('browser model loads without CommonJS, dependencies or remote APIs', () => {
  const context = {};
  vm.runInNewContext(read('model.js'), context);
  assert.equal(typeof context.Lesson077.createRehearsal, 'function');
  assert.equal(context.Lesson077.createRehearsal().phase, 'ready');
  assert.equal(context.Lesson077.fixture.messageId, 'MSG-077');
  assert.doesNotMatch(read('model.js') + read('app.js'), /\bfetch\s*\(|XMLHttpRequest|WebSocket|new Worker|localStorage|sessionStorage|setInterval|setTimeout/);
  assert.doesNotMatch(read('app.js'), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('semantic HTML, native reset, bounded external assets and explicit CSP support portable keyboard UX', () => {
  const html = read('index.html');
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|(?:id|name)="reset"/i);
  assert.equal((html.match(/<script /g) || []).length, 2);
  for (const asset of ['model.js', 'app.js', 'styles.css']) {
    assert.ok(html.includes(`"${asset}"`));
    assert.ok(fs.existsSync(path.join(root, asset)));
  }
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\/|<iframe/i);
  for (const id of ['handler', 'first-outcome', 'prediction']) assert.ok(html.includes(`for="${id}"`));
  assert.match(read('app.js'), /configuration\.reset\(\)/);
  assert.match(read('app.js'), /interpretation\.reset\(\)/);
  assert.match(read('styles.css'), /:focus-visible \{ outline: 3px/);
});
