'use strict';

// Static surface of the page and the model: strict CSP, no inline script, no network or timer API, no HTML sinks, no producer, no clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const code = (name) => read(name).replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((line) => line.replace(/(^|\s)\/\/.*$/, '')).join('\n');

test('index.html carries the strict content security policy and no inline code', () => {
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.equal(policy, "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'");
  assert.equal([...html.matchAll(/<script\b[^>]*>/g)].every((match) => /\ssrc="[^"]+"/.test(match[0])), true, 'every script has a src');
  assert.equal(/<script\b[^>]*>\s*\S/.test(html.replace(/<script\b[^>]*><\/script>/g, '')), false, 'no inline script body');
  assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'no inline event handler');
  assert.equal(/\sstyle\s*=/i.test(html), false, 'no inline style');
  assert.equal(/javascript:/i.test(html), false);
  assert.equal(/<(iframe|object|embed|form|img|link\s+rel="(?!stylesheet))/i.test(html), false);
  assert.equal(/https?:\/\//i.test(html), false, 'no remote URL');
});

test('the markup is accessible: one language, labelled slider, live status, alert, unique ids and text for every control', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<div id="scrub" role="slider" tabindex="-1" aria-labelledby="scrub-label" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="[^"]+" aria-disabled="true">/);
  assert.match(html, /<p id="status" role="status" aria-live="polite"/);
  assert.match(html, /<p id="error" role="alert">/);
  assert.match(html, /<label for="saved-run">/);
  assert.match(html, /id="scrub-label">[^<]*Left and Right[^<]*Page Up and Page Down[^<]*Home and End/);
  for (const match of html.matchAll(/<button id="([^"]+)"[^>]*>([^<]+)<\/button>/g)) assert.ok(match[2].trim().length > 3, match[1]);
  assert.equal([...html.matchAll(/<button /g)].length, 12);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
});

test('timeline.js, describe.js and page.js use no network, timer, HTML sink, eval, producer or clock', () => {
  const forbidden = [/\bfetch\b/, /XMLHttpRequest/, /EventSource/, /WebSocket/, /\bsetTimeout\b/, /\bsetInterval\b/, /setImmediate/, /requestAnimationFrame/, /queueMicrotask/,
    /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\b/, /new Function/, /\bimport\s*\(/, /child_process/, /require\('node:(net|http|https|dgram|dns|tls|worker_threads)/,
    /C044\\\\(run|server|store)/, /Date\.now|new Date|Math\.random|performance\.now/, /localStorage|sessionStorage|document\.cookie|navigator\.sendBeacon/];
  for (const name of ['timeline.js', 'describe.js', 'page.js']) {
    const source = code(name);
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${name} must not match ${pattern}`);
  }
  assert.match(code('timeline.js'), /require\('\.\.\\\\C044\\\\reducer\.js'\)/);
  assert.match(code('page.js'), /history\.replaceState/);
});

test('style.css respects reduced motion, loads nothing and marks failed and unknown entries beyond colour', () => {
  const css = read('style.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^}]*transition: none/);
  assert.doesNotMatch(css, /url\(|@import/);
  assert.match(css, /data-class="failed"[^}]*text-decoration: underline/);
  assert.match(css, /data-class="unknown"[^}]*text-decoration: underline dotted/);
  assert.match(css, /:focus-visible/);
});

test('X001.feature names every promise the tests below check', () => {
  const feature = read('X001.feature');
  for (const scenario of ['stateAt is the fold', 'NOT_RECORDED', 'limits of a recording', 'hostile or damaged saved run', 'keyboard operable', 'URL fragment', 'zero network requests']) {
    assert.ok(feature.includes(scenario), scenario);
  }
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').trim(), '* -text');
  assert.equal(fs.readFileSync(path.join(root, 'evidence', '.gitattributes'), 'utf8').trim(), '* -text -diff');
});
