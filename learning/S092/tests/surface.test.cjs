'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read, acceptance, repo } = require('.\\provenance.cjs');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('..\\fixtures.js');
const html = read('index.html').toString();

test('the portable manifest declares the exact source objective, one frozen unit and honest limits', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const [key, value] of Object.entries({
    cardId: 'A-S092', workerId: 'worker-A-S092', sourceId: 'S092', parentId: 'D-S092',
    siblingId: 'B-S092', kano: 'S', kanoUnit: 'A-S092', packet: 'SC-S092', entryGate: 'SOURCE',
    entry: 'index.html', mode: 'synthetic', banner: fixtures.BANNER,
    objective: 'Fail a canary; failed journeys remain interruptions despite successful rollback.',
  })) assert.equal(manifest[key], value, key);
  assert.equal(manifest.managementCalls, false);
  assert.equal(manifest.credentials, false);
  assert.equal(manifest.nativeAcceptanceCompleted, false);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length >= 3, key);
  assert.match(manifest.limits.join(' '), /teaching-trace data only/);
  assert.match(manifest.limits.join(' '), /No source-parent completion/);
});

test('standalone assets and restrictive CSP contain no inline code or external resource references', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, new RegExp(fixtures.BANNER));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.match(html, /href="styles\.css"/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|<script(?! src=)/);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:|\/\/)/);
  for (const asset of ['styles.css', 'fixtures.js', 'model.js', 'app.js']) assert.ok(read(asset).length > 0);
});

test('labeled keyboard controls, announcements and native-reset-safe IDs are present', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('reset'));
  assert.ok(!/\bname="reset"/.test(html));
  for (const id of ['canary-stage', 'canary-observation', 'rollback-evidence', 'predict-transition', 'predict-recovery']) {
    assert.ok(html.includes(`for="${id}"`), id);
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /class="skip-link" href="#lesson-main"/);
  assert.match(html, /id="lesson-main" tabindex="-1"/);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  const app = read('app.js').toString();
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(app, /\.innerHTML|\.outerHTML|document\.write/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(read('styles.css').toString(), /overflow-x: auto/);
});

test('runtime is deterministic synthetic data with no management, network or storage APIs', () => {
  const runtime = ['fixtures.js', 'model.js', 'app.js'].map((file) => read(file).toString()).join('\n');
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|Worker|localStorage|sessionStorage)\b/);
  assert.doesNotMatch(runtime, /\b(?:setTimeout|setInterval|Date)\b|Math\.random|child_process/);
  assert.equal(fixtures.STAGES.length * fixtures.OBSERVATIONS.length * fixtures.ROLLBACK_EVIDENCE.length, 16);
  assert.equal(fixtures.MAX_ATTEMPTS, 6);
  assert.equal(fixtures.JOURNEY_BUDGET_MS, 250);
  assert.equal(fixtures.CLIENT_IDS.length, 8);
  assert.ok(fixtures.CLIENT_IDS.every((id) => id.startsWith('synthetic-client-')));
  const feature = read('canary.feature').toString();
  assert.match(feature, /successful synthetic rollback/);
  assert.match(feature, /denominator, not the success numerator/);
  assert.match(feature, /never deployment or resource operations/);
});

test('exact current acceptance retains source failure, recovery, denominator and prerequisite clauses', () => {
  const current = acceptance(...['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md']
    .map((file) => fs.readFileSync(path.join(repo, file), 'utf8')));
  assert.equal(current.readmeS092, '| S092 | **Candidate fails during canary:** Stop further exposure and reverse routing; count interruptions already experienced. |');
  assert.equal(current.backlogDS092, '| D-S092 | P0 | Add candidate failure during a measured canary stage. | Expansion stops and recovery executes; failed journeys remain in the attempted-transition denominator and interruption counts, not the success numerator. | D-S003 |');
  assert.equal(current.cardAS092, '| A-S092 | D-S092 | S | Fail a canary; failed journeys remain interruptions despite successful rollback. | SOURCE |');
  assert.match(current.prerequisiteDS003, /actual cohorts and interruptions are retained through rollback/);
  assert.match(current.interruptions, /including failures preceding rollback/);
  assert.match(current.interruptions, /failed or uncertain started transitions must not be removed from the denominator/);
  assert.match(current.portable, /standalone, browser-openable lesson bundle/);
});
