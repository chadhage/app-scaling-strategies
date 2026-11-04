'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const classifier = require('..\\classifier.js');
const root = path.resolve(__dirname, '..');

test('static UI has exact banner, CSP, explicit selections, all six dimensions, history and cancellation boundaries', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'", "object-src 'none'", "base-uri 'none'"]) {
    assert.ok(html.includes(directive));
  }
  assert.match(html, /BROWSER: bundled HISTORICAL/);
  assert.match(html, /C017 is NOT DONE/);
  assert.match(html, /Cancelled work, no effects and external undo are separate claims/);
  assert.match(html, /tabindex="-1"/);
  for (const id of classifier.ids) assert.ok(html.includes(`value="${id}"`), id);
  assert.equal(/<script(?![^>]*src=)[^>]*>[\s\S]+?<\/script>/.test(html), false);
  assert.equal(/innerHTML|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|Worker\(/.test(page), false);
  assert.match(page, /textContent/);
  assert.match(page, /BUNDLED_HISTORICAL_C015_PUBLIC_RESTORE_OBSERVATION_ONLY/);
});
test('CLI closed arguments reject file paths/flags visibly before any source/context adoption', () => {
  for (const args of [[], ['inspect'], ['cancel', 'synthetic-run-001'], ['inspect', 'closed-history', '--eligible'],
    ['reset', 'history.json'], ['--authority', 'true']]) {
    const run = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), ...args], {
      cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true
    });
    assert.equal(run.status, 3);
    const output = JSON.parse(run.stdout);
    assert.equal(output.valid, false);
    assert.equal(output.code, 'CLOSED_CLI_ARGUMENTS_REQUIRED');
    assert.equal(output.decision, 'HOLD');
    assert.equal(output.actualUserMutationSuccess, false);
  }
});
test('owned source never calls persist, cancellation, lifecycle prototype, cloud SDK or package installer', () => {
  const current = fs.readFileSync(path.join(root, 'current.cjs'), 'utf8');
  assert.match(current, /const \{ restore \}/);
  assert.equal(/\.persist\(|\bpersist\(|process\.kill|taskkill|az login|azd|npm install|--no-sandbox/.test(current), false);
});
