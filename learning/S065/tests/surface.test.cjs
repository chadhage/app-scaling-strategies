'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest preserves exact S065 source, single frozen unit, packet and native remainder', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.match(readme, /\| S065 \| \*\*Hot-shard rebalancing:\*\* Move tenants or partitions without missing writes or assigning two active owners\. \|/);
  assert.match(backlog, /\| D-S065 \| P1 \| Add hot-tenant partition\/shard rebalance under live read\/write load\. \| Ownership changes preserve committed effects and routing; no two writers own the same moved partition\. \| D-S064 \|/);
  assert.match(kanban, /\| A-S065 \| D-S065 \| S \| Move a hot partition; detect routing gaps and simultaneous active owners\. \| SOURCE \|/);
  for (const [key, value] of Object.entries({
    cardId: 'A-S065', sourceId: 'S065', parentId: 'D-S065', kano: 'S', kanoUnit: 'A-S065',
    packet: 'SC-S065', owner: 'worker-A-S065', entryGate: 'SOURCE', executionMode: 'synthetic',
    objective: 'Move a hot partition; detect routing gaps and simultaneous active owners.',
  })) assert.equal(manifest[key], value);
  assert.equal(manifest.bounds.configurations, 36);
  assert.equal(manifest.bounds.completedAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.limits.join(' '), /B-S065.*D-S065.*unfulfilled/);
  assert.equal(manifest.testRuntime.browserHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.ok(fs.existsSync(path.join(repo, ...manifest.entryPoint.split('/'))));
  assert.ok(fs.existsSync(path.join(repo, ...manifest.feature.split('/'))));
  assert.match(read('README.md'), /source-parent certification/);
});

test('local HTML uses unique accessible controls, explicit limits and restrictive CSP', () => {
  const html = read('index.html');
  const app = read('app.js');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /href="#main"/);
  for (const id of ['routing', 'ownership', 'data', 'coverage', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
  assert.match(app, /form\.reset\(\)/);
  assert.match(html, /type="button">Reset all attempts/);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'",
    "form-action 'none'", "object-src 'none'"]) assert.ok(csp.includes(directive));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|style=|\son[a-z]+=/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(html, /Microsoft Open Source Disclaimer/);
});

test('browser model branch loads without frameworks, network, storage or execution shortcuts', () => {
  const model = read('model.js');
  const context = {};
  vm.createContext(context);
  vm.runInContext(model, context, { timeout: 1000 });
  assert.equal(vm.runInContext(
    "HotPartitionLesson.simulate({routing:'coordinated',ownership:'exclusive',data:'current',coverage:'complete'}).verdict",
    context, { timeout: 1000 }), 'success');
  for (const file of ['app.js', 'model.js']) {
    assert.doesNotMatch(read(file), /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML|eval\s*\(|new Function|setInterval|setTimeout/);
  }
  assert.equal(JSON.parse(read('evidence/iac-decision.json')).stage,
    'After genuine behavioral RED; before behavior implementation');
  assert.match(read('evidence/red/node-red.tap'), /ERR_ASSERTION/);
  assert.match(read('evidence/red/node-red.tap'), /actual: 'unknown'/);
  assert.match(read('evidence/red/node-red.tap'), /expected: 'success'/);
  assert.equal(JSON.parse(read('evidence/red/run.json')).testExitCode, 1);
  assert.doesNotMatch(read('evidence/red/node-red.tap'), /MODULE_NOT_FOUND|SyntaxError/);
});
