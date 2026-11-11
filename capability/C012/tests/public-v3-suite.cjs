'use strict';
const assert=require('node:assert/strict');
const {run}=require('./budget.cjs');
const names=['acceptance','model','retained-hostile','page','resource','ast','probes','pairs','evidence','representations','domain-roundtrip',
  'current-v2-closure','public-v3-integrity','public-v3-transport','public-v3-budget'];
const result=run(['--test','--experimental-test-isolation=none','--test-concurrency=1','--test-timeout=120000',
  ...names.map(name=>'capability\\C012\\tests\\'+name+'.test.cjs')],{timeout:1500000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0);
