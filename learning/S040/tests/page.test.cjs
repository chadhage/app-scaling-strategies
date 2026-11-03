'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('..\\model.js');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest identifies the exact strategy, single unit and synthetic boundary', () => {
  assert.deepEqual(
    [manifest.cardId, manifest.sourceId, manifest.parentId, manifest.packet, manifest.kano, manifest.kanoUnit],
    ['A-S040', 'S040', 'D-S040', 'SC-S040', 'S', 'A-S040'],
  );
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.iac, 'N/A');
  for (const key of ['cloudCalls', 'credentials', 'identityRegistration', 'liveAuthentication', 'nativeProof', 'parentComplete', 'productionNode24Validated']) {
    assert.equal(manifest[key], false);
  }
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'sourceReferences']) assert.ok(manifest[key].length);
  assert.equal(manifest.limits.recordedRehearsalsPerPage, model.MAX_REHEARSALS);
  assert.equal(manifest.limits.declaredConfigurations, 64);
  assert.ok(html.includes(`<p class="banner">${manifest.trainingLabel}</p>`));
});

test('local asset allowlist has no inline script, inline style or event handlers', () => {
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link\b[^>]*href="([^"]+)"/g)].map((match) => match[1]), ['styles.css']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|\sstyle\s*=|<iframe\b|<object\b|\saction\s*=/i);
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.equal(script[1].trim(), '');
  }
  for (const asset of ['model.js', 'app.js', 'styles.css']) assert.ok(fs.statSync(path.join(root, asset)).isFile());
});

test('CSP denies network, embedding, form navigation and inline execution', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'",
    "worker-src 'none'", "img-src 'none'",
  ]) assert.ok(csp.split(';').map((part) => part.trim()).includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|\*/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
});

test('all configuration choices have labels and exact bounded select options', () => {
  for (const [key, choices] of Object.entries(model.CHOICES)) {
    assert.ok(html.includes(`<label for="${key}">`));
    const select = html.match(new RegExp(`<select id="${key}" name="${key}">([\\s\\S]*?)<\\/select>`))[1];
    assert.deepEqual([...select.matchAll(/value="([^"]+)"/g)].map((match) => match[1]), choices);
  }
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="result" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="reset-lesson" type="button"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="history"/);
  assert.match(html, /scope="col"/);
});

test('browser code uses text-only rendering and does not reach network, credentials or storage', () => {
  const code = read('app.js') + read('model.js');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.cookie|localStorage|sessionStorage|indexedDB|XMLHttpRequest|\bfetch\s*\(|\beval\s*\(|new Function/);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('app.js'), /event\.preventDefault\(\)/);
  assert.match(read('app.js'), /error\.focus\(\)/);
});
