'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest declares the exact source, frozen unit, packet and portable scope', () => {
  for (const [field, expected] of Object.entries({
    schemaVersion: 1, cardId: 'A-S049', sourceId: 'S049', parentId: 'D-S049',
    kano: 'S', kanoUnit: 'A-S049', packet: 'SC-S049', owner: 'worker-A-S049',
    entryGate: 'SOURCE', executionMode: 'synthetic', entryPoint: 'learning/S049/index.html',
  })) assert.equal(manifest[field], expected);
  assert.equal(manifest.bounds.retainedAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  for (const field of ['objective', 'preconditions', 'actions', 'input', 'assertions', 'limits']) {
    assert.ok(manifest[field].length > 0, field);
  }
  assert.match(manifest.limits.join(' '), /B-S049.*unfulfilled/);
});

test('visible source, exact training banner, objective, preconditions and limits are present', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const phrase of ['S049', 'D-S049', 'A-S049', 'SC-S049', 'Objective:', 'No account',
    'client explicitly', 'B-S049', 'IaC: N/A']) {
    const text = phrase === 'client explicitly' ? read('README.md') : html;
    assert.ok(text.includes(phrase), phrase);
  }
  assert.match(read('ambiguous-post.feature'), /Feature: S049 ambiguous POST completion/);
  assert.match(read('README.md'), /unfulfilled/);
});

test('HTML uses local assets, external scripts and restrictive non-bypass CSP', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(csp.includes(directive));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.deepEqual([...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .map((match) => [match[1].match(/src="([^"]+)"/)?.[1], match[2].trim()]),
  [['model.js', ''], ['lesson.js', '']]);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|javascript:|<iframe\b/i);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1].split('#')[0];
    assert.doesNotMatch(target, /^[a-z]+:|^[/\\]/i);
    assert.ok(fs.existsSync(path.resolve(root, target)), target);
  }
});

test('every setting has a label and buttons cannot shadow native reset', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['deduplication', 'retry-key', 'retry-payload', 'retry-response',
    'retry-after', 'deadline', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`), id);
    assert.ok(ids.includes(id), id);
  }
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="reset-lesson" type="button"/);
  assert.match(html, /id="controls" novalidate/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('runtime rendering is text-only and needs no storage, timers, network or credentials', () => {
  const runtime = `${read('model.js')}\n${read('lesson.js')}`;
  assert.doesNotMatch(runtime, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function/);
  assert.doesNotMatch(runtime, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|navigator\./);
  assert.doesNotMatch(runtime, /setTimeout|setInterval|Math\.random|Date\.now|https?:\/\//);
  assert.match(runtime, /textContent/);
  assert.match(runtime, /synth-key-A/);
  assert.match(runtime, /synth-key-B/);
  assert.doesNotMatch(read('lesson.js'), /form\.reset\s*\(/);
});

test('recorded exact strategy/card rows still match the source, without freezing shared files', () => {
  const source = JSON.parse(read(path.join('evidence', 'source-contract.json')));
  const repository = path.resolve(root, '..', '..');
  for (const [file, field] of [['README.md', 'exactSource'],
    [path.join('.docs', 'wiki', 'backlog.md'), 'exactParent'],
    [path.join('.docs', 'wiki', 'kanban.md'), 'exactCard']]) {
    assert.ok(fs.readFileSync(path.join(repository, file), 'utf8').includes(source[field]), file);
  }
  assert.equal(source.portableContractReadBeforeBehaviorDesign, true);
  assert.equal(source.liveAzureOrProtocolClaim, false);
  assert.equal(source.productionNode24Claim, false);
});
