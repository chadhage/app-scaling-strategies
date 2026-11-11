'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const file=process.env.U069_INITIALIZATION_REPORT||path.join(root,'evidence','u069','current-report-v2.json');
const report=JSON.parse(fs.readFileSync(file));
for(const id of [245,246,254])test('U069 V3 valid JavaScript configuration initialization position '+id+' has an actual named required-export assertion',()=>{
  const definition=report.definitions.find(entry=>entry.id===id),entry=report.entries.find(entry=>entry.id===id);
  assert.equal(definition.file,'config.cjs');
  const original=fs.readFileSync(path.join(root,'evidence','u069','v3-history','v2-sources',definition.file),'utf8');
  assert.doesNotThrow(()=>new vm.Script(original.slice(0,definition.start)+definition.replacement+original.slice(definition.end)));
  assert.equal(entry.decision,'killed','valid production initialization behavior is not generator-invalid merely because initialization failed');
  assert.equal(entry.moduleFault,null);
  assert.ok(entry.namedFailures.some(name=>name.includes('required configuration module initializes and exports its closed validated contract')));
  assert.equal(report.invalidSpecimens,0);
});
