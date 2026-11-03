'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest preserves the exact source/card/packet and explicit native remainder', () => {
  assert.equal(manifest.cardId, 'A-S044');
  assert.equal(manifest.sourceId, 'S044');
  assert.equal(manifest.parentId, 'D-S044');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S044');
  assert.equal(manifest.packet, 'SC-S044');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.iac.status, 'N/A');
  for (const key of ['objective', 'preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length);
  assert.match(manifest.limits.join(' '), /B-S044.*CORE, DATA, HOST, OBJECT, C025/);
  assert.match(manifest.limits.join(' '), /D-S039/);
});

test('local entry has the exact banner, guarded actions, keyboard labels and no reset shadowing', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const id of ['prefix', 'response', 'delay', 'budget', 'hash-evidence']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /id="input-error" role="alert"/);
  assert.match(html, /id="phase" role="status"/);
  assert.match(html, /id="resume-download" disabled/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/i);
  assert.doesNotMatch(html, /on(?:click|load|submit|error)\s*=/i);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('app.js'), /byId\('prefix'\)\.focus\(\)/);
});

test('CSP and executable assets stay local, text-only and resource-free', () => {
  const html = read('index.html');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(html.includes(directive), directive);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1], /^[a-z]+:|^\/\//i);
    const file = match[1].split('#')[0];
    assert.ok(fs.statSync(path.resolve(root, file.replaceAll('/', path.sep))).isFile());
  }
  const scripts = read('range-resume.js') + read('app.js');
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML|outerHTML|document\.write|\beval\s*\(|new Function/);
  assert.doesNotMatch(scripts, /Date\.now|Math\.random|setInterval|setTimeout/);
  assert.match(scripts, /textContent/);
});

test('verbatim RED output matches raw byte hashes and immutable non-discoverable snapshots', () => {
  const stub = JSON.parse(read('evidence\\stub.raw.json'));
  const red = JSON.parse(read('evidence\\red.raw.json'));
  assert.equal(stub.exitCode, 0);
  assert.equal(red.exitCode, 1);
  assert.ok(stub.finishedAtUtc <= red.startedAtUtc);
  assert.match(red.stdout, /# pass 1\n# fail 13\n/);
  assert.equal((red.stdout.match(/ERR_ASSERTION/g) || []).length, 13);
  assert.doesNotMatch(red.stdout + red.stderr, /MODULE_NOT_FOUND|SyntaxError|ENOENT/);
  for (const record of [stub, red]) {
    for (const stream of ['stdout', 'stderr']) {
      const bytes = Buffer.from(record[`${stream}Base64`], 'base64');
      assert.equal(hash(bytes), record[`${stream}Sha256`]);
      assert.equal(bytes.toString('utf8'), record[stream]);
    }
  }
  for (const [source, snapshot] of [
    ['range-resume.feature', 'bdd.feature.snapshot'],
    ['range-resume.js', 'model.source.snapshot'],
    ['tests\\core.test.cjs', 'assertions.source.snapshot'],
  ]) {
    assert.equal(hash(fs.readFileSync(path.join(root, 'evidence', 'red', snapshot))), red.sourceHashes[source]);
    assert.doesNotMatch(snapshot, /\.(?:test|spec)\.[cm]?js$/);
  }
  const iac = JSON.parse(read('evidence\\iac-na.json'));
  assert.equal(iac.precedingRedFinishedAtUtc, red.finishedAtUtc);
  assert.equal(iac.behavioralAssertionFailures, 13);
  assert.equal(iac.disposition, 'N/A');
});

test('browser automation pins the published helper and has explicit proof capture and finally cleanup', () => {
  const script = read('tests\\browser.test.cjs');
  assert.ok(script.includes('86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055'));
  assert.match(script, /openIsolatedLesson\('learning\\\\S044\\\\index\.html'\)/);
  assert.match(script, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.ok(script.includes("process.env.CAPTURE_BROWSER_EVIDENCE === '1'"));
  assert.doesNotMatch(script, /--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|chromium\.launch|browserType\.launch/);
});
