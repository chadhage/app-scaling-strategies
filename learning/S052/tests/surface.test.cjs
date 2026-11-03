'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest identifies the exact frozen source unit and executable entry', () => {
  assert.equal(manifest.cardId, 'A-S052');
  assert.equal(manifest.sourceId, 'S052');
  assert.equal(manifest.parentId, 'D-S052');
  assert.equal(manifest.packet, 'SC-S052');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S052');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.sourceAcceptance, 'New clients tolerate supported old contracts; required unsupported features do not silently return success.');
  assert.ok(fs.existsSync(path.resolve(root, '..', '..', manifest.entryPoint)));
  for (const key of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length >= 3);
  assert.deepEqual(manifest.bounds, {
    requestsPerAttempt: 4, maximumRetainedAttempts: 8, effectiveRoutePresets: 3,
    requirementPresets: 3, frontendPolicies: 2, oldResponseConditions: 4, retries: 0,
  });
});

test('visible source, limits, disclaimer and banner preserve the exact lesson claim', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.match(html, /new clients tolerate supported old contracts; required unsupported features do not silently return success/i);
  assert.match(html, /not.*completed migration/i);
  assert.match(html, /Microsoft disclaimer/);
  assert.match(html, /B-S052 and D-S052 are not completed/);
  assert.match(html, /in-memory history/);
  assert.match(read('README.md'), /read-only to retained proof/);
});

test('all controls have labels, native semantics, announced state and unshadowed reset', () => {
  const html = read('index.html');
  for (const id of ['routing', 'requirement', 'policy', 'oldCondition', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /<form id="controls" novalidate/);
  assert.match(html, /id="error" role="alert"/);
  assert.match(html, /id="progress" role="status"/);
  assert.match(html, /<caption>/);
  assert.ok(!/\b(?:id|name)="reset"/.test(html));
  assert.match(read('app.js'), /byId\('controls'\)\.reset\(\)/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('restrictive local CSP and text-only rendering do not introduce execution or network sinks', () => {
  const html = read('index.html');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(html.includes(directive));
  assert.ok(!/unsafe-inline|unsafe-eval|https?:|on(?:click|load|error)\s*=/.test(html));
  assert.equal((html.match(/<script src=/g) || []).length, 2);
  const code = read('model.js') + read('app.js');
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function)\s*\(|innerHTML|document\.write|localStorage/.test(code));
  assert.match(read('app.js'), /textContent/);
});

test('browser verifier pins only the published helper and gates every proof write', () => {
  const code = read('tests\\browser.test.cjs');
  const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
  const digest = createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
  assert.equal(digest, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.match(code, /openIsolatedLesson/);
  assert.match(code, /finally\s*\{/);
  assert.match(code, /await session\.close\(\)/);
  assert.match(code, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.ok(!/chromium\.launch|connectOverCDP|--no-sandbox|bypassCSP:\s*true|prototype.*require/.test(code));
});

test('all 72 bounded input combinations obey an independent required-contract oracle', () => {
  const { DEFAULTS, createState, transition } = require('..\\model.js');
  let cases = 0;
  for (const routing of ['mixed', 'old-only', 'new-only']) {
    for (const requirement of ['base', 'optional-timezone', 'required-timezone']) {
      for (const policy of ['contract-aware', 'status-only']) {
        for (const oldCondition of ['supported', 'malformed', 'timeout', 'unobserved']) {
          let state = transition(createState(), 'start', { ...DEFAULTS, routing, requirement, policy, oldCondition });
          for (let index = 0; index < 4; index += 1) state = transition(state, 'step');
          const expected = routing === 'new-only' ? 'success'
            : oldCondition === 'unobserved' ? 'unknown'
              : oldCondition !== 'supported' || requirement === 'required-timezone' ? 'failure' : 'success';
          assert.equal(state.current.outcome, expected, JSON.stringify(state.config));
          assert.equal(state.current.metrics.attempted, 4);
          assert.equal(state.current.metrics.success + state.current.metrics.failure + state.current.metrics.unknown, 4);
          assert.equal(state.history.length, 1);
          for (const row of state.current.rows) {
            if (row.backend === 'old' && requirement === 'required-timezone' && oldCondition !== 'unobserved') {
              assert.equal(row.outcome, 'failure');
            }
          }
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 72);
});

test('configuration getters, symbols and missing fields are not coerced or executed', () => {
  const { DEFAULTS, createState, transition } = require('..\\model.js');
  let getterRuns = 0;
  const getter = { ...DEFAULTS };
  Object.defineProperty(getter, 'routing', { get() { getterRuns += 1; return 'mixed'; } });
  assert.throws(() => transition(createState(), 'start', getter), /configuration/i);
  assert.equal(getterRuns, 0);
  assert.throws(() => transition(createState(), 'start', { ...DEFAULTS, [Symbol('extra')]: 'mixed' }), /configuration/i);
  const missing = { ...DEFAULTS };
  delete missing.requirement;
  assert.throws(() => transition(createState(), 'start', missing), /configuration/i);
});
