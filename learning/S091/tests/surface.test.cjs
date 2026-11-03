'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(lesson, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');

test('the per-card manifest declares the exact source, packet, finite envelope and resource-free boundary', () => {
  assert.equal(manifest.id, 'A-S091');
  assert.equal(manifest.sourceId, 'S091');
  assert.equal(manifest.parentId, 'D-S091');
  assert.equal(manifest.packet, 'SC-S091');
  assert.equal(manifest.kanoUnit, 'A-S091');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.equal(manifest.objective, 'Crash a warming candidate; distinguish safe abort from completed migration.');
  assert.equal(manifest.preconditions.attemptLimit, 6);
  assert.equal(manifest.preconditions.originalJourneyBudgetMs, 250);
  assert.equal(manifest.iac, 'N/A');
  for (const file of [...manifest.assets, manifest.bdd, 'README.md']) assert.ok(fs.statSync(path.join(lesson, file)).isFile());
  assert.ok(manifest.limits.some((item) => item.includes('real readiness/abort/production continuity')));
});

test('portable HTML has the exact banner, local assets, no inline code and a strict enforced CSP', () => {
  assert.equal(html.split(manifest.banner).length - 1, 1);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive));
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|\*/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>|<style\b|\sstyle=/i);
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((item) => item[1]);
  assert.deepEqual(scripts, ['model.js', 'app.js']);
  assert.match(html, /href="styles\.css"/);
  assert.doesNotMatch(html, /(?:src|href|action)="(?:https?:|\/\/|data:)/);
});

test('controls are labeled, errors are accessible and reset cannot shadow native form.reset', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((item) => item[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('reset'));
  assert.doesNotMatch(html, /\bname="reset"/);
  for (const id of ['fixture', 'conclusion']) assert.match(html, new RegExp(`label for="${id}"`));
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="lesson-status" role="status" aria-live="polite"/);
  assert.match(html, /id="reset-lesson" type="button"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('app.js'), /fixture\.focus\(\)/);
  assert.doesNotMatch(read('app.js'), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('runtime lesson code contains no actual management, process, network or durable-storage actions', () => {
  const runtime = `${read('model.js')}\n${read('app.js')}`;
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|Worker|eval|Function|setTimeout|setInterval)\s*\(|child_process|process\.(?:kill|exit)|localStorage|sessionStorage|sendBeacon|https?:\/\//);
  assert.doesNotMatch(runtime, /\brequire\s*\(/);
  assert.equal(read('.gitattributes').split(/\r?\n/).filter((line) => line.includes('-text')).join('\n'), 'evidence/raw/** -text -diff');
  assert.match(read('README.md'), /B-S091.*not ready/);
  assert.match(read('README.md'), /D-S028/);
  assert.match(read('README.md'), /no extra.*credit/i);
});
