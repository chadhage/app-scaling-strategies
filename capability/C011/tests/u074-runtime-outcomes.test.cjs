'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {createLoader,root,ModuleFault}=require('./u074-loader.cjs'),{build,PRODUCTION}=require('./u074-inventory.cjs');
const contract=require('./u074-module-contract.cjs'),{decide}=require('./u074-verdict.cjs');
const sources=Object.fromEntries(PRODUCTION.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const report=build(sources),syntaxData=report.definitions.find(d=>d.file==='json.cjs'&&d.operator==='condition-false'&&sources[d.file].slice(d.start,d.end)==="char < ' '");
test('U074 actual runtime JSON-data SyntaxError is an observable typed-parser contract violation, not a JavaScript compiler failure',()=>{
  const text='"'+String.fromCharCode(0)+'"';
  assert.deepEqual(createLoader().load('json.cjs').parseStrict(text),{ok:false});
  let actual;try{createLoader(syntaxData).load('json.cjs').parseStrict(text);}catch(error){actual=error;}
  assert.equal(actual?.name,'SyntaxError');assert.equal(contract.environmentFault(actual),false);
});
test('U074 valid deleted scanner loop fails a real initializer API operation assertion rather than invalid-module exclusion',()=>{
  const definition=report.definitions.find(d=>d.file==='json.cjs'&&d.operator==='statement-delete'&&sources[d.file].slice(d.start,d.end).startsWith('for (;;)'));
  const proof=contract.prepare(definition);
  assert.throws(()=>proof.run(createLoader(definition)),error=>error.code==='ERR_ASSERTION');
});
test('U074 actual VM compilation SyntaxError and missing dependency are still NON-kill faults',()=>{
  assert.equal(contract.environmentFault(new ModuleFault(path.join(root,'json.cjs'),new SyntaxError('compiler'),'syntax')),true);
  assert.equal(contract.environmentFault(Object.assign(new Error('missing'),{code:'MODULE_NOT_FOUND'})),true);
});
test('U074 a genuine own runnable paired equivalence does not require the redundant branch itself to be reached',()=>{
  const hash='a'.repeat(64),entry={compiled:true,identity:false,executed:true,readSha256:hash,mutantSha256:hash,executedSourceVerified:true,
    pristinePassed:true,dependenciesVerified:true,causallyReached:false,observation:null,fault:null,
    pairedProof:{domain:'Own exact source-bound paired public-domain observations, not a default test pass or reachability sentence',
      cases:5,assertedPairs:5,pristineSourceSha256:'b'.repeat(64),counterfactualSha256:hash}};
  assert.equal(decide(entry),'equivalent');
  entry.pairedProof=null;assert.equal(decide(entry),'nonkill-unreached');
});
