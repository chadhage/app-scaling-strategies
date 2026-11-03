'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable manifest identifies exact objective, acceptance, packet and synthetic limits', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S062');
  assert.equal(manifest.parentId, 'D-S062');
  assert.equal(manifest.sourceId, 'S062');
  assert.equal(manifest.packet, 'SC-S062');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S062');
  assert.equal(manifest.owner, 'worker-A-S062');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Multiply per-instance pools during scaling; detect aggregate database-connection exhaustion.');
  assert.equal(manifest.sourceAcceptance, 'Total connections stay within the approved data-tier limit; connection exhaustion and journey latency are detected.');
  assert.equal(manifest.entryPoint, 'learning/S062/index.html');
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.bounds.maximumRetainedAttempts, 6);
  assert.equal(manifest.bounds.checkpointObservationsPerAttempt, 2);
  assert.equal(manifest.testRuntime.productionNode24Certification, false);
  for (const key of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length >= 5, key);
});

test('HTML is standalone, labeled, keyboard-native and restrictive without inline execution', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip" href="#lesson"/);
  assert.match(html, /<main id="lesson" tabindex="-1">/);
  assert.match(html, /id="error" role="alert"/);
  assert.match(html, /id="outcome" role="status" aria-live="polite"/);
  assert.match(html, /<caption>Fixed denominator:/);
  assert.match(html, /name="viewport"/);
  for (const id of ['frontendInstances', 'apiInstances', 'frontendPool', 'apiPool', 'connectionLimit', 'journeyBudget', 'observation', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`), id);
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/\son[a-z]+\s*=|javascript:|<style\b|style\s*=/i.test(html));
  assert.ok(!/\b(?:name|id)="reset"/.test(html));
  assert.ok(!/<(?:iframe|object|embed)\b/i.test(html));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.ok(!/unsafe-|https?:|data:/.test(csp));
  for (const resource of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((item) => !item.startsWith('#'))) {
    assert.ok(!/[:\\/]/.test(resource), resource);
    assert.ok(fs.statSync(path.join(root, resource)).isFile());
  }
});

test('runtime contains no network, identity, persistence, framework or dynamic-code path', () => {
  const code = read('model.js') + read('app.js');
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|localStorage|sessionStorage|indexedDB|eval|Function)\s*(?:\(|\.|=)/.test(code));
  assert.ok(!/https?:|innerHTML|outerHTML|document\.write|setInterval|setTimeout|Math\.random|Date\.now/.test(code));
  assert.ok(!/\b(?:require|import)\s*\(/.test(code));
  assert.match(read('app.js'), /event\.preventDefault\(\)/);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('app.js'), /get\('frontendInstances'\)\.focus\(\)/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('styles.css'), /@media/);
});

test('BDD, instructions and source limitations describe the precise connection-pool lesson', () => {
  const feature = read('connection-pools.feature');
  assert.equal((feature.match(/^\s*Scenario:/gm) || []).length, 8);
  for (const phrase of ['140', '514', '70', '198', '279', 'unknown', 'six', 'CSP']) assert.ok(feature.includes(phrase), phrase);
  const docs = read('README.md');
  for (const phrase of ['B-S062', 'D-S062', 'D-S011', 'CORE, DATA, ASANY and C065', 'Node.js 24', 'No actual database connection', 'not general unattended CI certification']) {
    assert.ok(docs.includes(phrase), phrase);
  }
  assert.ok(!fs.existsSync(path.join(root, 'package.json')));
});
