'use strict';
const assert = require('node:assert/strict'), vm = require('node:vm');
const contracts = require('./current-v2-contracts.cjs');
const { sha } = require('./integrity.cjs');
const { sources, inventory } = require('./ast.cjs');
const { isDeepStrictEqual } = require('node:util');
let canonical=null, canonicalKey=null;
function bind(definition, source) {
  assert.ok(contracts.IDS.includes(definition.id), 'explicit admitted fault-position set, not any error');
  assert.equal(definition.identity, false); assert.equal(definition.syntax, null);
  const key=sha(JSON.stringify(Object.entries(source).map(([file,text])=>[file,sha(text)])));
  if(canonicalKey!==key){canonical=inventory(source);canonicalKey=key;}
  assert.deepEqual(definition,canonical.definitions.find(row=>row.id===definition.id),'exact actual whole-domain definition, not an id relabel');
  const read = source[definition.file];
  assert.equal(sha(read), definition.sourceSha256);
  const changed = read.slice(0,definition.start)+definition.replacement+read.slice(definition.end);
  assert.notEqual(changed,read); assert.equal(sha(changed),definition.mutantSha256);
  new vm.Script(read); new vm.Script(changed);
  return changed;
}
async function prove(definition, source=sources()) {
  const changed=bind(definition,source);
  const before=await contracts.dependencies(source);
  const original=await contracts.observe(definition,source);
  contracts.assertPristine(original);
  const counterfactual=await contracts.observe(definition,{...source,[definition.file]:changed});
  const after=await contracts.dependencies(source);
  assert.deepEqual(after,before,'actual dependency source and initialized canary stayed exact');
  const scope=contracts.qualify(original,counterfactual);
  assert.equal(scope.accepted,true,'a diagnostic fault alone cannot close position '+definition.id+': '+JSON.stringify(scope));
  let decision='specific-runnable-scoped-pair', namedAssertion=null;
  if(counterfactual.faultDiagnostics.length===0 && original.spec.kind==='model-public-return' &&
      original.publicData.returnedNormally && counterfactual.publicData.returnedNormally &&
      !isDeepStrictEqual(original.publicData.returned,counterfactual.publicData.returned)) {
    try {assert.deepEqual(counterfactual.publicData.returned,original.publicData.returned,
      'C012 initialized public return contract '+definition.id+' / '+original.spec.operation);}
    catch(error) {
      assert.equal(error.code,'ERR_ASSERTION');
      namedAssertion={name:'C012 initialized public return contract '+definition.id+' / '+original.spec.operation,
        code:error.code, actual:counterfactual.publicData.returned, expected:original.publicData.returned, fault:null};
      decision='named-assertion-kill';
    }
  }
  return {
    schema:'C012-valid-fault-position-specific-public-contract-witness/2', definitionId:definition.id, key:definition.key,
    file:definition.file,start:definition.start,end:definition.end,operator:definition.operator,
    sourceReadSha256:definition.sourceSha256,counterfactualSha256:definition.mutantSha256,
    dependencyProof:before, decision,namedAssertion,
    originalObservationClass:'nonkill-runtime-module-environment-fault',
    faultDiagnosticAloneQualifies:false,rawFaultConvertedToKill:false,
    kind:scope.kind, domain:{...scope.domain,
      description:'Exact actual source, fixed validated producer/dependency bytes and ordinary declared VM globals. The initialized public export, complete producer-backed return or concrete registered client operation is observed in both programs. This is a scoped contrast witness, not a global equivalence or an assert-on-arbitrary-error policy.'},
    equivalent:false,publicDataEquivalentOnly:scope.publicDataEquivalentOnly===true,
    original,counterfactual,pristineAndDependencyControlsPassed:true
  };
}
function acceptedProof(definition,proof) {
  try {
    assert.ok(proof);assert.equal(proof.definitionId,definition.id);assert.equal(proof.key,definition.key);
    assert.equal(proof.file,definition.file);assert.equal(proof.start,definition.start);assert.equal(proof.end,definition.end);assert.equal(proof.operator,definition.operator);
    assert.equal(proof.sourceReadSha256,definition.sourceSha256);assert.equal(proof.counterfactualSha256,definition.mutantSha256);
    assert.equal(proof.rawFaultConvertedToKill,false);assert.equal(proof.faultDiagnosticAloneQualifies,false);
    assert.equal(proof.pristineAndDependencyControlsPassed,true);
    assert.deepEqual(proof.original.spec,contracts.family(definition.id));
    for(const [observation,hash]of [[proof.original,definition.sourceSha256],[proof.counterfactual,definition.mutantSha256]]) {
      const actual=observation.executions.find(row=>row.file===definition.file);
      assert.ok(actual);assert.equal(actual.readSha256,hash);assert.equal(actual.executedSha256,hash);
    }
    assert.equal(proof.dependencyProof.sourceBindings[definition.file],definition.sourceSha256);
    const verdict=contracts.qualify(proof.original,proof.counterfactual);
    assert.equal(verdict.accepted,true);assert.equal(verdict.kind,proof.kind);
    if(proof.decision==='named-assertion-kill') {
      assert.equal(proof.counterfactual.faultDiagnostics.length,0);
      assert.equal(proof.namedAssertion.code,'ERR_ASSERTION');assert.equal(proof.namedAssertion.fault,null);
      assert.notDeepEqual(proof.namedAssertion.actual,proof.namedAssertion.expected);
    }else assert.equal(proof.decision,'specific-runnable-scoped-pair');
    return true;
  }catch{return false;}
}
module.exports={bind,prove,acceptedProof};
