'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const current = require('../current.cjs');
const {fixtureAdapters} = require('./support.cjs');

test('U045 runtime timeout forwarding is structural for the option, environment, and minimum bound', async () => {
  for (const [options,expected] of [
    [{timeoutMs:8000},6000],
    [{timeoutMs:8000,shell:{timeoutMs:2000}},2000],
    [{timeoutMs:8000,shell:{timeoutMs:7900}},6000],
    [{env:{qualify_timeout_ms:'12000'}},9000],
    [{timeoutMs:4000,env:{QUALIFY_TIMEOUT_MS:'8000'}},3000],
    [{timeoutMs:1},1],
  ]) {
    const observed = [];
    const report = await current.qualifyEdge({...options,adapterFactory:config => {
      observed.push(config.shell.timeoutMs);
      return fixtureAdapters();
    }});
    assert.equal(report.ok,true);
    assert.deepEqual(observed,[expected]);
  }
});

test('U045 invalid outer or shell timeout refuses before the adapter factory is touched', async () => {
  let calls = 0;
  const adapterFactory = () => { calls += 1; return fixtureAdapters(); };
  for (const options of [{timeoutMs:0},{timeoutMs:'4'},{timeoutMs:5000,shell:{timeoutMs:0}},{env:{QUALIFY_TIMEOUT_MS:'soon'}}]) {
    const found = await current.qualifyEdge({...options,adapterFactory});
    assert.equal(found.ok,false);
    assert.deepEqual(found.reasonCodes,['QUALIFY_TIMEOUT_INVALID']);
  }
  assert.equal(calls,0);
});
