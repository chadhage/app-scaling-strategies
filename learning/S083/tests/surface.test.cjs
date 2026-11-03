'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');

test('portable manifest identifies one frozen source unit and explicit rehearsal limits', () => {
  assert.equal(manifest.id, 'A-S083');
  assert.equal(manifest.sourceId, 'S083');
  assert.equal(manifest.parentId, 'D-S083');
  assert.equal(manifest.nativeSiblingId, 'B-S083');
  assert.equal(manifest.workerId, 'worker-A-S083');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S083');
  assert.equal(manifest.packet, 'SC-S083');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.objective, 'Restart a controller trace; identify duplicate destructive work after unsafe resumption.');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  for (const key of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length > 0);
  assert.equal(manifest.bounds.inputCombinations, 8);
  assert.equal(manifest.bounds.userJourneysPerAttempt, 3);
  assert.equal(manifest.bounds.retainedAttempts, 6);
  assert.match(manifest.limits.join(' '), /No actual controller restart/);
  assert.match(manifest.acceptance, /Parent-owned empirical acceptance pending/);
  for (const file of [manifest.entry, manifest.fixture, manifest.sourceContract, manifest.bdd]) {
    assert.ok(fs.statSync(path.join(root, file)).isFile());
  }
});

test('CSP is enforced without inline script, inline handlers, unsafe directives or network capabilities', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|javascript:|<iframe|<object/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, attributes, body] of scripts) {
    assert.match(attributes, /src="(?:model|app)\.js"/);
    assert.match(attributes, /\bdefer\b/);
    assert.equal(body.trim(), '');
  }
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  for (const reference of [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1])) {
    assert.ok(reference.startsWith('#') || ['styles.css', 'model.js', 'app.js'].includes(reference));
  }
});

test('lesson scripts only calculate and render data; no shell, resource, storage or remote operation exists', () => {
  const source = `${read('model.js')}\n${read('app.js')}`;
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|child_process|execSync|spawnSync|\brequire\s*\(|navigator\./);
  assert.doesNotMatch(source, /innerHTML|outerHTML|document\.write|eval\s*\(|new Function/);
  assert.match(source, /DATA ONLY/);
  assert.match(source, /textContent/);
});

test('keyboard controls have unique labels, visible focus, live feedback and non-shadowing reset', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['policy', 'evidence', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /id="error"[^>]+role="alert"/);
  assert.match(html, /id="result"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /href="#exercise"/);
  assert.match(read('styles.css'), /:focus-visible\s*\{[^}]*outline:\s*3px/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(setup\)/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(predictionForm\)/);
  assert.match(html, /Reset all \(clear history\)/);
  assert.match(html, /Memory only/);
});

test('BDD covers exact source behavior, negative evidence and browser UX rather than copying the title', () => {
  const feature = read('controller-restart.feature');
  assert.equal((feature.match(/^\s*Scenario:/gm) || []).length, 10);
  for (const phrase of ['one execution', 'duplicate destructive', 'UNKNOWN', 'denominator', 'recorded pre-crash user failure', 'prediction', 'rejected', 'six', 'Keyboard', 'content policy']) {
    assert.ok(feature.includes(phrase), phrase);
  }
  assert.ok(html.includes(manifest.banner));
});
