'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {run}=require('./budget.cjs');
const r=run(['capability\\C012\\tests\\public-v4-suite.cjs'],{timeout:900000});
for(const name of ['stdout','stderr'])fs.writeFileSync(path.join(process.env.C012_METADATA,'whole-v4.'+name+'.raw'),r[name]||'',{flag:'wx'});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0);
