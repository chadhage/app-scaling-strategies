'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest identifies the exact source, frozen unit, fixture and boundaries', () => {
  assert.equal(manifest.cardId, 'A-S033');
  assert.equal(manifest.parentId, 'D-S033');
  assert.equal(manifest.sourceId, 'S033');
  assert.equal(manifest.packet, 'SC-S033');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S033');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.entryPoint, 'index.html');
  assert.equal(manifest.executionMode, 'local-synthetic-only');
  assert.equal(manifest.syntheticFixture.maxSteps, require('../affinity.js').MAX_STEPS);
  assert.deepEqual(manifest.syntheticFixture.clients, require('../affinity.js').CLIENTS);
  assert.ok(manifest.preconditions.length && manifest.actions.length && manifest.expectedAssertions.length && manifest.limits.length);
  assert.match(manifest.acceptance, /Parent-owned/);
  assert.match(html, /B-S033 native qualification and the full D-S033 source parent remain separate and uncompleted/);
});

test('exact training banner, worked before/after exercise and honest measurement units are visible', () => {
  assert.equal(manifest.trainingLabel, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.ok(html.includes(`>${manifest.trainingLabel}</p>`));
  assert.match(html, /2\/4 state checks fail despite four HTTP 200s/);
  assert.match(html, /4\/4 matching states across both workers/);
  assert.match(html, /Guard checks, migration records and request probes have separate measurement units/);
  assert.match(html, /worker affinity, not slot-routing-cookie migration/i);
  assert.match(html, /IaC: N\/A/);
  assert.match(html, /reset or reload clears it/i);
});

test('CSP allows only local scripts and styles and forbids connections, forms, frames and inline/eval code', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "img-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:|\*/);
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]), ['affinity.js', 'app.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|\sstyle\s*=|<iframe\b|<object\b/);
  assert.equal((html.match(/href="styles.css"/g) || []).length, 1);
});

test('native controls, labels, focus, live result and alert are declared without form method shadowing', () => {
  for (const id of ['lesson-action', 'lesson-observation']) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.ok(html.includes(`<select id="${id}"`));
  }
  assert.match(html, /id="result" role="status" aria-live="polite"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /<button type="button" id="reset-lesson">/);
  assert.doesNotMatch(html, /(?:id|name)="(?:reset|submit|requestSubmit|action|method|elements)"/);
  const app = read('app.js');
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /action\.focus\(\)/);
  assert.match(app, /error\.focus\(\)/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('production lesson has no network, persistence, HTML injection or nondeterministic source', () => {
  for (const file of ['app.js', 'affinity.js']) {
    assert.doesNotMatch(read(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|\beval\s*\(|new\s+Function|Math\.random|Date\b|setTimeout|https?:/);
  }
  assert.match(read('app.js'), /textContent/);
  assert.match(read('affinity-removal.feature'), /Incomplete migration evidence cannot authorize removal/);
  assert.match(read('affinity-removal.feature'), /NOT APPLIED|without applying it/);
  assert.match(read('affinity-removal.feature'), /sixteen valid steps/);
});

test('RED snapshots cannot be auto-discovered as executable tests', () => {
  const names = fs.readdirSync(path.join(root, 'evidence', 'red'));
  assert.deepEqual(names.sort(), ['affinity-removal.feature.txt', 'affinity.stub.js.txt', 'assertion.cjs.txt'].sort());
  assert.ok(names.every((file) => file.endsWith('.txt')));
  assert.doesNotMatch(read('tests\\replay-red.cjs'), /writeFile|mkdir|unlink|rmSync/);
});

test('CSP evaluation probe executes in an external author script, not privileged browser automation', () => {
  assert.match(read('tests\\browser.cjs'), /script\.src = 'tests\\\\csp-probe\.js'/);
  assert.doesNotMatch(read('tests\\browser.cjs'), /new Function/);
  assert.match(read('tests\\csp-probe.js'), /new Function/);
  assert.match(read('tests\\csp-probe.js'), /window\.__s033PolicyResult/);
  assert.ok(!html.includes('csp-probe.js'));
});
