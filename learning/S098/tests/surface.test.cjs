'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('.\\provenance.cjs');

const html = read('index.html').toString();
const app = read('app.js').toString();
const css = read('styles.css').toString();
const manifest = JSON.parse(read('manifest.json'));

test('standalone manifest binds the exact single SOURCE/LP-COMPARE unit and limits', () => {
  const source = JSON.parse(read('evidence\\source-contract.json'));
  for (const key of ['cardId', 'workerId', 'sourceId', 'parentId', 'siblingId', 'kano', 'kanoUnit', 'packet', 'entryGate']) {
    assert.equal(manifest[key], source[key], key);
  }
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.nativeAcceptanceCompleted, false);
  assert.equal(manifest.managementCalls, false);
  assert.equal(manifest.credentials, false);
  assert.match(source.acceptance.card, /Roll back after new writes; choose compatible recovery rather than discarding committed state/);
  assert.match(source.acceptance.packet, /A-S098, B-S098/);
  for (const key of ['objective', 'syntheticInput', 'preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length > 0, key);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
});

test('only relative external assets, no inline execution and a restrictive enforceable CSP', () => {
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 3);
  assert.equal((html.match(/<link rel="stylesheet" href="styles.css">/g) || []).length, 1);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|\sstyle=|javascript:/i);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "base-uri 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "form-action 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('native labels, visible focus, skip link, error announcement and non-shadowed reset', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['recovery-plan', 'read-observation', 'prediction']) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.match(html, /class="skip-link" href="#lesson-main"/);
  assert.match(html, /id="lesson-main" tabindex="-1"/);
  assert.match(html, /id="lesson-error" role="alert" tabindex="-1" hidden/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skip-link:focus/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /event\.preventDefault\(\)/);
});

test('main lesson has no network, storage, resource or clock-driven operations', () => {
  const code = [app, read('model.js').toString(), read('fixtures.js').toString()].join('\n');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(code, /https?:|process\.env|child_process|Date\.now|Math\.random|setInterval|setTimeout/);
  assert.match(code, /maxDecisions: 12/);
  assert.match(code, /ERR_CAPACITY/);
  assert.match(code, /ERR_STALE/);
  assert.match(code, /new WeakSet/);
});

test('documentation declares exact acceptance, bounded fixed data and read-only evidence workflow', () => {
  const readme = read('README.md').toString();
  assert.match(readme, /New committed state remains interpretable and correct; rollback cannot silently discard or corrupt writes/);
  assert.match(readme, /LP-COMPARE/);
  assert.match(readme, /CAPTURE_BROWSER_EVIDENCE=1/);
  assert.match(readme, /read-only/);
  assert.match(readme, /raw CRLF/);
  assert.match(readme, /canonical Git/);
  assert.match(readme, /not.*(?:native|actual)/);
  assert.match(readme, /parent.*alone.*accept/i);
});
