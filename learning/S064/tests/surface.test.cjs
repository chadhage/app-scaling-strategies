'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const folder = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(folder, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');

test('manifest preserves exact S064 source, parent acceptance, frozen unit and portable contract', () => {
  assert.deepEqual(
    [manifest.cardId, manifest.sourceId, manifest.parentId, manifest.kano, manifest.kanoUnit, manifest.packet, manifest.owner],
    ['A-S064', 'S064', 'D-S064', 'S', 'A-S064', 'SC-S064', 'worker-A-S064'],
  );
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Assign a new shard before/after synchronization; reject ambiguous writer ownership.');
  assert.equal(manifest.exactSourceBehavior, 'Copy and synchronize data before changing routing, with unambiguous write ownership.');
  assert.equal(manifest.exactParentAcceptance, 'Committed data is copied/synchronized before handoff; fencing prevents missing or duplicate writes.');
  assert.equal(manifest.requiredVisibleLabel, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.ok(html.includes(manifest.requiredVisibleLabel));
  assert.ok(html.includes(manifest.exactSourceBehavior));
  assert.ok(html.includes(manifest.exactParentAcceptance));
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length >= 3);
  assert.equal(manifest.bounds.configurationCombinations, 324);
  assert.equal(manifest.bounds.maxAttempts, 8);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.limits.join(' '), /No actual database copying/);
});

test('BDD covers sync ordering, missing commits, exclusive ownership, honest unknowns and guarded UX', () => {
  const bdd = read('shard-handoff.feature');
  for (const phrase of [
    'Complete synchronization and exclusive ownership', 'Assignment before synchronization',
    'snapshot is not the committed handoff boundary', 'Ambiguous ownership',
    'Missing observation is not success', 'Known failure dominates',
    'Invalid input and forged state', 'Keyboard, retained history', 'restrictive CSP',
  ]) assert.ok(bdd.includes(phrase), phrase);
  assert.match(bdd, /not certify actual database synchronization or writer fencing/);
});

test('standalone page uses restrictive local CSP, external assets and no inline execution or credential controls', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, attributes, body] of scripts) {
    assert.match(attributes, /src="(?:model|lesson)\.js"/);
    assert.match(attributes, /\bdefer\b/);
    assert.equal(body.trim(), '');
  }
  assert.doesNotMatch(html, /\s(?:on[a-z]+|style)\s*=|<style|https?:\/\/|type="password"|type="email"|<iframe/i);
  assert.doesNotMatch(read('lesson.js'), /innerHTML|outerHTML|fetch\s*\(|eval\s*\(|localStorage|sessionStorage|document\.cookie|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(read('model.js'), /Math\.random|Date\b|fetch\s*\(|require\s*\(/);
  assert.match(read('lesson.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
});

test('unique labels, keyboard controls, focused errors, reset and retained table are present', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const control of ['initial-committed', 'writes-during-copy', 'assignment', 'synchronization', 'ownership']) {
    assert.ok(html.includes(`for="${control}"`));
    assert.ok(ids.includes(control));
  }
  assert.match(html, /id="run-button"/);
  assert.match(html, /type="button" id="reset-button"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="verdict" role="status" aria-live="polite"/);
  assert.match(html, /<caption>Independent in-memory attempts/);
  assert.match(read('lesson.css'), /:focus-visible/);
});

test('owned module requires no packages, framework, cloud or shared integration edits', () => {
  assert.equal(fs.existsSync(path.join(folder, 'package.json')), false);
  for (const asset of ['lesson.css', 'model.js', 'lesson.js', 'manifest.json', 'shard-handoff.feature']) {
    assert.equal(fs.statSync(path.join(folder, asset)).isFile(), true);
  }
  assert.equal(manifest.browserTooling.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(manifest.browserTooling.helperPublication, '53c0c0d');
  assert.match(manifest.browserTooling.lifecycle, /awaited finally close/);
  assert.match(read('README.md'), /B-S064, D-S064 and prerequisite D-S054 remain incomplete/);
  assert.match(read('README.md'), /normal test setting/);
});
