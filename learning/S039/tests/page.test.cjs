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
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('source identity, exact banner, operating envelope and native boundaries are visible', () => {
  for (const required of [
    'S039', 'Instance-local temporary state', 'Training rehearsal - synthetic data - not a live Azure result',
    'D-S039', 'B-S039', '12 runs', '12 verified journeys', '256 ASCII bytes',
    'in-memory store', 'AS IS', 'not a Microsoft SLA',
  ]) assert.ok(html.includes(required), required);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
});

test('CSP denies connections, inline execution, forms, frames, objects and workers', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('runtime renders text without network, browser persistence, timers or dynamic code', () => {
  const source = read('app.js') + read('model.js');
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /setTimeout|setInterval|Math\.random|Date\.now|new Date/);
  assert.doesNotMatch(read('styles.css'), /@import|url\s*\(/);
  assert.match(source, /textContent/);
});

test('controls expose labels and keyboard/error semantics without shadowing form methods', () => {
  for (const id of ['kind', 'storage', 'observation']) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.ok(html.includes(`<select id="${id}" name="${id}">`));
  }
  assert.doesNotMatch(html, /(?:id|name)="(?:reset|submit|elements|action|method)"/);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('app.js'), /error\.focus\(\)/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('model loads as a browser global without Node (not a DOM observation)', () => {
  const context = vm.createContext({});
  new vm.Script(read('model.js')).runInContext(context);
  assert.equal(typeof context.ArtifactHandoff.createLesson, 'function');
  const result = vm.runInContext(
    "(() => { const lesson = ArtifactHandoff.createLesson(); lesson.prepare({kind:'workflow',storage:'durable',observation:'intact'}); lesson.handoff(); return lesson.verify(); })()",
    context,
  );
  assert.equal(result.verdict, 'success');
  assert.equal(result.owner, 'B');
});

test('archived RED is genuine and raw bytes plus exact non-discovered snapshots remain intact', () => {
  const red = JSON.parse(read('evidence/red.json'));
  const replay = JSON.parse(read('evidence/red-replay.json'));
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
  for (const [snapshot, original] of [
    ['evidence/red/model.stub.snapshot', 'model.js'],
    ['evidence/red/contract.source.snapshot', 'tests\\model.test.cjs'],
  ]) assert.equal(hash(fs.readFileSync(path.join(lesson, snapshot))), red.inputs.find((entry) => entry.path === original).sha256);
  assert.equal(JSON.parse(read('evidence/iac-na.json')).status, 'N/A');
  assert.ok(new Date(red.completedAtUtc) <= new Date(replay.startedAtUtc));
});

test('manifest preserves one frozen satisfier, exact packet and separate native remainder', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S039');
  assert.equal(manifest.sourceId, 'S039');
  assert.equal(manifest.parentId, 'D-S039');
  assert.equal(manifest.packet, 'SC-S039');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S039');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.productionNode24Validated, false);
});
