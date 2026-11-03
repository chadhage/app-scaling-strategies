'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');
const html = read('index.html');

test('source identity, exact training banner, limits and separate native proof are visible', () => {
  for (const required of [
    'S037', 'Session serialization change',
    'Training rehearsal - synthetic data - not a live Azure result',
    'B-S037', 'D-S037', '12 recorded actions', '12 runs',
    'AS IS', 'not a Microsoft SLA', 'nothing is persisted',
  ]) assert.ok(html.includes(required), required);
  assert.match(html, /<html lang="en">/);
});

test('CSP allows only sibling scripts and styles while denying connections and execution surfaces', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('runtime uses text nodes, no network or persistence API, and no dynamic code evaluation', () => {
  const scripts = read('app.js') + read('model.js');
  assert.doesNotMatch(scripts, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function/);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(read('styles.css'), /@import|url\s*\(/);
  assert.match(scripts, /textContent/);
});

test('controls have labels, safe form method names and keyboard/error/result semantics', () => {
  for (const id of ['reader', 'writer', 'payload']) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.ok(html.includes(`<select id="${id}" name="${id}">`));
  }
  assert.doesNotMatch(html, /(?:id|name)="(?:reset|submit|elements|action|method)"/);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="restart"/);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('app.js'), /error\.focus\(\)/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('browser global export loads without Node and matches CommonJS behavior (not a DOM test)', () => {
  const context = vm.createContext({});
  new vm.Script(read('model.js')).runInContext(context);
  assert.equal(typeof context.SessionSerialization.createLesson, 'function');
  const result = vm.runInContext(
    "SessionSerialization.createLesson().transition({reader:'dual',writer:'schema1',payload:'intact'})",
    context,
  );
  assert.equal(result.verdict, 'success');
  assert.equal(result.successful, 3);
});

test('genuine archived RED bytes and raw output digests remain intact and non-discovered', () => {
  const red = JSON.parse(read('evidence/red.json'));
  const replay = JSON.parse(read('evidence/red-replay.json'));
  const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(red.exitCode, 1);
  assert.equal(replay.exitCode, 1);
  for (const capture of [red, replay]) {
    for (const name of ['stdout', 'stderr']) {
      const bytes = Buffer.from(capture[name].base64, 'base64');
      assert.equal(bytes.length, capture[name].bytes);
      assert.equal(hash(bytes), capture[name].sha256);
    }
    const output = Buffer.from(capture.stdout.base64, 'base64').toString('utf8');
    assert.match(output, /ERR_ASSERTION/);
    assert.match(output, /actual: 'unknown'/);
    assert.match(output, /expected: 'success'/);
    assert.doesNotMatch(output, /MODULE_NOT_FOUND|SyntaxError/);
  }
  const stub = fs.readFileSync(path.join(lesson, 'evidence', 'red', 'model.stub.snapshot'));
  assert.equal(hash(stub), red.inputs.find((input) => input.path === 'model.js').sha256);
  const original = fs.readFileSync(path.join(lesson, 'evidence', 'red', 'contract.source.snapshot'));
  assert.equal(hash(original), '489efbcd25ec781aa435074ed616ed808c08ea8bf96c39d078455a4b215e1ee0');
  assert.equal(JSON.parse(read('evidence/iac-na.json')).status, 'N/A');
});

test('manifest preserves one card, packet and synthetic scope without parent completion', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S037');
  assert.equal(manifest.sourceId, 'S037');
  assert.equal(manifest.parentId, 'D-S037');
  assert.equal(manifest.packet, 'SC-S037');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.nativeProof, false);
});
