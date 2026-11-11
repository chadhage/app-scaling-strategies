'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'), vm = require('node:vm'), fs=require('node:fs'),path=require('node:path');
const {inventory,sources}=require('./ast.cjs');
const contracts=require('./current-v2-contracts.cjs');
const {prove,acceptedProof,bind}=require('./current-v2-proof.cjs');
test('all63 valid formerly faulting positions execute specific real initialized public-contract source pairs',async()=>{
  const source=sources(),domain=inventory(source);
  assert.equal(contracts.IDS.length,63);assert.equal(new Set(contracts.IDS).size,63);
  for(const id of contracts.IDS) {
    const definition=domain.definitions.find(row=>row.id===id);
    const proof=await prove(definition,source);
    assert.equal(acceptedProof(definition,proof),true,'accepted actual proof '+id);
    assert.equal(proof.rawFaultConvertedToKill,false);
    assert.equal(proof.equivalent,false,'these new contrast witnesses are not equivalence assertions');
  }
});
test('fault-only identical public state missing bindings identities syntax and environment errors are NONclosure controls',async()=>{
  const source=sources(),domain=inventory(source),definition=domain.definitions.find(row=>row.id===10);
  const proof=await prove(definition,source);
  assert.equal(acceptedProof(definition,{...proof,counterfactualSha256:'0'.repeat(64)}),false);
  assert.equal(acceptedProof(definition,{...proof,counterfactual:proof.original}),false,'an identical observation is not a contrast');
  assert.equal(acceptedProof(definition,{...proof,rawFaultConvertedToKill:true}),false);
  const environment={...proof.counterfactual,faultDiagnostics:[{code:'EACCES',name:'Error',message:'permission control'}]};
  assert.equal(acceptedProof(definition,{...proof,counterfactual:environment}),false);
  assert.throws(()=>bind({...definition,identity:true},source));
  assert.throws(()=>bind({...definition,syntax:{name:'SyntaxError'}},source));
  assert.throws(()=>bind({...definition,id:99999},source),/explicit admitted/);
  let timeout;try{new vm.Script('while(true){}').runInNewContext({},{timeout:20});}catch(error){timeout=error;}
  assert.equal(timeout.code,'ERR_SCRIPT_EXECUTION_TIMEOUT');
  assert.equal(acceptedProof(definition,{...proof,counterfactual:{...proof.counterfactual,faultDiagnostics:[{code:timeout.code}]}}),false);
  const afterPublic={...proof.original,faultDiagnostics:[{name:'Error',code:null,message:'after an otherwise unchanged public observation'}]};
  assert.equal(contracts.qualify(proof.original,afterPublic).accepted,false,'error without a specified semantic contrast never qualifies');
  const actualAfterPublic=await contracts.observe(definition,{...source,'fixtures.js':source['fixtures.js']+"\nthrow new Error('deliberate fault after the valid public fixture export');"});
  assert.equal(actualAfterPublic.faultDiagnostics.length,1);
  assert.deepEqual(actualAfterPublic.publicData,proof.original.publicData);
  assert.equal(contracts.qualify(proof.original,actualAfterPublic).accepted,false,'real post-export fault is not a public-contract contrast');
  const directory=path.join(process.env.C012_RUNTIME,'current-v2-missing-dependency-control');
  fs.mkdirSync(directory);
  try{
    fs.writeFileSync(path.join(directory,'model.js'),source['model.js'],{flag:'wx'});
    assert.throws(()=>require(path.join(directory,'model.js')),error=>error.code==='MODULE_NOT_FOUND','real physical missing dependency is a nonclosure environment control');
  }finally{fs.rmSync(directory,{recursive:true,force:false});}
});
