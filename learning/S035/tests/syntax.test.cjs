'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('all owned JavaScript parses under the existing Node tooling', () => {
  for (const file of ['callback.js', 'app.js', ...fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs')).map((file) => `tests\\${file}`)]) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('browser model export loads without Node or a framework', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'callback.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.S035.startLogin, 'function');
  assert.equal(typeof sandbox.S035.cutover, 'function');
  assert.equal(typeof sandbox.S035.deliverCallback, 'function');
  assert.equal(sandbox.S035.MAX_HISTORY, 6);
});

test('HTML declares exact banner, restrictive CSP, local assets and unshadowed explicit reset', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /script-src 'self'; style-src 'self'/);
  for (const directive of ['connect-src', 'img-src', 'object-src', 'frame-src', 'worker-src', 'form-action', 'base-uri']) {
    assert.ok(html.includes(`${directive} 'none'`));
  }
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((item) => item[1]), ['callback.js', 'app.js']);
  assert.match(html, /<link rel="stylesheet" href="styles.css">/);
  assert.doesNotMatch(html, /\bon\w+\s*=|name=["']reset["']|unsafe-inline|unsafe-eval|https?:\/\//i);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(app, /innerHTML|eval\(|fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
