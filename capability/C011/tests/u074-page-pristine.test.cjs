'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {createLoader}=require('./u074-loader.cjs'),{pageExtraCases,corpus}=require('./u074-page-probes.cjs');
const cases=pageExtraCases(createLoader());
for(let index=0;index<cases.length;index++)test('U074 identical-source pristine page corpus control: '+cases[index].name,async()=>{
  assert.ok(corpus().length>1000);
  await cases[index].run();
});
