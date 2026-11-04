'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inventory } = require('./support.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
test('all closed sample routes are represented in a usable native keyboard UI without frameworks or inline code', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
  for (const id of require('..\\routing.js').ids) assert.ok(html.includes(`value="${id}"`), id);
  for (const id of ['sample', 'candidate', 'load', 'inspect', 'compare', 'json', 'reset', 'status', 'error', 'history']) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const rule of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "worker-src 'none'", "script-src 'self'"]) assert.ok(html.includes(rule));
  assert.doesNotMatch(html, /<script[^>]*>[^<\s]|on(?:click|load|change)=/);
  assert.doesNotMatch(page, /innerHTML|outerHTML|eval\(|fetch\(|localStorage|sessionStorage|document\.write/);
  assert.match(page, /el\('sample'\)\.focus\(\)/);
});
test('CLI rejects paths, unknown IDs, extra context and unknown operations before current readers', () => {
  for (const args of [[], ['compare'], ['compare', 'unknown'], ['compare', 'fictional-match', 'approved'],
    ['fixture', '..\\C036'], ['http://127.0.0.1'], ['context', 'override']]) {
    const result = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), ...args], { cwd: repository, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CLOSED_CLI_ARGUMENTS/);
  }
});
test('normal source pin/context/fixture checks do not modify own source, existing evidence or dependencies', async () => {
  const before = inventory(root);
  const pins = require('..\\pins.cjs');
  const dependencies = pins.checkImports();
  const model = await require('..\\routing.js').open();
  model.getFixture('historical-closed');
  model.getFixture('fictional-match');
  assert.deepEqual(inventory(root), before);
  assert.deepEqual(pins.checkImports(), dependencies);
  assert.ok(dependencies.some((entry) => entry.rawEqualsGit === false), 'Raw/Git differences are explicit, not rewritten.');
});
test('capture is exact opt-in and ordinary recorder use cannot write proof', () => {
  for (const value of [undefined, '0', 'true', '01']) {
    const env = { ...process.env };
    if (value === undefined) delete env.CAPTURE_BROWSER_EVIDENCE;
    else env.CAPTURE_BROWSER_EVIDENCE = value;
    const before = inventory(path.join(root, 'evidence'));
    const run = spawnSync(process.execPath, [path.join(__dirname, 'record.cjs'), 'bdd'], {
      cwd: repository, env, encoding: 'utf8', windowsHide: true
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Exact CAPTURE_BROWSER_EVIDENCE=1/);
    assert.deepEqual(inventory(path.join(root, 'evidence')), before);
  }
});
