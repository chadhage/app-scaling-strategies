'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(lesson, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(lesson, 'page.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(lesson, 'manifest.json')));
const banner = 'Training rehearsal - synthetic data - not a live Azure result';

test('portable manifest declares exact source, frozen unit, packet and exercise contract', () => {
  assert.equal(manifest.cardId, 'A-S079');
  assert.equal(manifest.sourceId, 'S079');
  assert.equal(manifest.parentId, 'D-S079');
  assert.equal(manifest.sourceDependency, 'D-S075');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S079');
  assert.equal(manifest.packet, 'SC-S079');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.banner, banner);
  assert.deepEqual(manifest.actions, ['burst', 'expand', 'drain', 'verify', 'check', 'next', 'reset']);
  for (const field of ['objective', 'preconditions', 'syntheticInput', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[field]);
  }
  assert.match(manifest.acceptance, /Parent-owned.*pending/);
  assert.ok(html.includes(banner));
  assert.match(html, /B-S079 and D-S079 remain incomplete/);
});

test('standalone page uses external local assets and explicit default-deny CSP', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'none'",
    "connect-src 'none'", "form-action 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'",
  ]) assert.ok(policy.includes(directive), directive);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.equal(/unsafe-inline|unsafe-eval|https?:|<iframe|<object|\son\w+=|\sstyle=/i.test(html), false);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'page.js']);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    assert.ok(fs.statSync(path.join(lesson, match[1])).isFile(), match[1]);
  }
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|innerHTML|eval)\s*(?:\(|=|\.)/.test(page), false);
});

test('keyboard, error announcement, labelled controls and unshadowed reset are declared', () => {
  assert.match(html, /class="skip" href="#exercise"/);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ids.includes('reset'), false);
  assert.equal(/\bname="(?:reset|submit)"/.test(html), false);
  for (const id of ['burst-size', 'added-workers', 'scheduling', 'deadline', 'evidence', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
  }
  assert.match(page, /settings\.reset\(\)/);
  assert.match(page, /predictionForm\.reset\(\)/);
  assert.match(fs.readFileSync(path.join(lesson, 'lesson.css'), 'utf8'), /:focus-visible/);
});

test('all owned JavaScript parses with the existing Node executable', () => {
  function scripts(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? scripts(target) : /\.(?:js|cjs)$/.test(entry.name) ? [target] : [];
    });
  }
  for (const file of scripts(lesson)) {
    const run = spawnSync(process.execPath, ['--check', file], { windowsHide: true });
    assert.equal(run.status, 0, `${file}\n${run.stderr}`);
  }
});
