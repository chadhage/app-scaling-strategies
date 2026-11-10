'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,originals,createLoader,sha,ModuleFault}=require('./u069-loader.cjs');
const LABELS=new Set([
  'receiver "...CONDUCTORS" of .flatMap( emptied @17:3',
  'receiver "...TIERS" of .map( emptied @18:3',
  'argument 1 "base.identities" of Object.values( replaced by undefined @9:48'
]);
const selected=definition=>definition.file==='config.cjs'&&LABELS.has(definition.label);
class EligibilityFault extends Error{
  constructor(message){super(message);this.code='U069_NON_KILL_ELIGIBILITY';}
}
const reject=message=>{throw new EligibilityFault(message);};
function exportsContract(api){
  assert.deepEqual(Object.keys(api).sort(),['CONDUCTORS','NUMBERS','PRICE_VERSION','TIERS','resolveConfig']);
  assert.deepEqual(api.CONDUCTORS,['conductor-a','conductor-b']);
  assert.deepEqual(api.TIERS,['standard','burst']);assert.equal(api.PRICE_VERSION,'p1');
  assert.equal(typeof api.resolveConfig,'function');
  assert.equal(api.NUMBERS.length,20);
  assert.ok(Object.isFrozen(api.NUMBERS));
  const resolved=api.resolveConfig();
  assert.equal(resolved.pool.units,100);assert.equal(resolved.pool.spend,600);
  assert.equal(resolved.keyEntries,1000);assert.equal(resolved.prices.standard,4);assert.equal(resolved.prices.burst,8);
}
function environmentFault(error){
  const seen=new Set();
  for(let current=error;current&&typeof current==='object'&&!seen.has(current);current=current.cause){
    seen.add(current);
    if(['ENOENT','EACCES','EPERM','MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_DLOPEN_FAILED'].includes(current.code))return true;
    if(current instanceof SyntaxError||current.phase==='syntax')return true;
  }
  return false;
}
function prepare(definition,options={}){
  if(!selected(definition))reject('No declared initialization-contract subject');
  const read=options.read||fs.readFileSync;
  const frozen=JSON.parse(fs.readFileSync(path.join(root,'evidence','u069','v3-history','v2-current','source-freeze.json')));
  const pins=[
    ...frozen.files.filter(entry=>!entry.path.includes('/')&&/\.(?:cjs|js|json)$/.test(entry.path)).map(entry=>({...entry,file:path.join(root,entry.path)})),
    ...frozen.dependencies.map(entry=>({...entry,file:path.resolve(root,'..','..',...entry.path.split('/'))}))
  ];
  const check=()=>{
    const observed=[];
    for(const pin of pins){
      let bytes;try{bytes=read(pin.file);}catch(error){reject('Pinned required module is missing/unreadable: '+pin.path+':'+error.code);}
      const digest=sha(bytes);
      if(!pin.acceptedSha256.includes(digest))reject('Pinned required module differs: '+pin.path);
      observed.push({path:pin.path,sha256:digest});
    }
    return observed;
  };
  const hashes=check(),source=originals.get('config.cjs');
  if(sha(Buffer.from(source))!==definition.sourceSha256)reject('Wrong pristine production source');
  const mutant=source.slice(0,definition.start)+definition.replacement+source.slice(definition.end);
  if(sha(Buffer.from(mutant))!==definition.mutantSha256)reject('Wrong actual transformation');
  try{new vm.Script(source);new vm.Script(mutant);}catch{reject('Syntax-invalid transformation is NON-kill');}
  try{exportsContract(createLoader().load('config.cjs'));}catch(error){reject('Identical-environment pristine contract did not pass: '+error.message);}
  const proof={schema:'U069-required-module-contract/1',sourceSha256:definition.sourceSha256,mutantSha256:definition.mutantSha256,
    compiledOriginal:true,compiledMutant:true,pristineIdenticalEnvironmentPassed:true,moduleHashes:hashes,
    policy:'Required initialization/export behavior only after exact source, complete pinned modules, compiled transformation and passing same-environment pristine. Missing dependencies, syntax, environment or changed hashes are NON-kill.'};
  const stable=()=>{if(JSON.stringify(check())!==JSON.stringify(hashes))reject('Module environment changed during the paired contract');};
  return{proof,
    pristine(){stable();exportsContract(createLoader().load('config.cjs'));stable();},
    run(loader){
      stable();
      let api,error;
      try{api=loader.load('config.cjs');}catch(caught){error=caught;}
      stable();
      if(error){
        if(environmentFault(error)||!(error instanceof ModuleFault)||error.phase!=='module-initialization'
          ||path.resolve(error.file)!==path.join(root,'config.cjs')||!(error.cause instanceof TypeError))
          reject('Non-production/environment initialization fault is NON-kill');
      }
      assert.equal(error,undefined,'required configuration module initializes and exports its closed validated contract');
      exportsContract(api);
    }};
}
module.exports={selected,prepare,EligibilityFault,exportsContract,environmentFault};
