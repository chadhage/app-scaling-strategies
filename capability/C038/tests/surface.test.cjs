'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
test('static surface has exact banner, explicit selection, copy/compare, context/history and fail-closed CSP', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="banner"[^>]*>Training rehearsal - synthetic data - not a live Azure result</);
  for (const id of ['fixture', 'load', 'candidate', 'copy', 'inspect', 'compare', 'reset',
    'status', 'error', 'coverage', 'inventory', 'context', 'history', 'native-flags']) assert.match(html, new RegExp(`id="${id}"`));
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|on(?:click|load|error)\s*=|unsafe-inline|unsafe-eval|<iframe|<form/i);
  const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
  assert.doesNotMatch(page, /innerHTML|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|WebSocket/);
  assert.match(page, /element\('fixture'\)\.focus\(\)/);
  assert.match(page, /element\('candidate'\)\.select\(\)/);
  assert.match(page, /previousOriginalUnchanged: true/);
});
test('unchanged C020 versions/C021 compatibility/C024 coverage are prior art, not instance evidence', () => {
  const contract = require('..\\..\\C020\\contract.js');
  const profiles = require('..\\..\\C020\\profiles.cjs');
  const compatibility = require('..\\..\\C021\\compatibility.js');
  const result = compatibility.rehearse(profiles.getProfileV2({ profileId: 'synthetic-001' }), 'v2', 'synthetic-001');
  assert.equal(contract.apiContract, 'getProfile/1');
  assert.ok(result);
  const upload = require('..\\..\\C024\\upload.js');
  assert.ok(Object.isFrozen(upload));
  const inventory = require('../model.js').inventory;
  assert.equal(inventory.scope, 'CLOSED_SYNTHETIC_NOT_ACTUAL_POOL');
  assert.equal(inventory.instances.length, 2);
  assert.ok(inventory.instances.every((item) => item.id.startsWith('fictional-C038-')));
});
test('CLI closed list and invalid commands are usable, JSON and native flags false', () => {
  const cli = path.join(root, 'cli.cjs');
  const result = spawnSync(process.execPath, [cli, 'list'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0);
  const list = JSON.parse(result.stdout);
  assert.ok(list.fixtures.includes('single-probe'));
  assert.equal(list.actualPoolReady, false);
  const invalid = spawnSync(process.execPath, [cli, 'inspect', 'complete', '--eligible'], { encoding: 'utf8', windowsHide: true });
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stderr).action, 'HOLD');
});
