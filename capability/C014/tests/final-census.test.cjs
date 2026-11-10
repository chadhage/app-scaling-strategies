'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('the assertion census accepts real assertions and named skips, and refuses an executed assertion-free leaf', () => {
  fs.mkdirSync(path.join(__dirname, 'scratch'), { recursive: true });
  const base = fs.mkdtempSync(path.join(__dirname, 'scratch', 'census-'));
  try {
    for (const [label, body, expected] of [
      ['positive', "const test=require('node:test');const assert=require('node:assert/strict');test('asserted',()=>assert.equal(1,1));test('named skip',t=>t.skip('explicit fixture prerequisite is absent'));", 0],
      ['negative', "require('node:test')('empty executed leaf',()=>{});", 1]
    ]) {
      const file = path.join(base, `${label}.cjs`);
      const directory = path.join(base, label);
      fs.writeFileSync(file, body, { flag: 'wx' });
      const env = { ...process.env, C014_CENSUS_DIR: directory, NODE_V8_COVERAGE: '' };
      delete env.NODE_TEST_CONTEXT;
      const run = spawnSync(process.execPath, ['--require', path.join(__dirname, 'final-census.cjs'), '--test', file], { env, windowsHide: true, encoding: 'utf8', timeout: 90000 });
      assert.equal(run.error, undefined);
      assert.equal(run.status, expected, `${label}: assertion-free execution must not count as a pass`);
      const reports = fs.readdirSync(directory).map((name) => JSON.parse(fs.readFileSync(path.join(directory, name))));
      const rows = reports.flatMap((report) => report.rows);
      if (label === 'positive') {
        assert.equal(rows.find((row) => row.name === 'asserted').assertions, 1);
        assert.equal(rows.find((row) => row.name === 'named skip').skipped, 'explicit fixture prerequisite is absent');
        assert.deepEqual(reports.flatMap((report) => report.vacuous), []);
      } else assert.deepEqual(reports.flatMap((report) => report.vacuous), ['empty executed leaf']);
    }
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('two completed census invocations with the same reported PID retain distinct immutable reports', () => {
  fs.mkdirSync(path.join(__dirname, 'scratch'), { recursive: true });
  const base = fs.mkdtempSync(path.join(__dirname, 'scratch', 'census-reuse-'));
  try {
    const file = path.join(base, 'reported-pid.cjs');
    const directory = path.join(base, 'reports');
    fs.writeFileSync(file, "const test=require('node:test');const assert=require('node:assert/strict');test('synthetic reported pid',()=>{Object.defineProperty(process,'pid',{value:3333});assert.equal(1,1);});", { flag: 'wx' });
    for (let invocation = 0; invocation < 2; invocation += 1) {
      const env = { ...process.env, C014_CENSUS_DIR: directory, NODE_V8_COVERAGE: '' };
      delete env.NODE_TEST_CONTEXT;
      const run = spawnSync(process.execPath, ['--require', path.join(__dirname, 'final-census.cjs'), '--test', '--experimental-test-isolation=none', file],
        { env, windowsHide: true, encoding: 'utf8', timeout: 90000 });
      assert.equal(run.error, undefined);
      assert.equal(run.status, 0, 'a reused reported PID must not collide with a prior receipt');
    }
    const reports = fs.readdirSync(directory).map((name) => JSON.parse(fs.readFileSync(path.join(directory, name))));
    assert.equal(reports.filter((row) => row.rows.length).length, 2);
    assert.ok(reports.every((row) => row.vacuous.length === 0));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
