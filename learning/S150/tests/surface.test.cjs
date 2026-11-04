'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('.\\provenance.cjs');
const { BANNER, FIXTURE_IDS, GUARDS, LIMITS } = require('..\\model.js');

test('exact frozen original source identity, objective, prerequisite and DATA ONLY boundaries are declared', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const remainder = JSON.parse(read('remaining-work.json'));
  for (const [key, value] of Object.entries({
    cardId: 'A-S150', workerId: 'worker-A-S150', sourceId: 'S150', parentId: 'D-S150',
    sourceDependency: 'D-S090', kano: 'S', kanoUnit: 'A-S150', priority: 'P0',
    packet: 'SC-S150', technicalEntryGate: 'SOURCE', banner: BANNER,
    objective: 'Retire v1 with outstanding dependencies; identify the check that must prevent deletion.',
  })) assert.equal(manifest[key], value, key);
  for (const key of ['sourceParentComplete', 'nativeProofComplete', 'deletionPerformed',
    'productionNode24Validated', 'fiveNinesEstablished']) assert.equal(manifest[key], false);
  assert.equal(manifest.extraKanoCredit, 0);
  assert.equal(manifest.limits.rehearsals, LIMITS.rehearsals);
  assert.equal(remainder.notAdmittedNativeRemainders.length, 2);
  assert.ok(remainder.notAdmittedNativeRemainders.every((item) => item.readiness === false));
  assert.deepEqual(remainder.notAdmittedNativeRemainders[0].entryGates, ['CORE', 'DATA', 'HOST']);
  assert.equal(remainder.newCardsOrExtraCreditsCreated, false);
  assert.equal(remainder.ledgerEditsOutsideStateController, false);
  assert.match(read('README.md').toString(), /same original|same original/i);
  assert.ok(read('retirement.feature').toString().includes(BANNER));
});

test('standalone semantic HTML uses local assets, labelled controls, live outcomes and non-shadowing reset', () => {
  const html = read('index.html').toString();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en">/);
  assert.ok(html.includes(BANNER));
  assert.match(html, /id="input-error"[^>]*role="alert"[^>]*tabindex="-1"[^>]*hidden/);
  assert.match(html, /id="results"[^>]*aria-live="polite"/);
  assert.match(html, /id="export-report"[^>]*readonly/);
  assert.doesNotMatch(html, /<(?:iframe|object|embed|img)\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|javascript:|<style\b|\sstyle=/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  assert.deepEqual(scripts.map((match) => /src="([^"]+)"/.exec(match[1])[1]), ['model.js', 'app.js']);
  for (const script of scripts) {
    assert.ok(script[1].includes('defer'));
    assert.equal(script[2].trim(), '');
  }
  const controls = [...html.matchAll(/<(?:select|textarea)\b[^>]*id="([^"]+)"/g)].map((match) => match[1]);
  for (const id of controls) assert.ok(html.includes(`for="${id}"`), `Label for ${id}`);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  const fixtureSelect = /<select id="fixture"[\s\S]*?<\/select>/.exec(html)[0];
  assert.deepEqual([...fixtureSelect.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), FIXTURE_IDS);
  assert.equal((html.match(/<caption>/g) || []).length, 2);
  assert.ok(GUARDS.every((guard) => typeof guard.userImpact === 'string' && guard.userImpact.length > 10));
});

test('runtime is deterministic memory-only teaching data, not networking, persistence or resource operations', () => {
  for (const file of ['app.js', 'model.js']) {
    const code = read(file).toString();
    assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|setTimeout|setInterval|eval)\s*\(/);
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.|innerHTML|node:fs|child_process|Math\.random|Date\.now/);
    assert.doesNotMatch(code, /https?:\/\/|(?:az|terraform|kubectl)\s+(?:delete|apply|deploy)/);
    assert.doesNotMatch(code, /\bdelete\s+|\b(?:unlink|rmSync|removeItem)\s*\(/);
  }
  const app = read('app.js').toString();
  assert.ok(app.includes("element(id).reset()"));
  assert.ok(app.includes("element('fixture').focus()"));
  assert.ok(app.includes("element('input-error').focus()"));
  assert.ok(app.includes("setAttribute('aria-invalid', 'true')"));
  const css = read('styles.css').toString();
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*3px/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(css, /@import|url\(/);
});

test('CSP is restrictive and historical RED/capture scripts stay outside test autodiscovery', () => {
  const html = read('index.html').toString();
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const directive of ['default-src', 'connect-src', 'frame-src', 'worker-src',
    'object-src', 'base-uri', 'form-action']) assert.ok(policy.includes(`${directive} 'none'`));
  assert.ok(policy.includes("script-src 'self'"));
  assert.ok(policy.includes("style-src 'self'"));
  assert.doesNotMatch(policy, /unsafe-|https:|data:|blob:/);
  const browser = read('tests\\browser.test.cjs').toString();
  assert.ok(browser.includes("process.env.CAPTURE_BROWSER_EVIDENCE === '1'"));
  assert.ok(browser.includes('await session.close()'));
  assert.ok(browser.includes('finally'));
  assert.ok(browser.includes("openIsolatedLesson('learning\\\\S150\\\\index.html')"));
  for (const file of ['tests\\capture.cjs', 'tests\\capture-source.cjs', 'tests\\index-content.cjs']) {
    assert.ok(read(file).toString().includes("process.env.CAPTURE_BROWSER_EVIDENCE !== '1'"));
    assert.doesNotMatch(file, /\.test\./);
  }
});
