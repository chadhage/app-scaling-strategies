'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {createLoader,root}=require('./u074-loader.cjs'),{pureExtraCases,serverExtraCases}=require('./u074-extra-probes.cjs');
const {build,PRODUCTION}=require('./u074-inventory.cjs');
const report=build(Object.fromEntries(PRODUCTION.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')])));
for(const file of ['contract.js','store.cjs'])for(const probe of pureExtraCases(file,createLoader()))
  test('U074 actual pristine extra API control: '+probe.name,async()=>{await probe.run();assert.ok(true);});
for(const probe of serverExtraCases(createLoader()))
  test('U074 actual pristine extra server control: '+probe.name,async()=>{await probe.run();assert.ok(true);});
for(const[file,fragment,replacement]of [
  ['contract.js',"typeof value === 'string'",'true'],['store.cjs','entry.id === id','true'],
  ['server.cjs','options.roleTable','false'],['server.cjs','value.replayed','false']
])test('U074 new real behavioral probe closes '+file+' '+fragment,async()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const choices=report.definitions.filter(d=>d.file===file&&d.replacement===replacement&&source.slice(d.start,d.end)===fragment);
  const definition=fragment==='value.replayed'?choices.at(-1):choices[0];
  assert.ok(definition);
  const loader=createLoader(definition),probes=file==='server.cjs'?serverExtraCases(loader):pureExtraCases(file,loader);let natural=0;
  for(const probe of probes)try{await probe.run();}catch(error){if(error.code==='ERR_ASSERTION')natural++;else throw error;}
  assert.ok(natural>0,'An actual natural API assertion, not an excluded guard or default equivalence');
});
