'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'attribution.js'), 'utf8');

test('exact banner, historical browser context and explicitly fictional/native-separated statuses', () => {
  assert.match(html, />Training rehearsal - synthetic data - not a live Azure result</);
  assert.match(html, /bundled historical actual C015 observation/);
  assert.match(html, /no authenticated client\/run\/user\/lease correlation/);
  assert.match(html, /Native\/authenticated correlation: UNVERIFIED/);
  assert.match(html, /Full native\/authenticated correlation.*production Node 24 remain incomplete/);
});
test('bounded keyboard controls and accessible output/error/history/reset are present', () => {
  for (const id of ['load', 'inspect', 'attach', 'reset']) assert.match(html, new RegExp(`<button id="${id}" type="button">`));
  assert.match(html, /<label for="candidate">/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(page, /byId\('evidence'\)\.focus\(\)/);
  assert.match(page, /entries\.length >= 16/);
  assert.doesNotMatch(page, /entries\.length = 0|history\.length = 0/);
});
test('CSP and local assets cannot become network, paths, endpoints or an authority service', () => {
  for (const directive of ["default-src 'none'", "connect-src 'none'", "script-src 'self'",
    "frame-src 'none'", "worker-src 'none'", "form-action 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /https?:|unsafe-inline|unsafe-eval|on(?:click|load)=/);
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(core, /require\('node:(?:http|https|fs)'\)|persist\(/);
});
test('BDD, IaC and manifest preserve original unit/gates and incomplete native parents', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.kano, 'D');
  assert.equal(manifest.originalKanoUnit, 'C036');
  assert.deepEqual(manifest.entryGates, ['C015', 'C034']);
  assert.equal(manifest.iac, 'N/A');
  assert.equal(manifest.authenticatedIdentityVerified, false);
  assert.equal(manifest.leaseAuthority, false);
  assert.match(fs.readFileSync(path.join(root, 'C036.feature'), 'utf8'), /private attachment transition/);
});
test('normal or truthy-but-not-exact capture flags cannot write source/evidence or launch a browser', () => {
  const { snapshot } = require('./inventory.cjs');
  const before = snapshot(root);
  for (const flag of [undefined, 'true', '01', '0']) {
    const env = { ...process.env };
    delete env.CAPTURE_BROWSER_EVIDENCE;
    delete env.C036_CAPTURE_DIR;
    if (flag !== undefined) env.CAPTURE_BROWSER_EVIDENCE = flag;
    const run = spawnSync(process.execPath, [path.join(__dirname, 'record.cjs'), 'browser'],
      { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Capture requires exact CAPTURE_BROWSER_EVIDENCE=1/);
  }
  assert.deepEqual(snapshot(root), before);
});
