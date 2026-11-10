'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { childEnv } = require('./proc.cjs');

test('the preload counts callable assert, assert/strict and t.assert, and distinguishes an explicit skipped fixture', (t) => {
  const parent = path.join(__dirname, 'scratch');
  fs.mkdirSync(parent, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(parent, 'census-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const fixture = path.join(scratch, 'fixture.cjs');
  fs.writeFileSync(fixture, `
    const { test } = require('node:test');
    test('callable', () => { const a = require('node:assert'); a(true); a.equal(1, 1); });
    test('strict', () => { const a = require('node:assert/strict'); a.ok(true); a.deepEqual([1], [1]); });
    test('context', (t) => { t.assert.ok(true); t.assert.equal(2, 2); });
    test('named skip control', { skip: 'a named skip is not an executed pass' }, () => {});
  `);
  const child = spawnSync(process.execPath, ['--require', path.join(__dirname, 'assertion-count.cjs'), '--test', fixture], {
    cwd: scratch, env: childEnv({ C022_ASSERTION_DIR: scratch }), encoding: 'utf8', timeout: 60000
  });
  assert.equal(child.status, 0, child.stderr);
  const reports = fs.readdirSync(scratch).filter((name) => /^assertions-\d+\.json$/.test(name));
  assert.equal(reports.length, 1);
  const report = JSON.parse(fs.readFileSync(path.join(scratch, reports[0]), 'utf8'));
  assert.deepEqual(report.tests.map((row) => [row.name, row.assertions]),
    [['callable', 2], ['strict', 2], ['context', 2]]);
  assert.ok(report.tests.every((row) => row.assertions > 0));
  assert.match(child.stdout, /named skip control # SKIP a named skip is not an executed pass/);
});
