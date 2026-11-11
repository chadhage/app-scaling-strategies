'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {createLoader,root}=require('./u074-loader.cjs'),{build,PRODUCTION}=require('./u074-inventory.cjs'),{pageExtraCases}=require('./u074-page-probes.cjs');
const sources=Object.fromEntries(PRODUCTION.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const report=build(sources);
for(const expression of ['isObject(item)',"typeof item.id === 'string'",'count(item.units)','isObject(body.allowance.pool)',
  "Object.keys(body.allowance.pool).join() === 'units,spend'",'isObject(body.allowance.prices)']){
  test('U074 JSON-path corpus causally kills the actual previously surviving guard: '+expression,async()=>{
    const definition=report.definitions.find(d=>d.file==='page.js'&&d.operator==='condition-true'&&sources[d.file].slice(d.start,d.end)===expression);
    assert.ok(definition&&definition.compiled);
    const loader=createLoader(definition);let naturalFailures=0;
    for(const probe of pageExtraCases(loader)){
      try{await probe.run();}catch(error){if(error.code==='ERR_ASSERTION')naturalFailures++;else throw error;}
    }
    assert.ok(naturalFailures>0,'A real named assertion, not a module fault/default-equivalent verdict, must close the current surviving guard');
  });
}
