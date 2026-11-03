'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable entry has exact banner, source boundaries, local assets and restrictive CSP', () => {
  const html = read('index.html');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const id of ['A-S071', 'S071 / D-S071', 'SC-S071', 'B-S071 and D-S071 remain incomplete']) {
    assert.ok(html.includes(id), id);
  }
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:|\son\w+=/i);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) assert.equal(match[1].trim(), '');
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['fixture.js', 'model.js', 'app.js']);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/<label for="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.match(html, /Known failures take precedence over missing evidence/);
});

test('exercise code is framework-free, bounded, text-only rendering and free of external side effects', () => {
  const app = read('app.js');
  const model = read('model.js');
  assert.match(app, /configForm\.reset\(\)/);
  assert.match(app, /predictionForm\.reset\(\)/);
  assert.match(app, /cell\.textContent = String\(value\)/);
  assert.match(model, /new WeakSet/);
  assert.match(model, /JSON\.stringify/);
  assert.match(model, /JSON\.parse/);
  assert.match(model, /new Map/);
  assert.match(model, /MAX_ATTEMPTS/);
  for (const source of [app, model, read('fixture.js')]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|innerHTML|eval\s*\(|new Function|setInterval|Math\.random|Date\.now|https?:/);
  }
});
