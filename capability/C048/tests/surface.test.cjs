'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
const model = fs.readFileSync(path.join(root, 'admission.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'CONTRACT.txt'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));

test('exact original acceptance, frozen D/P0/H009, scope and banner are not relabeled', () => {
  assert.equal(manifest.cardId, 'C048');
  assert.equal(manifest.kano, 'D');
  assert.equal(manifest.kanoUnit, 'C048');
  assert.equal(manifest.units, 1);
  assert.equal(manifest.priority, 'P0');
  assert.deepEqual(manifest.parents, ['H009']);
  assert.equal(manifest.acceptance, 'Gate tier/schema compatibility before admission; verify incompatible data/event consumers block expansion.');
  assert.equal(manifest.authorization, 'local-compatibility-admission-model-only');
  assert.ok(html.includes(`<p id="training-banner">${manifest.banner}</p>`));
});

test('resource-free file entry uses unchanged exact dependency scripts and no inline/network assets', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, [
    '../C020/contract.js', '../C020/inspector.js', '../C021/compatibility.js', '../C023/ledger.js', 'admission.js', 'page.js'
  ]);
  assert.doesNotMatch(html, /https?:\/\/|<script(?! defer src=)|\son\w+\s*=|\sstyle\s*=|<iframe|<object|<img/i);
  assert.doesNotMatch(page, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|navigator\.clipboard/);
  assert.doesNotMatch(model, /require\(['"](?:https?|express|azure|@azure)/);
});

test('real submit/admit/expand/native-reset event handlers call the private session transition', () => {
  assert.match(page, /session\.dispatch\(command\)/);
  assert.match(page, /conduct\('inspect'\)/);
  assert.match(page, /conduct\('reset'\)/);
  assert.match(page, /\['admit-candidate', 'admit'\], \['expand-candidate', 'expand'\]/);
  assert.match(html, /id="archive-reset" type="reset"/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.doesNotMatch(page, /form\.reset\s*\(|\.innerHTML\s*=/);
  assert.match(page, /form\.addEventListener\('reset'/);
  assert.match(page, /event\.preventDefault\(\); return/);
  assert.match(page, /setTimeout\(\(\) => \{ reflectControls\(\); render\(\); \}, 0\)/);
});

test('all interactive controls have native labels, visible focus, live error and read-only export', () => {
  for (const id of [...html.matchAll(/<(?:input|select|textarea)\b[^>]*id="([^"]+)"/g)].map((match) => match[1])) {
    assert.ok(html.includes(`<label for="${id}">`), `Missing label for ${id}`);
  }
  assert.match(html, /id="status" role="status" aria-live="polite"/);
  assert.match(html, /id="error" role="alert"/);
  assert.match(html, /id="session-export" readonly/);
  assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /:focus-visible \{ outline: 3px/);
});

test('control edits and raw JSON edits invalidate current inspection without deleting original history', () => {
  assert.match(page, /STALE — candidate edited/);
  assert.match(page, /if \(event\.target !== candidateText\) reflectControls\(\)/);
  assert.match(page, /command\.candidateJSON = candidateText\.value/);
  assert.match(page, /C020Contract\.profiles\.map/);
  assert.doesNotMatch(page, /data-consumer-schema'\)\.value\s*=|data-adapter'\)\.value\s*=/);
  assert.match(page, /original history retained/);
});

test('CSP excludes connections, inline script, frames, objects, workers and form navigation', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const clause of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'",
    "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(clause));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:|blob:/);
});

test('remaining H009/native/Node24 scope and local effect assumptions stay explicitly incomplete', () => {
  for (const text of [html, contract]) {
    assert.match(text, /H009/);
    assert.match(text, /H003\/H005\/H008|H003 H005 H008/);
    assert.match(text, /Node24/);
    assert.match(text, /not durable|not durable transactions|not durable/);
    assert.match(text, /not real queue or protocol proof|NOT actual\s+queue\/protocol proof/);
  }
  assert.equal(manifest.qualifications.nativeQualified, false);
  assert.equal(manifest.qualifications.productionNode24Validated, false);
  assert.equal(manifest.qualifications.actualAzureCapacityOrControl, false);
  assert.equal(manifest.qualifications.cloudCalls, 0);
  assert.equal(manifest.qualifications.spend, 0);
  assert.equal(manifest.qualifications.iac, 'N/A');
  assert.match(contract, /zero units/);
});
