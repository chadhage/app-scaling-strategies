'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const page = read('page.js');

test('the production file set is exactly the enumerated one the coverage gate measures', () => {
  const found = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort();
  assert.deepEqual(found, ['context.cjs', 'cursor.js', 'page.js', 'reducer.js', 'run.cjs', 'server.cjs', 'store.cjs']);
});

test('the page has no inline script, inline style, handler attribute, form or foreign URL, and loads scripts in dependency order', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((match) => /src="([^"]+)"/.exec(match[1])[1]), ['cursor.js', 'reducer.js', 'page.js']);
  for (const match of scripts) {
    assert.match(match[1], /\bdefer\b/);
    assert.equal(match[2].trim(), '', 'no inline script body');
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'no inline event handlers');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'no inline style attributes');
  assert.doesNotMatch(html, /<style\b|<form\b|<iframe\b|<object\b|<embed\b/i);
  for (const source of [html, page, read('style.css'), read('cursor.js'), read('reducer.js')]) {
    assert.doesNotMatch(source, /https?:\/\//i, 'no foreign or absolute URL');
  }
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.equal([...html.matchAll(/<button\b[^>]*>/g)].every((match) => /type="button"/.test(match[0])), true);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('every id the page reads exists in the markup and the controls are native keyboard-operable buttons', () => {
  const listed = /const ids = \[([^\]]+)\]/.exec(page)[1].match(/'([^']+)'/g).map((item) => item.slice(1, -1));
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const id of listed) assert.ok(ids.has(id), `index.html has no #${id}`);
  for (const id of ['disconnect', 'reconnect']) assert.match(html, new RegExp(`<button id="${id}" type="button"`));
  assert.match(html, /<label for="rewind">/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /role="alert"/);
});

test('the page code stays inside its closed capability: GET fetches, EventSource, no storage, eval or markup injection', () => {
  for (const forbidden of [/\beval\s*\(/, /new Function/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /localStorage/, /sessionStorage/,
    /indexedDB/, /XMLHttpRequest/, /WebSocket/, /postMessage/, /navigator\.sendBeacon/, /method\s*:/, /document\.cookie/]) {
    assert.doesNotMatch(page, forbidden);
  }
  const fetches = [...page.matchAll(/fetch\(([^)]*)\)/g)].map((match) => match[1]);
  assert.equal(fetches.length, 2);
  for (const call of fetches) assert.doesNotMatch(call, /,\s*\{/, 'fetch is always a plain GET without options');
  assert.deepEqual([...page.matchAll(/new EventSource\(([^)]*)\)/g)].length, 1);
});

test('the specification, ignore rules and attributes exist and say what the README promises', () => {
  const feature = read('C044.feature');
  assert.equal([...feature.matchAll(/^\s*Scenario(?: Outline)?:/gm)].length, 8);
  assert.match(feature, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(feature, /Last-Event-ID/);
  assert.match(read('.gitignore'), /^\/state\/$/m);
  assert.match(read('.gitignore'), /^\/tests\/scratch\/$/m);
  assert.match(read('.gitattributes'), /^evidence\/red\/\*\* -text$/m);
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text$/m);
});

test('the console is honest about the closed scope: synthetic, loopback, no production validation claimed', () => {
  assert.match(html, /Loopback HTTP only/);
  assert.match(html, /not a live Azure result/);
  assert.match(html, /not validated by this Node-builtin fixture/);
  assert.match(html, /never stopped,\s+paused or restarted by a client/);
});
