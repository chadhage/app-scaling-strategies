'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ARTIFACT, LIMITS } = require('../upload.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const manifest = JSON.parse(read('manifest.json'));

test('the exact source, parent, portable card and packet remain the authority', () => {
  const contract = JSON.parse(read('evidence\\source-contract.json'));
  assert.equal(contract.exactRows.source,
    '| S043 | **Multipart upload:** Preserve uploaded parts and resume safely if ownership changes. |');
  assert.match(contract.exactRows.backlog, /Accepted parts survive transition; final bytes\/hash and completion budget are correct without duplicate uploads/);
  assert.match(contract.exactRows.portable, /Resume multipart upload after ownership change; verify accepted parts and final content hash/);
  assert.match(contract.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.equal(manifest.cardId, 'A-S043');
  assert.equal(manifest.parentId, 'D-S043');
  assert.equal(manifest.packet, 'SC-S043');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S043');
  assert.equal(manifest.executionMode, 'synthetic');
});

test('the loadable page exposes a worked exercise and the exact warning', () => {
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.ok(html.includes('Preconditions:'));
  assert.ok(html.includes('SHA-256'));
  assert.ok(html.includes('original completion budget'));
  assert.ok(html.includes('Retained attempted uploads'));
  assert.ok(html.includes('B-S043'));
  assert.ok(html.includes('D-S039 / D-S042'));
  for (const field of ['objective', 'preconditions', 'actions', 'assertions', 'limits']) {
    assert.ok(manifest[field].length > 0, field);
  }
  assert.equal(manifest.syntheticInput.expectedSha256, ARTIFACT.sha256);
  assert.equal(manifest.bounds.runsPerPageLifetime, LIMITS.runs);
  assert.equal(manifest.bounds.actionsPerPageLifetime, LIMITS.commands);
});

test('controls are labelled, IDs unique and the native form reset method is not shadowed', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const inputs = [...html.matchAll(/<(?:select|input)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  for (const id of inputs) assert.ok(html.includes(`for="${id}"`), id);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.ok(html.includes('id="error" role="alert" tabindex="-1"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(app.includes('form.reset()'));
  assert.ok(app.includes("element('storage').focus()"));
});

test('CSP is restrictive and all executable assets stay local', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, attributes, body] of scripts) {
    assert.match(attributes, /\bdefer\b/);
    assert.match(attributes, /\bsrc="(?:upload|app)\.js"/);
    assert.equal(body, '');
  }
  assert.doesNotMatch(html, /\bon\w+\s*=|\bstyle\s*=/i);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(read('upload.js'), /fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|Date\.now|Math\.random/);
});

test('BDD, genuine RED snapshots and IaC N/A remain explicitly separate from normal tests', () => {
  assert.match(read('multipart.feature'), /final bytes and SHA-256 equal/);
  const iac = JSON.parse(read('evidence\\iac-na.json'));
  const red = JSON.parse(read('evidence\\red.raw.json'));
  const output = Buffer.from(red.stdout.base64, 'base64').toString('utf8');
  assert.equal(iac.status, 'N/A');
  assert.equal(red.exitCode, 1);
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /actual: 'unknown'/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
  assert.ok(iac.decidedAtUtc >= red.finishedAtUtc);
  for (const file of fs.readdirSync(path.join(root, 'evidence', 'red'))) {
    assert.ok(file.endsWith('.snapshot'), file);
    assert.doesNotMatch(file, /(?:^test-|\.test\.)/);
  }
});
