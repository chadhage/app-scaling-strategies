'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(folder, file), 'utf8');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

test('manifest preserves the exact source objective, acceptance, packet and synthetic boundary', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const source = JSON.parse(read(path.join('evidence', 'source-contract.json')));
  assert.equal(manifest.cardId, 'A-S058');
  assert.equal(manifest.kanoUnit, manifest.cardId);
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S058');
  assert.equal(manifest.parentId, 'D-S058');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, source.objective);
  assert.equal(manifest.exactSourceBehavior, source.exactSourceAcceptance);
  assert.equal(manifest.exactParentAcceptance, source.exactBacklogAcceptance);
  assert.equal(manifest.bounds.histories, 3);
  assert.equal(manifest.bounds.configurationCombinations, 18);
  assert.equal(manifest.bounds.maxAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.limits.join(' '), /actual durable engine replay/);
  assert.match(manifest.limits.join(' '), /production Node\.js 24/);
});

test('standalone surface has exact banner, labelled controls, safe reset and restrictive CSP', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const id of ['strategy', 'workers', 'historyEvidence']) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.match(html, new RegExp(`<select id="${id}" name="${id}">`));
  }
  assert.equal((html.match(/<select /g) || []).length, 3);
  assert.equal((html.match(/<button /g) || []).length, 2);
  assert.doesNotMatch(html, /(?:id|name)="reset"|on(?:click|load|submit)=|<style|<script(?! src=)/i);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /script-src 'self'/);
  for (const directive of ['default-src', 'connect-src', 'object-src', 'base-uri', 'form-action']) {
    assert.ok(html.includes(`${directive} 'none'`));
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\//);
  assert.match(read('lesson.js'), /form\.reset\(\)/);
  assert.match(read('lesson.js'), /error\.focus\(\)/);
  assert.doesNotMatch(read('lesson.js'), /innerHTML|outerHTML|fetch\(|localStorage|sessionStorage|WebSocket|XMLHttpRequest/);
});

test('raw source snapshots preserve CRLF while canonical excerpts still match supplied source', () => {
  const source = JSON.parse(read(path.join('evidence', 'source-contract.json')));
  const repo = path.resolve(folder, '..', '..');
  for (const item of source.sources) {
    const raw = fs.readFileSync(path.join(folder, 'evidence', item.snapshot));
    assert.equal(raw.length, item.snapshotBytes);
    assert.equal(hash(raw), item.rawSnapshotSha256);
    assert.equal(hash(canonical(raw)), item.canonicalSnapshotSha256);
    assert.ok(item.crlfPairs > 0);
    assert.equal((raw.toString('utf8').match(/\r\n/g) || []).length, item.crlfPairs);
    const current = fs.readFileSync(path.join(repo, item.path), 'utf8').replace(/\r\n/g, '\n');
    for (const row of canonical(raw).toString('utf8').split('\n').filter((line) => /^\| (?:S058|D-S058|A-S058|B-S058|P004) \|/.test(line))) {
      assert.ok(current.includes(row), row);
    }
  }
  const portable = read(path.join('evidence', 'source-portable-contract.snapshot'));
  assert.match(portable, /## Atomic card contract/);
  assert.match(portable, /### Portable A-card lesson contract/);
  assert.match(portable, /every other A\/B card belongs to SC-Snnn/);
});
