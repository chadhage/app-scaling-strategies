'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createLoader,root,originals,sha,ModuleFault}=require('./u069-loader.cjs');
const exportsByFile={
  'codes.cjs':{CODES:'object'},
  'config.cjs':{CONDUCTORS:'object',TIERS:'object',PRICE_VERSION:'string',NUMBERS:'object',resolveConfig:'function'},
  'contract.js':{roles:'object',identities:'object',fixed:'object',claimFields:'object',serverFields:'object',states:'object',routes:'object',
    roleTable:'object',conductors:'object',tiers:'object',priceVersion:'string',resolveConfig:'function',isId:'function',isKey:'function',
    resolve:'function',allowedMethods:'function',parseQuery:'function',validateBody:'function'},
  'json.cjs':{parseStrict:'function',UNSAFE:'symbol'},
  'server.cjs':{createApp:'function',startLocal:'function',scope:'object'},
  'store.cjs':{createStore:'function'}
};
const baseline=JSON.parse(fs.readFileSync(path.join(root,'evidence','u074','history','published-baseline.json')));
const pins=[
  ...fs.readdirSync(root).filter(file=>/\.(?:cjs|js|json)$/.test(file)).map(file=>({path:file,file:path.join(root,file),
    acceptedSha256:[sha(fs.readFileSync(path.join(root,file)))]})),
  ...baseline.dependencies.map(pin=>({path:pin.path,file:path.resolve(root,'..','..',...pin.path.split('/')),acceptedSha256:pin.acceptedSha256}))
];
function reject(message){throw Object.assign(new Error(message),{code:'U074_INIT_ENV_NONKILL'});}
function environmentFault(error){
  const seen=new Set();
  for(let current=error;current&&typeof current==='object'&&!seen.has(current);current=current.cause){
    seen.add(current);
    if(['ENOENT','EACCES','EPERM','MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_DLOPEN_FAILED'].includes(current.code)
      ||current.phase==='syntax')return true;
  }
  return false;
}
function exportsContract(file,api){
  const expected=exportsByFile[file];assert.ok(expected,'A closed declared initialization contract, never an inferred arbitrary export list');
  assert.ok(api&&typeof api==='object','required module exports an API object');
  assert.deepEqual(Object.keys(api).sort(),Object.keys(expected).sort(),'required module exports exactly its public contract');
  for(const[name,type]of Object.entries(expected)){
    assert.equal(typeof api[name],type,'required public export '+name);
    if(type==='function')assert.throws(()=>api[name].caller,error=>error.name==='TypeError',
      'Actual strict public function objects deny caller introspection: '+name);
  }
  if(file==='codes.cjs'){
    assert.ok(Object.isFrozen(api.CODES));assert.deepEqual(api.CODES.AUTHENTICATION_REQUIRED,[401,'A bearer token is required.']);
  }
  if(file==='config.cjs')require('./u069-initialization-contract.cjs').exportsContract(api);
  if(file==='contract.js'){
    assert.deepEqual(api.fixed,{urlChars:2048,batchOps:5,pageDefault:20,pageMax:50,offsetMax:1000,unitsMax:50,depth:6});
    assert.deepEqual(api.validateBody('reserve',{key:'module-probe-key',tier:'standard',units:1}),
      {ok:true,value:{key:'module-probe-key',tier:'standard',units:1}});
    assert.equal(api.isId('rsv-00000001'),true);assert.equal(api.isKey('module-probe-key'),true);
  }
  if(file==='json.cjs'){
    const parsed=api.parseStrict('{"x":1}');assert.equal(parsed.ok,true);
    assert.equal(Object.getPrototypeOf(parsed.value),null,'The actual strict parser public object is deliberately null-prototype');
    assert.deepEqual(Object.keys(parsed.value),['x']);assert.equal(parsed.value.x,1);
  }
  if(file==='server.cjs'){assert.equal(api.scope.cardId,'C011');assert.equal(api.scope.businessData,'synthetic');}
  if(file==='store.cjs'){
    const store=api.createStore({config:require('../config.cjs').resolveConfig(),now:()=>1000,newId:()=> 'rsv-00000001'});
    assert.ok(store&&typeof store.snapshot==='function'&&typeof store.reserve==='function','declared store factory initializes its coherent API');
  }
}
function prepare(definition,options={}){
  if(!exportsByFile[definition.file]||!definition.compiled||definition.identity)reject('No valid changed declared module-initialization subject');
  const original=originals.get(definition.file),changed=original.slice(0,definition.start)+definition.replacement+original.slice(definition.end);
  if(sha(Buffer.from(original))!==definition.sourceSha256||sha(Buffer.from(changed))!==definition.mutantSha256)reject('Actual original/changed source differs');
  try{new vm.Script(original);new vm.Script(changed);}catch{reject('Syntax-invalid transformation is NON-kill');}
  const read=options.read||fs.readFileSync;
  const check=()=>{
    const observed=[];
    for(const pin of pins){
      let bytes;try{bytes=read(pin.file);}catch(error){reject('Missing/unreadable required module '+pin.path+':'+error.code);}
      const digest=sha(bytes);if(!pin.acceptedSha256.includes(digest))reject('Actual required module bytes differ: '+pin.path);
      observed.push({path:pin.path,sha256:digest});
    }
    return observed;
  };
  const hashes=check(),pristineFactory=options.pristineFactory||(()=>createLoader());
  try{exportsContract(definition.file,pristineFactory().load(definition.file));}
  catch(error){reject('Identical-environment pristine contract is NONPASS: '+error.message);}
  const proof={schema:'U074-required-public-module-contract/1',sourceSha256:definition.sourceSha256,mutantSha256:definition.mutantSha256,
    compiledOriginal:true,compiledMutant:true,pristineIdenticalEnvironmentPassed:true,moduleHashes:hashes,
    declaredExports:exportsByFile[definition.file],scope:'Actual published public initialization/export/valid-operation contract, not module-fault renaming'};
  const stable=()=>{if(JSON.stringify(check())!==JSON.stringify(hashes))reject('Actual required module environment changed');};
  return{proof,
    pristine(){stable();exportsContract(definition.file,pristineFactory().load(definition.file));stable();},
    run(loader){
      stable();let rejection;
      try{exportsContract(definition.file,loader.load(definition.file));}catch(error){rejection=error;}
      stable();
      if(rejection&&(environmentFault(rejection)||(rejection instanceof ModuleFault&&
        (rejection.phase!=='module-initialization'||path.resolve(rejection.file)!==path.join(root,definition.file)))))
        reject('Dependency/environment/instrumentation failure stays NON-kill');
      assert.doesNotThrow(()=>{if(rejection)throw rejection;},'required public module initializes and exports its declared coherent contract');
    }};
}
module.exports={prepare,exportsContract,environmentFault,exportsByFile};
