'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(folder, file), 'utf8');
const model = require('../model.js');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('manifest preserves the exact source/card acceptance, single S unit, packet and native boundary', () => {
  const source = JSON.parse(read(path.join('evidence', 'source-contract.json')));
  for (const key of ['cardId', 'sourceId', 'parentId', 'kano', 'kanoUnit', 'packet']) {
    assert.equal(manifest[key], source[key]);
  }
  assert.equal(manifest.requiredVisibleLabel, model.BANNER);
  assert.equal(manifest.exactSourceAcceptance, source.exactSourceAcceptance);
  assert.equal(manifest.exactParentAcceptance, source.exactBacklogAcceptance);
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.entryPoint, 'learning/S063/index.html');
  assert.equal(manifest.bounds.maxRuns, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.limits.join(' '), /B-S063, D-S063/);
  assert.match(read('README.md'), /B-S063 and[\s\r\n]+D-S063 remain incomplete/);
  assert.equal((read('data-tier-paths.feature').match(/  Scenario:/g) || []).length, 8);
});

test('exact raw source snapshots retain CRLF bytes and correspond to the accepted source clauses', () => {
  const source = JSON.parse(read(path.join('evidence', 'source-contract.json')));
  assert.equal(source.sources.length, 7);
  for (const item of source.sources) {
    const raw = fs.readFileSync(path.join(folder, 'evidence', item.snapshot));
    assert.equal(raw.length, item.bytes);
    assert.equal(hash(raw), item.rawSha256);
    assert.equal(hash(Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))), item.canonicalSha256);
    assert.equal((raw.toString('utf8').match(/\r\n/g) || []).length, item.crlfPairs);
    assert.equal(item.canonicalMatchesRecordedHead, true);
  }
  const sourceRows = source.sources.map((item) => read(path.join('evidence', item.snapshot))).join('\n');
  assert.ok(sourceRows.includes(source.exactSourceAcceptance));
  assert.ok(sourceRows.includes(source.exactBacklogAcceptance));
  assert.match(sourceRows, /every other A\/B card belongs to SC-Snnn/);
});

test('loadable non-discovered RED snapshots prove an assertion mismatch, followed by explicit IaC N/A', () => {
  const raw = path.join('evidence', 'raw', 'red-001');
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(path.join(raw, 'model.source.snapshot')), context);
  const stub = context.module.exports;
  assert.equal(typeof stub.evaluate, 'function');
  assert.equal(stub.evaluate(stub.DEFAULTS).selected.verdict, 'UNKNOWN');
  assert.match(read(path.join(raw, 'model-test.source.snapshot')), /assert\.equal\(result\.selected\.verdict, 'PASSED'\)/);
  const output = read(path.join(raw, 'stdout.txt'));
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /actual: 'UNKNOWN'/);
  assert.match(output, /expected: 'PASSED'/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|ENOENT|Cannot find module/);
  const receipt = JSON.parse(read(path.join(raw, 'run.json')));
  const iac = JSON.parse(read(path.join('evidence', 'iac-stage.json')));
  assert.equal(receipt.exitCode, 1);
  assert.equal(receipt.expectedExitCode, 1);
  assert.equal(receipt.processError, null);
  assert.equal(iac.status, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) > Date.parse(receipt.finishedAtUtc));
});

test('standalone surface has the exact prominent banner, seven labeled controls and no reset shadow', () => {
  assert.ok(html.includes(`<p class="banner">${model.BANNER}</p>`));
  for (const field of Object.keys(model.DEFAULTS)) {
    assert.ok(html.includes(`for="${field}"`), field);
    assert.ok(html.includes(`id="${field}"`), field);
  }
  assert.match(html, /id="error" role="alert"/);
  assert.match(html, /id="run-summary" role="status" aria-live="polite"/);
  assert.match(html, /href="#controls"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('lesson.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(read('lesson.js'), /\.innerHTML|localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket/);
});

test('CSP is restrictive and all runtime assets are local, external and declared', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'",
    "base-uri 'none'", "form-action 'none'"]) assert.ok(policy.includes(directive));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|data:/);
  assert.doesNotMatch(html, /\bon\w+\s*=|\bstyle\s*=|<iframe|<object|<script(?![^>]*\bsrc=)/i);
  assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((item) => item[1]), ['model.js', 'lesson.js']);
  assert.equal(html.match(/<link[^>]*href="([^"]+)"/)[1], 'lesson.css');
  assert.match(read('lesson.css'), /:focus-visible/);
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text -diff$/m);
});
