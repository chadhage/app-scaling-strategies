'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');

test('manifest maps the exact source/card acceptance and a single bounded synthetic unit', () => {
  assert.equal(manifest.cardId, 'A-S078');
  assert.equal(manifest.parentId, 'D-S078');
  assert.equal(manifest.nativeSibling, 'B-S078');
  assert.equal(manifest.sourceId, 'S078');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, manifest.cardId);
  assert.equal(manifest.packet, 'SC-S078');
  assert.equal(manifest.owner, 'worker-A-S078');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Start two schedulers; use lease/fencing evidence to identify the valid executor.');
  assert.equal(manifest.sourceAcceptance, 'Use suitable ownership leases and fencing to prevent duplicate scheduled work.');
  assert.equal(manifest.parentAcceptance, 'Only the valid owner performs each scheduled effect; duplicate scheduling is detected.');
  assert.deepEqual(manifest.bounds, {
    configurations: 4, schedulers: 2, occurrences: 1, maximumExecutionAttempts: 2,
    maximumKnownEffects: 2, maximumUnresolvedEffects: 1, retainedAttempts: 6,
    arbitraryEndpointsPayloadsTimersOrLoad: false,
  });
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length >= 4);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  assert.equal(manifest.iac.status, 'N/A');
});

test('standalone DOM declares labels, bounded operator controls and no native reset shadow', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, new RegExp(`<p id="synthetic-banner"[^>]*>${manifest.requiredVisibleLabel}</p>`));
  assert.match(html, /role="alert" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /B-S078 and D-S078 remain incomplete/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/<label for="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
  for (const id of ['start-schedulers', 'handoff-lease', 'execute-occurrence', 'new-attempt', 'reset-rehearsal',
    'protection', 'receipt', 'executor-choice', 'outcome-choice', 'check-answer',
    'lease-ledger', 'scheduler-ledger', 'effect-ledger', 'history', 'history-ledgers']) {
    assert.ok(ids.includes(id), id);
  }
  assert.match(read('app.js'), /configForm\.reset\(\)/);
  assert.match(read('app.js'), /answerForm\.reset\(\)/);
  assert.equal((read('scheduler-fencing.feature').match(/  Scenario:/g) || []).length, 8);
});

test('only local external assets and a restrictive no-inline/no-connection CSP are used', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.split(';').map((part) => part.trim()).includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|style\s*=/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    assert.match(match[1], /^[a-zA-Z0-9.-]+$/);
    assert.ok(fs.statSync(path.join(root, match[1])).isFile());
  }
  const production = read('app.js') + read('model.js');
  assert.doesNotMatch(production, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|setInterval|setTimeout|eval)\s*\(|localStorage|sessionStorage|sendBeacon|serviceWorker|innerHTML/);
  assert.match(production, /textContent/);
});
