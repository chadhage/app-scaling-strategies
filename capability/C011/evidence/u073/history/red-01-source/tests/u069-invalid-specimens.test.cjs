'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {test}=require('node:test');
const {definitions,createLoader,ModuleFault,originals,sha,root}=require('./u069-loader.cjs');
const contract=require('./u069-initialization-contract.cjs');
const specimens=definitions().filter(contract.selected);
test('U069 V3 explicitly replaces the retained wrong initialization-invalid classification; all three subjects compile',()=>{
  assert.equal(specimens.length,3);assert.equal(contract.selected({file:'config.cjs',label:'unknown module fault'}),false);
});
for(const definition of specimens){
  test('U069 V3 pristine identical-environment required initialization/export contract: '+definition.label,()=>{
    const prepared=contract.prepare(definition);
    assert.equal(prepared.proof.compiledMutant,true);assert.equal(prepared.proof.pristineIdenticalEnvironmentPassed,true);
    assert.doesNotThrow(()=>prepared.pristine());
  });
  test('U069 V3 exact changed production fails the natural named required-export assertion: '+definition.label,()=>{
    const prepared=contract.prepare(definition);
    assert.throws(()=>prepared.run(createLoader(definition)),error=>{
      assert.equal(error.code,'ERR_ASSERTION');
      assert.ok(error.message.includes('required configuration module initializes and exports its closed validated contract'));
      return true;
    });
  });
}
test('U069 V3 missing dependency is NON-kill before the production contract is eligible',()=>{
  const fs=require('node:fs');
  assert.throws(()=>contract.prepare(specimens[0],{read:file=>{
    if(file.endsWith(path.join('C009','contract.js'))){const error=new Error('controlled missing dependency');error.code='MODULE_NOT_FOUND';throw error;}
    return fs.readFileSync(file);
  }}),error=>error.code==='U069_NON_KILL_ELIGIBILITY');
});
test('U069 V3 syntax-invalid construction is NON-kill even when its digest is honest',()=>{
  const definition={...specimens[0],replacement:'???'},source=originals.get('config.cjs');
  definition.mutantSha256=sha(Buffer.from(source.slice(0,definition.start)+definition.replacement+source.slice(definition.end)));
  assert.throws(()=>contract.prepare(definition),error=>error.code==='U069_NON_KILL_ELIGIBILITY');
});
test('U069 V3 an environment fault never becomes a required-initialization assertion kill',()=>{
  const prepared=contract.prepare(specimens[0]),cause=new TypeError('controlled environment denied');cause.code='EACCES';
  const loader={load(){throw new ModuleFault(path.join(root,'config.cjs'),cause,'module-initialization');}};
  assert.throws(()=>prepared.run(loader),error=>error.code==='U069_NON_KILL_ELIGIBILITY');
});
