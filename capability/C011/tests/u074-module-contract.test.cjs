'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {prepare}=require('./u074-module-contract.cjs'),{createLoader,root,sha,ModuleFault}=require('./u069-loader.cjs');
const {build,PRODUCTION}=require('./u074-inventory.cjs');
const sources=Object.fromEntries(PRODUCTION.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const report=build(sources),start=sources['codes.cjs'].indexOf('const CODES');
const definition=report.definitions.find(row=>row.file==='codes.cjs'&&row.start===start&&row.operator==='statement-delete');
assert.ok(definition&&definition.compiled,'The tested missing-initializer variant really is valid JavaScript');
test('U074 required initialization/export contract has a real identical-environment pristine control and pinned modules',()=>{
  const control=prepare(definition);assert.equal(control.proof.compiledOriginal,true);assert.equal(control.proof.compiledMutant,true);
  assert.equal(control.proof.pristineIdenticalEnvironmentPassed,true);assert.ok(control.proof.moduleHashes.length>=30);
  assert.doesNotThrow(()=>control.pristine());
});
test('U074 valid deleted production declaration fails its natural required-module contract as ERR_ASSERTION, not invalid-module',()=>{
  const control=prepare(definition),loader=createLoader(definition);
  assert.throws(()=>control.run(loader),error=>error.code==='ERR_ASSERTION'&&/required.*module.*initializes/i.test(error.message));
});
for(const name of ['missing','changed']){
  test('U074 '+name+' required dependency stays NON-kill before the behavioral module assertion',()=>{
    const read=(file,...args)=>{
      if(file.endsWith(path.join('C009','authz.cjs'))){if(name==='missing')throw Object.assign(new Error('missing'),{code:'ENOENT'});return Buffer.from('changed');}
      return fs.readFileSync(file,...args);
    };
    assert.throws(()=>prepare(definition,{read}),error=>error.code==='U074_INIT_ENV_NONKILL');
  });
}
test('U074 syntax-invalid construction never becomes a required-initialization behavioral kill',()=>{
  const bad={...definition,replacement:'const =',compiled:false,mutantSha256:sha(Buffer.from('not used'))};
  assert.throws(()=>prepare(bad),error=>error.code==='U074_INIT_ENV_NONKILL');
});
test('U074 failing pristine initialization is NON-kill, never silently replaced by another environment',()=>{
  assert.throws(()=>prepare(definition,{pristineFactory:()=>({load(){throw Object.assign(new Error('permission'),{code:'EACCES'});}})}),
    error=>error.code==='U074_INIT_ENV_NONKILL');
});
for(const kind of ['missing-module','foreign-module']){
  test('U074 '+kind+' fault cannot be wrapped into an assertion kill',()=>{
    const control=prepare(definition),cause=kind==='missing-module'?Object.assign(new Error('missing'),{code:'MODULE_NOT_FOUND'}):new TypeError('foreign');
    const file=kind==='missing-module'?path.join(root,'codes.cjs'):path.resolve(root,'..','C009','authz.cjs');
    const loader={load(){throw new ModuleFault(file,cause,'module-initialization');}};
    assert.throws(()=>control.run(loader),error=>error.code==='U074_INIT_ENV_NONKILL');
  });
}
