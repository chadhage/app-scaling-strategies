'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const F = require('../fixtures.js');

test('portable manifest identifies exact objective, source, single frozen unit and native limitations', () => {
  assert.equal(manifest.cardId, 'A-S061');
  assert.equal(manifest.sourceId, 'S061');
  assert.equal(manifest.parentId, 'D-S061');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S061');
  assert.equal(manifest.packet, 'SC-S061');
  assert.equal(manifest.owner, 'worker-A-S061');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Add a reader; preserve read-your-writes rather than assuming every replica is current.');
  assert.equal(manifest.requiredVisibleLabel, F.banner);
  assert.equal(manifest.entryPoint, 'learning/S061/index.html');
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length >= 4);
  assert.equal(manifest.bounds.configurations, 54);
  assert.equal(manifest.bounds.completedAttempts, F.maxAttempts);
  assert.equal(manifest.bounds.readsPerAttempt, F.plan.length);
  assert.equal(manifest.bounds.writers, 1);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.limits.join('\n'), /B-S061.*D-S061.*unfulfilled/);
  assert.match(manifest.limits.join('\n'), /No actual database/);
});

test('standalone page uses only owned external resources with enforced restrictive CSP', () => {
  const html = read('index.html');
  assert.ok(html.includes(F.banner));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<noscript>/);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ['default-src', 'connect-src', 'object-src', 'base-uri', 'form-action',
    'frame-src', 'worker-src', 'img-src', 'font-src', 'media-src']) {
    assert.ok(csp.split(';').map((part) => part.trim()).includes(`${directive} 'none'`));
  }
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("style-src 'self'"));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]),
    ['styles.css', 'fixtures.js', 'model.js', 'app.js', 'README.md']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<iframe|<object|<style|style=|type="password"|https?:\/\//i);
});

test('native controls, labels, accessible errors, table regions and safe reset IDs are present', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.includes('reset'), false);
  assert.doesNotMatch(html, /\bname="reset"/);
  for (const key of [...Object.keys(F.defaults), 'prediction']) {
    assert.match(html, new RegExp(`<label for="${key}"`));
    assert.match(html, new RegExp(`<select id="${key}"`));
  }
  for (const id of ['write', 'add-reader', 'run-reads', 'check-prediction', 'new-attempt', 'reset-rehearsal']) {
    assert.match(html, new RegExp(`<button[^>]+id="${id}"`));
  }
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.equal((html.match(/role="region" aria-label=/g) || []).length, 2);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="cleanup"/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('styles.css'), /overflow: auto/);
  assert.match(read('styles.css'), /overflow-wrap: anywhere/);
  assert.doesNotMatch(read('styles.css'), /@import|url\(/i);
});

test('DOM rendering is text-only with private model state and correctly separated new/reset actions', () => {
  const app = read('app.js');
  assert.match(app, /textContent/);
  assert.match(app, /model\.newAttempt\(\)/);
  assert.match(app, /model\.reset\(\)/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /predictionForm\.reset\(\)/);
  assert.match(app, /aria-invalid/);
  assert.match(app, /aria-errormessage/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|localStorage|sessionStorage|setTimeout/);
  assert.doesNotMatch(read('model.js'), /Math\.random|Date\.now|fetch\(|XMLHttpRequest|localStorage/);
});

test('worked BDD and documentation retain failure, unknown, read-offload and evidence boundaries', () => {
  const feature = read('read-replica.feature');
  const documentation = read('README.md');
  for (const phrase of ['3 correct, 1 failed', 'read-your-writes', 'UNKNOWN', 'six', 'CSP', 'form.reset']) {
    assert.ok(feature.includes(phrase), phrase);
  }
  for (const phrase of [F.banner, 'CAPTURE_BROWSER_EVIDENCE', 'read-only', 'Node.js 22.23.4',
    'B-S061', 'D-S061', '53c0c0d', '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055']) {
    assert.ok(documentation.includes(phrase), phrase);
  }
  assert.match(documentation, /not.*write scalability/i);
  assert.match(documentation, /real.*replication/i);
});
