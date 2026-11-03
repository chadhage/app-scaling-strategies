'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('exact immutable source acceptance, frozen A/card/packet and portable safety contract are bound', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const contract = JSON.parse(read('evidence/source-contract.json'));
  const source = spawnSync('git', ['--no-pager', 'show', `${contract.baseline}:README.md`], { cwd: repo });
  assert.equal(source.status, 0);
  assert.equal(hash(source.stdout), contract.sourceCanonicalSha256);
  assert.ok(source.stdout.toString().split(/\r?\n/).includes(contract.selected.source));
  assert.equal(contract.selected.source, '| S102 | **DNS-cache persistence:** Keep cached destinations usable for the required overlap period; do not assume immediate DNS convergence. |');
  assert.equal(contract.selected.parent, '| D-S102 | P1 | Add owned test-DNS updates with fresh/cached resolver-driver observations. | Old cached destinations remain usable for the declared overlap; resolver emulation is labeled and not claimed as universal DNS convergence. | P006 |');
  for (const key of ['cardId', 'workerId', 'kano', 'kanoUnit', 'packet']) assert.equal(manifest[key], contract[key]);
  assert.equal(manifest.objective, 'Compare fresh/cached DNS answers; identify why immediate convergence cannot be assumed.');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.managementCalls, false);
  assert.equal(manifest.credentials, false);
  assert.equal(manifest.nativeAcceptanceCompleted, false);
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.match(read('evidence/source/atomic-portable.snapshot'), /standalone, browser-openable lesson/);
  assert.match(contract.packetRule, /every other A\/B card belongs to SC-Snnn/);
  for (const [file, expected] of [['.docs/wiki/backlog.md', contract.backlogCanonicalSha256], ['.docs/wiki/kanban.md', contract.kanbanCanonicalSha256]]) {
    const result = spawnSync('git', ['--no-pager', 'show', `${contract.contractRevision}:${file}`], { cwd: repo });
    assert.equal(result.status, 0);
    assert.equal(hash(result.stdout), expected);
  }
});

test('standalone surface uses strict CSP, external local assets, standard controls, focus/error/reset and explicit limitations', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const policy of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "base-uri 'none'", "object-src 'none'", "img-src 'none'"]) assert.ok(html.includes(policy));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)|\son\w+=|style=/i);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:|\/\/)/i);
  assert.match(html, /href="#lesson"/);
  assert.match(html, /id="error-message" role="alert" tabindex="-1"/);
  assert.doesNotMatch(html, /(?:id|name)=["']reset["']/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /errorBox\.focus\(\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie|eval\(|new Function/);
  assert.match(read('styles.css'), /:focus-visible/);
  for (const asset of ['model.js', 'app.js', 'styles.css']) assert.ok(fs.existsSync(path.join(root, asset)));
  assert.match(read('README.md'), /native B-S102 acceptance or a completed D-S102 source demo/);
  assert.match(html, /Universal convergence: NOT ESTABLISHED/);
});
