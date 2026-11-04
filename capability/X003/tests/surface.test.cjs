'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const code = ['recommendation.js', 'page.js'].map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";

test('static page has explicit labels, statuses, errors, skip focus, reset and exact rehearsal banner', () => {
  assert.ok(html.includes(`content="${CSP}"`));
  assert.match(html, /<label for="goal-select">Chosen learning goal<\/label>/);
  assert.match(html, /id="goal-status" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="goal-error" role="alert"/);
  assert.match(html, /href="#goal-select"/);
  assert.match(html, /id="recommendation-heading" tabindex="-1"/);
  assert.match(html, /id="reset" type="button"/);
  assert.match(html, /id="return-chooser" type="button"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('only unchanged accepted shared providers and two owned scripts load without inline code or generated assets', () => {
  assert.deepEqual([...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]), [
    '../C003/matrix-contract.js', '../C003/matrix-data.js',
    '../C005/catalog-contract.js', '../C005/catalog-data.js',
    '../C006/search.js', '../C007/catalog-filters.js', 'recommendation.js', 'page.js'
  ]);
  assert.equal((html.match(/<script\b/g) || []).length, 8);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|<style\b|<iframe\b|<img\b|\bstyle\s*=/i);
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|eval)\s*[.(]|\bdocument\.cookie\b|Math\.random|Date\.now|innerHTML|insertAdjacentHTML|node:fs|\brequire\(['"](?:https?|fs)['"]/);
  assert.doesNotMatch(code, /flow-state\.json|lifecycle\.cjs|https?:\/\/[^'"]*(?:azure\.com|openai|tracking)/i);
});

test('browse/preparation uses one actual accepted full150 harness instead of duplicating it', () => {
  assert.match(html, /id="harness-link" href="\.\.\/local-harness\/index\.html"/);
  assert.match(html, /all 150 practices and prepare/);
  assert.equal((html.match(/href="\.\.\/local-harness\/index\.html"/g) || []).length, 1);
  assert.match(html, /H002, the D-S\/workflow parents and native B siblings remain incomplete/);
  assert.match(html, /production Node\.js 24 remains unvalidated/);
});

module.exports = { CSP };
