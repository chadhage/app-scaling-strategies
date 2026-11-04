'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exact banner, safe accessible controls and honest static mode; no form.reset shadow', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.equal((html.match(/<button /g) || []).length, 4);
  assert.equal((html.match(/type="button"/g) || []).length, 4);
  assert.doesNotMatch(html, /<form\b|name="reset"|id="reset"|on(?:click|load)=|<script(?![^>]*src=)/i);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of ['profile', 'draft', 'boundary', 'budget']) {
    assert.ok(html.includes(`for="${name}"`));
    assert.ok(html.includes(`id="${name}" disabled`));
  }
  assert.ok(read('page.js').includes('static files are not an owned HTTP listener'));
  assert.ok(read('page.js').includes('performance.now()'));
  assert.doesNotMatch(read('page.js'), /localStorage|sessionStorage|document\.cookie|serviceWorker|WebSocket|debugger|\.reset\(\s*\).*form/);
});

test('only fixed owned assets and C020 providers; no arbitrary targets or native production claim', () => {
  const source = read('server.cjs');
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /await assertCurrentConsent\(\)/);
  assert.match(source, /getProfileV1, getProfileV2, FixtureError/);
  assert.doesNotMatch(source, /createConnection|net\.|https\.|fetch\(|process\.env\.[A-Z_]*(?:HOST|URL|TARGET|CONSENT)|ExecutionPolicy|--no-sandbox|proxy\s*:/);
  const consent = read('read-consent.ps1');
  assert.match(consent, /Local\\AppScalingStrategies_KanbanState_v1/);
  assert.match(consent, /ReadAllText/);
  assert.match(consent, /readHandlesClosedBeforeRelease = \$true/);
  assert.doesNotMatch(consent, /WriteAllText|Set-Content|Out-File/);
});
