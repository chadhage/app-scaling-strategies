'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {createLoader,root}=require('./u074-loader.cjs'),{build,PRODUCTION}=require('./u074-inventory.cjs');
const {prepare}=require('./u074-module-contract.cjs'),{pageExtraCases,page}=require('./u074-page-probes.cjs');
const sources=Object.fromEntries(PRODUCTION.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const report=build(sources),directive=file=>report.definitions.find(d=>d.file===file&&d.operator==='statement-delete'&&/^['"]use strict['"];/.test(sources[file].slice(d.start,d.end)));
for(const file of ['config.cjs','contract.js','json.cjs','server.cjs','store.cjs'])
  test('U074 actual public function call-frame restriction detects removed strict execution in '+file,()=>{
    const definition=directive(file);assert.ok(definition);
    const contract=prepare(definition);
    assert.throws(()=>contract.run(createLoader(definition)),error=>error.code==='ERR_ASSERTION',
      'Actual existing public function objects must retain the strict caller restriction, not a source-text assertion');
  });
test('U074 current page normal function objects really deny caller introspection in the pristine owned VM',async()=>{
  const actual=await page(createLoader());
  for(const name of ['balanced','judge','row','plan','showBooks'])
    assert.throws(()=>actual.helpers[name].caller,error=>error.name==='TypeError',name+' strict calling semantics');
});
test('U074 source-exact page execution restriction detects removed strict execution through actual existing functions',async()=>{
  const loader=createLoader(directive('page.js'));let actual=0;
  for(const probe of pageExtraCases(loader))try{await probe.run();}catch(error){if(error.code==='ERR_ASSERTION')actual++;else throw error;}
  assert.ok(actual>0,'A genuine runtime restriction assertion, not text matching or an environmental failure');
});
