'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {definitions,createLoader,ModuleFault}=require('./u069-loader.cjs');
const {invalidReason}=require('./u069-audit.cjs');
const specimens=definitions().filter(invalidReason);
test('U069 the three explicitly initialization-invalid specimens have zero behavioral kill credit',()=>{
  assert.equal(specimens.length,3);
  assert.equal(invalidReason({file:'config.cjs',label:'unknown module fault'}),null);
});
for(const definition of specimens)test('U069 non-kill initialization witness: '+definition.label,()=>{
  assert.equal(typeof createLoader().load('config.cjs').resolveConfig,'function');
  assert.throws(()=>createLoader(definition).load('config.cjs'),error=>{
    assert.ok(error instanceof ModuleFault);
    assert.equal(error.phase,'module-initialization');
    assert.equal(error.file.endsWith('config.cjs'),true);
    assert.ok(invalidReason(definition).length>20);
    return true;
  });
});
