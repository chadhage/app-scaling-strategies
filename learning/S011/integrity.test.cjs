'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const local = (file) => path.join(__dirname, file);
const read = (file) => fs.readFileSync(local(file), 'utf8');
const json = (file) => JSON.parse(read(file));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('manifest preserves one frozen A-S011 satisfier, its SC packet, and incomplete native lineage', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S011');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S011');
  assert.equal(manifest.packet, 'SC-S011');
  assert.equal(manifest.parent, 'D-S011');
  assert.deepEqual(manifest.originalPrerequisites, ['D-S021']);
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.deepEqual(manifest.dependencies, []);
  assert.match(manifest.infrastructure, /^N\/A/);
  for (const relative of [manifest.entryPoint, manifest.feature, manifest.evidence, ...manifest.tests]) {
    assert.ok(relative.startsWith('learning/S011/'));
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', '..', ...relative.split('/'))));
  }
});

test('source provenance preserves exact scenario, backlog, A/B contract, and original prerequisite rows', () => {
  const provenance = json('evidence/red-provenance.json');
  assert.match(provenance.sourceRows.scenario, /Manual horizontal scale-out.*verify effective capacity/);
  assert.match(provenance.sourceRows.parent, /requested\/effective instance counts, readiness, load, and connection observations/);
  assert.match(provenance.sourceRows.parent, /adding slots alone is not counted as compute scaling/);
  assert.match(provenance.sourceRows.parent, /D-S021/);
  assert.match(provenance.sourceRows.prerequisite, /One healthy response cannot approve the whole required pool/);
  assert.match(provenance.sourceRows.card, /requested, deployed, ready, and traffic-eligible capacity/);
  assert.match(provenance.sourceRows.native, /CORE, DATA, ASANY, C065/);
  assert.equal(provenance.sourceFiles.length, 3);
  assert.ok(provenance.sourceFiles.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  assert.match(provenance.sourceHead, /^[a-f0-9]{40}$/);
});

test('genuine RED snapshots and raw logs have not been edited or hidden as discovered tests', () => {
  const provenance = json('evidence/red-provenance.json');
  for (const snapshot of provenance.snapshots) {
    const absolute = path.resolve(__dirname, '..', '..', snapshot.path);
    assert.equal(hash(absolute), snapshot.sha256, snapshot.path);
    assert.ok(snapshot.path.endsWith('.txt'));
    assert.doesNotMatch(snapshot.path, /\.test\.(?:cjs|js|mjs)$/);
  }
  const red = read('evidence/red.tap.txt');
  assert.equal(provenance.exitCode, 1);
  assert.equal(provenance.assertionFailures, 35);
  assert.match(red, /# tests 36/);
  assert.match(red, /# fail 35/);
  assert.equal([...red.matchAll(/^  code: 'ERR_ASSERTION'/gm)].length, 35);
  assert.doesNotMatch(red, /ERR_TEST_FAILURE|MODULE_NOT_FOUND|Cannot find module/);
  assert.equal(read('scale-out.test.cjs'), read('evidence/red-tests.source.txt'));
  assert.equal(read('manual-scale-out.feature'), read('evidence/red-bdd.source.txt'));
  assert.match(provenance.initialRun, /TypeError/);
  assert.match(read('evidence/red-initial.tap.txt'), /name: 'TypeError'/);
});

test('saved RED behavior was an actually loadable stub, not a missing module', () => {
  const moduleObject = { exports: {} };
  vm.runInNewContext(read('evidence/red-model.source.txt'), {
    module: moduleObject, structuredClone, globalThis: {}
  }, { filename: 'red-model.source.txt' });
  assert.equal(typeof moduleObject.exports.createRehearsal, 'function');
  assert.equal(typeof moduleObject.exports.transition, 'function');
  const baseline = moduleObject.exports.createRehearsal();
  const unchanged = moduleObject.exports.transition(baseline, 'request', {
    targetInstances: 4, demandRps: 160, connectionLimit: 100, condition: 'healthy'
  });
  assert.equal(unchanged.capacity.requested, 2);
  assert.equal(unchanged.history.length, 0);
});

test('complete-journey correction retains its separate actual assertion RED and source provenance', () => {
  const provenance = json('evidence/red-completion-provenance.json');
  assert.equal(provenance.exitCode, 1);
  assert.equal(provenance.assertionFailures, 1);
  assert.equal(provenance.passed, 10);
  for (const snapshot of provenance.snapshots) {
    assert.equal(hash(path.resolve(__dirname, '..', '..', snapshot.path)), snapshot.sha256);
    assert.ok(snapshot.path.endsWith('.txt'));
  }
  const red = read('evidence/red-completion.tap.txt');
  assert.match(red, /# fail 1/);
  assert.match(red, /code: 'ERR_ASSERTION'/);
  assert.doesNotMatch(red, /MODULE_NOT_FOUND|Cannot find module|ERR_TEST_FAILURE/);
});

test('owned Git attributes preserve evidence bytes without disabling runtime whitespace checks', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol$/m);
  assert.match(attributes, /^evidence\/\*\.tap\.txt -whitespace$/m);
  assert.doesNotMatch(attributes, /^\* -whitespace$/m);
});

test('standalone runtime allows only local scripts/styles and blocks external active content', () => {
  const html = read('index.html');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(policy.includes(directive), directive);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|style\s*=/i);
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['scale-out.js', 'lesson.js']);
  for (const script of scripts) assert.ok(fs.existsSync(local(script)));
  for (const script of scripts) {
    assert.doesNotMatch(read(script), /\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML|eval\s*\(/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|url\s*\(/i);
});

test('keyboard and error surfaces use semantic controls and do not shadow form.reset', () => {
  const html = read('index.html');
  const controls = [...html.matchAll(/<(?:input|select|button)\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(controls.length >= 10);
  assert.ok(controls.every((control) => !/\b(?:id|name)="reset"/i.test(control)));
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<label for="target-total"/);
  assert.match(html, /<caption>Per-instance synthetic observations/);
  assert.match(read('lesson.css'), /:focus-visible/);
  assert.match(read('lesson.js'), /byId\('request-form'\)\.reset\(\)/);
});

test('portable lesson declares source, objective, input, assertions, limits, IaC N/A, and unfinished work', () => {
  const html = read('index.html');
  assert.equal(html.split('Training rehearsal - synthetic data - not a live Azure result').length - 1, 1);
  for (const phrase of ['Objective, preconditions', '800 ms', '30 logical seconds', '80%', 'D-S021', 'B-S011', 'Node.js 24']) {
    assert.ok(html.includes(phrase), phrase);
  }
  const notes = read('README.md');
  assert.match(notes, /Refined remaining To Do/);
  assert.match(notes, /D-S011 roll-up.*remains incomplete/);
  assert.match(notes, /IaC: \*\*N\/A\*\*/);
  assert.match(notes, /production Node 24 remains unvalidated/);
  assert.match(notes, /parent controller's/);
});
