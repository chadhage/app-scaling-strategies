'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{decide}=require('./u074-verdict.cjs');
const fixture=()=>({fixture:'SYNTHETIC CLASSIFIER UNIT INPUT ONLY, not execution evidence',compiled:true,identity:false,
  executed:true,readSha256:'a'.repeat(64),mutantSha256:'a'.repeat(64),executedSourceVerified:true,
  pristinePassed:true,dependenciesVerified:true,causallyReached:true,
  observation:{name:'declared valid API operation returns its typed result',code:'ERR_ASSERTION'},fault:null,pairedProof:null});
test('U074 verdict permits an actual reached natural ERR_ASSERTION only after compiled exact source and pristine controls',()=>{
  assert.equal(decide(fixture()),'killed');
});
for(const[name,change,expected]of [
  ['syntax rejection',e=>{e.compiled=false;},'nonkill-syntax'],
  ['unchanged identity',e=>{e.identity=true;},'nonkill-identity'],
  ['unexecuted position',e=>{e.executed=false;},'unexecuted'],
  ['missing dependency',e=>{e.dependenciesVerified=false;},'nonkill-environment'],
  ['failed pristine control',e=>{e.pristinePassed=false;},'nonkill-pristine'],
  ['different actual source read',e=>{e.readSha256='b'.repeat(64);},'nonkill-binding'],
  ['unverified executed bytes',e=>{e.executedSourceVerified=false;},'nonkill-binding'],
  ['unreached assertion',e=>{e.causallyReached=false;},'nonkill-unreached'],
  ['module fault alone',e=>{e.observation=null;e.fault={kind:'module'};},'nonkill-fault'],
  ['crash',e=>{e.fault={kind:'crash'};},'nonkill-fault'],
  ['watchdog cutoff',e=>{e.fault={kind:'timeout'};},'nonkill-fault'],
  ['permission failure',e=>{e.fault={kind:'permission'};},'nonkill-fault']
])test('U074 verdict never credits '+name+' as a behavioral kill',()=>{
  const entry=fixture();change(entry);assert.equal(decide(entry),expected);
});
test('U074 passing old/default probes are survivors, never default equivalence',()=>{
  const entry=fixture();entry.observation=null;assert.equal(decide(entry),'survived');
});
test('U074 equivalence requires its own actual source-exact asserted paired domain, not a reachability sentence',()=>{
  const entry=fixture();entry.observation=null;entry.pairedProof={domain:'the explicitly enumerated current API input domain',
    cases:8,assertedPairs:8,pristineSourceSha256:'c'.repeat(64),counterfactualSha256:entry.mutantSha256};
  assert.equal(decide(entry),'equivalent');
  entry.pairedProof.assertedPairs=0;assert.equal(decide(entry),'survived');
});
