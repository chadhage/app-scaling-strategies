'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {run}=require('./budget.cjs');
const result=run(['capability\\C012\\tests\\public-v3-suite.cjs'],{timeout:1500000});
for(const name of ['stdout','stderr'])fs.writeFileSync(path.join(process.env.C012_METADATA,'whole-current.'+name+'.raw'),result[name]||'',{flag:'wx'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0);
