'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');
const banner = 'Training rehearsal - synthetic data - not a live Azure result';

test('manifest is the frozen S100 SOURCE-only portable card, not native or accepted proof', () => {
  assert.equal(manifest.sourceId, 'S100');
  assert.equal(manifest.cardId, 'A-S100');
  assert.equal(manifest.parentId, 'D-S100');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S100');
  assert.equal(manifest.packet, 'SC-S100');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.equal(manifest.objective, 'Kill active work; the educational test may pass while user impact is interrupted.');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.banner, banner);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.match(manifest.acceptance.nativeSibling, /B-S100.*D-S100.*D-S042.*D-S049/);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[key].length > 0);
  }
});

test('standalone surface has the exact banner, independent outcomes and no form.reset shadow', () => {
  assert.ok(html.includes(`>${banner}</p>`));
  assert.match(html, /<html lang="en">/);
  for (const id of ['verifier', 'user-impact', 'cleanup', 'migration', 'history', 'error']) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /<label for="condition">/);
  assert.match(html, /<label for="prediction">/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(read('app.js'), /\.innerHTML|\.outerHTML|insertAdjacentHTML/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('README.md'), /DATA ONLY/);
});

test('CSP is declared before local assets and permits neither inline code nor connections', () => {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(meta[1].includes(directive));
  assert.ok(html.indexOf(meta[0]) < html.indexOf('<script'));
  assert.doesNotMatch(meta[1], /unsafe-inline|unsafe-eval|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]),
    ['model.js', 'app.js']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style>|<iframe|<object|<script>(?!<\/script>)/i);
  assert.doesNotMatch(`${read('model.js')}\n${read('app.js')}`,
    /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|sendBeacon|eval\s*\(|child_process|spawn\s*\(|exec\s*\(/);
});

test('BDD, source clauses and byte attributes are attached, with immutable raw snapshots', () => {
  const source = JSON.parse(read(path.join('evidence', 'source-contract.json')));
  assert.equal(source.cardId, manifest.cardId);
  assert.equal(source.packet, manifest.packet);
  assert.match(source.sourceFiles[0].exactRow, /lost work is detected and counted, not misclassified/);
  assert.match(source.sourceFiles[1].exactRow, /Lost, retried, duplicated, and unresolved work/);
  assert.match(source.portableContract, /standalone, browser-openable/);
  assert.ok(source.portableContract.includes(banner));
  assert.match(source.atomicContract, /genuine behavioral TDD red/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(read('.gitattributes'), /^evidence\/\*\*\/\*\.snapshot -text -diff$/m);
  assert.match(read('.gitattributes'), /^evidence\/\*\*\/\*\.gz -text -diff$/m);
  const bdd = JSON.parse(read(path.join('evidence', 'bdd.json')));
  assert.equal(createHash('sha256').update(read('forced-work.feature')).digest('hex'), bdd.sourceSha256);
  const declarations = read('model.d.ts');
  assert.match(declarations, /readonly phase: Phase/);
  assert.match(declarations, /export type Action/);
});

test('native remainder is honestly not ready and refinement manufactures no unit or permission', () => {
  const remainder = JSON.parse(read(path.join('evidence', 'remainder.json')));
  assert.equal(remainder.relatedCardId, 'B-S100');
  assert.equal(remainder.readiness, false);
  assert.equal(remainder.originalKanoUnit, 'B-S100');
  assert.equal(remainder.additionalOriginalCredits, 0);
  assert.equal(remainder.ledgerMutation, false);
  assert.match(remainder.blocker, /authorization.*CORE.*DATA.*AKS.*C078/);
  assert.match(remainder.sourceParentObligations, /D-S042.*D-S049.*BASE/);
});
