'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const modelSource = fs.readFileSync(path.join(root, 'ledger.js'), 'utf8');
const contractSource = fs.readFileSync(path.join(root, '..', 'C020', 'contract.js'), 'utf8');

test('portable file entry loads unchanged C020 before model and page; all assets are local', () => {
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['../C020/contract.js', 'ledger.js', 'page.js']);
  for (const file of scripts) assert.equal(fs.statSync(path.resolve(root, file)).isFile(), true);
  assert.doesNotMatch(html, /<script(?! src=)|\son[a-z]+=["']|\sstyle=["']/i);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//i);
});

test('CSP rejects inline code and outbound connections without unsafe allowances', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(csp.split(';').map((part) => part.trim()).includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-|https:|data:|\*/);
  assert.doesNotMatch(page, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});

test('unique IDs, programmatic labels and live error/status regions are present', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const labels = new Set([...html.matchAll(/<label for="([^"]+)">/g)].map((match) => match[1]));
  for (const match of html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)) assert.ok(labels.has(match[1]), match[1]);
  for (const match of html.matchAll(/<(?:input|select|textarea|button|form)\b[^>]*\bid="([^"]+)"/g)) {
    assert.notEqual(match[1], 'reset');
  }
  assert.match(html, /id="status" role="status" aria-live="polite"/);
  assert.match(html, /id="error"[^>]*role="alert"/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline: 3px/);
  assert.match(html, /<th scope="col">/);
  assert.match(html, /<noscript>/);
  for (const match of page.matchAll(/element\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), match[1]);
});

test('local scope and exact atomicity/unknown limitations are learner-visible, not hidden metadata', () => {
  for (const text of ['synthetic data', 'not a live Azure result', 'deduplication ledger entry',
    'separate later event', 'unknown, not success', 'not external receipts', 'no durable Storage, Queue, DB',
    'exactly-once cloud guarantee', 'reload is not durable recovery', 'Node.js 24 is unvalidated',
    'Inspection', 'never replaces the active job', 'Coherently rewritten or truncated entire histories are not authenticated']) {
    assert.ok(html.includes(text), text);
  }
});

test('browser global uses the actual C020 contract and the same model behavior as CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(contractSource, context);
  vm.runInContext(modelSource, context);
  const output = vm.runInContext(`(() => {
    const config = { jobId: 'job-browser', workVersion: 'profile-effects/1', profileId: 'synthetic-002', implementation: 'v2' };
    const one = C023Ledger.create(config);
    const cut = C023Ledger.apply(one, { type: 'run', interruption: 'after-commit', effectIndex: 0 });
    const done = C023Ledger.apply(cut, { type: 'resume', interruption: 'none', effectIndex: null });
    return JSON.stringify({ one, cut, done });
  })()`, context);
  const actual = JSON.parse(output);
  assert.equal(actual.one.plan.source.profile.id, 'synthetic-002');
  assert.equal(actual.one.plan.source.stamp.implementation, 'v2');
  assert.equal(actual.cut.view.counters.committedEffects, 1);
  assert.equal(actual.done.view.counters.effectApplications, 3);
  assert.equal(actual.done.view.counters.duplicateSuppressions, 1);
  assert.equal(actual.done.view.attempts[0].outcome, 'interrupted');
});

test('missing C020 fails explicitly rather than using a duplicated default catalog', () => {
  const context = vm.createContext({});
  vm.runInContext(modelSource, context);
  const code = vm.runInContext(`(() => {
    try { C023Ledger.create({ jobId: 'job-001', workVersion: 'profile-effects/1', profileId: 'synthetic-001', implementation: 'v1' }); }
    catch (error) { return error.code; }
  })()`, context);
  assert.equal(code, 'C020_UNAVAILABLE');
});

test('browser state inspection is read-only and reset archives before clearing active state', () => {
  const inspectHandler = page.slice(page.indexOf("element('inspect-snapshot').addEventListener"));
  const resetHandler = page.slice(page.indexOf("element('archive-reset').addEventListener"), page.indexOf("element('copy-snapshot').addEventListener"));
  assert.match(inspectHandler, /model\.restore\(element\('snapshot-input'\)\.value\)/);
  assert.doesNotMatch(inspectHandler, /active = candidate/);
  assert.ok(resetHandler.indexOf('archives.push') < resetHandler.indexOf('active = null'));
  assert.match(resetHandler, /HTMLFormElement\.prototype\.reset\.call/);
  assert.doesNotMatch(resetHandler, /archives\.length\s*=|rejections\.length\s*=/);
  assert.match(page, /WORK_ID_REUSED/);
});
