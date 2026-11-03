'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./proof.cjs');

test('all executable lesson and focused-test JavaScript parses under Node 22', () => {
  assert.match(process.version, /^v22\./);
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'evidence') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(file);
    }
  }
  visit(root);
  assert.ok(files.length >= 7);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, `${path.relative(root, file)}: ${result.stderr}`);
  }
  console.log(`Syntax checked ${files.length} files.`);
});

test('offline HTML has only declared local assets, external scripts and restrictive CSP', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'",
  ]) assert.ok(policy.includes(directive), directive);
  assert.doesNotMatch(policy, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son\w+=|\sstyle=|<iframe|<base|<object/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 2);
  assert.deepEqual(scripts.map((match) => match[1].match(/src="([^"]+)"/)?.[1]), ['warmup.js', 'app.js']);
  assert.ok(scripts.every((match) => match[2].trim() === '' && /\bdefer\b/.test(match[1])));
  assert.doesNotMatch(html, /(?:id|name)="reset"/i);
  for (const file of ['warmup.js', 'app.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|eval|setTimeout|setInterval)\s*\(|innerHTML|localStorage|sessionStorage/);
  }
});
