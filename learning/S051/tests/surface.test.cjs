'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const manifest = JSON.parse(read('manifest.json'));

test('standalone lesson declares the exact source, frozen unit, packet and synthetic limits', () => {
  assert.equal(manifest.cardId, 'A-S051');
  assert.equal(manifest.sourceId, 'S051');
  assert.equal(manifest.parentId, 'D-S051');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S051');
  assert.equal(manifest.packet, 'SC-S051');
  assert.equal(manifest.owner, 'worker-A-S051');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.entryPoint, 'learning/S051/index.html');
  assert.match(html, /class="banner">Training rehearsal - synthetic data - not a live Azure result</);
  assert.match(manifest.objective, /already-open frontend v1/);
  assert.equal(manifest.bounds.fixedJourneys, 3);
  assert.equal(manifest.bounds.attempts, 8);
  assert.equal(manifest.bounds.arbitraryPayloadsOrEndpoints, false);
  assert.ok(manifest.preconditions.length && manifest.actions.length && manifest.assertions.length && manifest.limits.length);
  assert.match(manifest.limits.join(' '), /B-S051.*D-S051/);
});

test('local assets load in dependency order without inline code, remote assets or credential inputs', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((match) => /src="([^"]+)"/.exec(match[1])[1]), ['fixtures.js', 'model.js', 'app.js']);
  assert.ok(scripts.every((match) => /\bdefer\b/.test(match[1]) && match[2] === ''));
  assert.doesNotMatch(html, /\bon\w+\s*=|<style\b|style=|type="password"|<iframe|<object/i);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1], /^(?:https?:|\/\/|data:|javascript:)|\.\.[\\/]/i);
    assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
  }
  for (const source of [app, read('model.js'), read('fixtures.js')]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|setInterval|setTimeout|Math\.random|Date\.now|process\.env/);
  }
});

test('CSP denies connections, inline execution, forms, frames, objects and workers', () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'",
    "worker-src 'none'", "img-src 'none'",
  ]) assert.ok(csp.split(';').map((part) => part.trim()).includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:|data:|\*/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.match(app, /textContent/);
});

test('keyboard labels, live errors, exact reset and distinct current/history surfaces exist', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['response', 'observation', 'prediction']) {
    assert.match(html, new RegExp(`<label for="${id}"`));
  }
  assert.match(html, /id="input-error" role="alert" hidden/);
  assert.match(html, /id="phase" role="status" aria-live="polite"/);
  for (const id of ['open-old-page', 'run-candidate', 'new-attempt', 'reset-rehearsal', 'check-prediction']) {
    assert.match(html, new RegExp(`<button id="${id}" type="button"`));
  }
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /target\.focus\(\)/);
  assert.match(html, /id="result-detail" hidden/);
  assert.match(html, /id="history"/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('styles.css'), /overflow-x: auto/);
});

test('IaC is explicitly N/A after behavioral RED without implying production or native approval', () => {
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.iac.decisionStage, /After genuine loadable-stub behavioral RED and before behavior implementation/);
  assert.match(manifest.iac.reason, /neither required nor authorized/);
  assert.equal(manifest.testRuntime.version, 'Node.js 22.23.4');
  assert.equal(manifest.testRuntime.productionNode24Approval, false);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  assert.equal(manifest.testRuntime.browserHelperPublication, '53c0c0d');
  assert.equal(manifest.testRuntime.browserHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});
