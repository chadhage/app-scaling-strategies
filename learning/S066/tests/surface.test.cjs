'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(text('manifest.json'));
const html = text('index.html');

test('portable manifest identifies the exact source, frozen unit, packet and synthetic acceptance', () => {
  assert.equal(manifest.cardId, 'A-S066');
  assert.equal(manifest.sourceId, 'S066');
  assert.equal(manifest.parentId, 'D-S066');
  assert.equal(manifest.siblingId, 'B-S066');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S066');
  assert.equal(manifest.packet, 'SC-S066');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.sourceAcceptance, 'Retries do not duplicate effects; committed, failed, and unresolved outcomes are attributed honestly.');
  assert.equal(manifest.iac.status, 'N/A');
  for (const field of ['objective', 'preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length);
  assert.deepEqual(manifest.bounds.receipt, ['unavailable', 'committed', 'aborted']);
  assert.deepEqual(manifest.bounds.recovery, ['same-key', 'hold', 'new-key']);
  assert.equal(manifest.bounds.configurations, 9);
  assert.equal(manifest.bounds.completedAttempts, 6);
});

test('source-specific BDD and visible limitations do not imply real transaction or user success', () => {
  const feature = text('commit-outcomes.feature');
  for (const phrase of ['A-S066', 'D-S066', 'SC-S066', 'terminal abort', 'unresolved', 'fresh keys', 'nine combinations']) {
    assert.ok(feature.includes(phrase), phrase);
  }
  assert.ok(html.includes(manifest.requiredVisibleLabel));
  assert.match(html, /B-S066 and the original D-S066 native acceptance remain unfulfilled/);
  assert.match(html, /A timeout is neither a commit receipt nor an abort receipt/);
  assert.match(html, /ledger is an assumption, not an implementation or proof/);
  assert.match(html, /All three lost commit responses remain interrupted/);
  assert.match(html, /UNKNOWN is not success/);
  assert.match(html, /microsoft-open-source-disclaimer/);
});

test('CSP is restrictive and all executable/style resources are owned external files', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 3);
  assert.deepEqual(scripts.map((match) => match[1].match(/src="([^"]+)"/)?.[1]), ['fixtures.js', 'model.js', 'app.js']);
  for (const match of scripts) {
    assert.match(match[1], /\bdefer\b/);
    assert.equal(match[2], '');
  }
  assert.match(html, /<link rel="stylesheet" href="styles.css">/);
  assert.doesNotMatch(html, /\son[a-z]+=["']|javascript:|<style|<iframe|<object|https?:\/\//i);
  for (const file of ['fixtures.js', 'model.js', 'app.js']) {
    assert.doesNotMatch(text(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|setInterval|Math\.random|Date\.now|innerHTML|eval\s*\(/);
  }
});

test('native controls, labels, alerts, tables and reset have a non-shadowing keyboard surface', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of ['receipt', 'recovery', 'prediction']) {
    assert.match(html, new RegExp(`<label for="${name}">`));
    assert.match(html, new RegExp(`<select id="${name}" name="${name}"`));
  }
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  for (const match of html.matchAll(/<button\b([^>]*)>/g)) assert.match(match[1], /type="button"/);
  assert.match(html, /id="input-error" role="alert" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /class="skip" href="#controls"/);
  assert.match(text('styles.css'), /:focus-visible/);
  assert.match(text('styles.css'), /overflow-x: auto/);
  assert.match(text('app.js'), /controls\.reset\(\)/);
  assert.match(text('app.js'), /predictionControls\.reset\(\)/);
  assert.match(text('app.js'), /textContent/);
  assert.match(text('app.js'), /aria-errormessage/);
});

test('browser tests use only the qualified helper and normal proof is opt-in to write', () => {
  const browser = text('tests\\browser.test.cjs');
  assert.match(browser, /86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055/);
  assert.match(browser, /openIsolatedLesson\('learning\\\\S066\\\\index\.html'\)/);
  assert.match(browser, /await session\.close\(\)/);
  assert.match(browser, /finally/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.doesNotMatch(browser, /chromium\.launch|browser_navigate|--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|openIsolatedLoopback/);
});
