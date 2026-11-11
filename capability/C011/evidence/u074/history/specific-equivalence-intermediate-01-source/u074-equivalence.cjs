'use strict';
const assert=require('node:assert/strict');
const {createLoader,originals}=require('./u074-loader.cjs'),{page,neutral}=require('./u074-page-probes.cjs');
const parser=require('./u074-parser.cjs'),old=require('./u069-equivalence.cjs');
function identify(definition,text=originals.get(definition.file)){
  const fragment=text.slice(definition.start,definition.end),before=text.slice(Math.max(0,definition.start-100),definition.start);
  if(definition.file==='codes.cjs'&&definition.operator==='statement-delete'&&/^['"]use strict['"];/.test(fragment))return'closed-data-module-strict-directive';
  if(definition.file==='config.cjs'&&['{ return fail(null); }','return fail(null);'].includes(fragment)&&before.includes('catch'))return'config-abrupt-snapshot-reclosed';
  if(definition.file==='contract.js'&&fragment==='return null;')return'private-field-check-falsy-completion';
  if(definition.file==='page.js'&&['{ body = null; }','body = null;'].includes(fragment)&&before.includes('catch'))return'page-json-abrupt-assignment-keeps-null';
  if(definition.file==='json.cjs'&&['if (thrown !== stop) throw thrown;','throw thrown;'].includes(fragment))return'wire-string-parser-has-only-local-stop-refusals';
  if(definition.file==='json.cjs'&&fragment==='at < text.length'&&definition.replacement==='true')return'primitive-string-eof-is-not-whitespace';
  if(definition.file==='server.cjs'&&['checked.field === undefined','result.opIndex === undefined'].includes(fragment)&&definition.replacement==='false')return'undefined-wire-members-are-omitted';
  if(definition.file==='server.cjs'&&fragment==='server.closeAllConnections();'&&definition.operator==='statement-delete')return'owned-socket-destruction-subsumes-native-close-all';
  return null;
}
const capture=(api,value)=>{
  try{return{value:api.resolveConfig(value)};}catch(error){return{error:{name:error.name,code:error.code,message:error.message,field:error.field}};}
};
async function prove(fact,definition,loader){
  const reference=createLoader(),text=originals.get(definition.file);let cases=0,domain;
  const pair=(left,right,label)=>{assert.deepEqual(left,right,label);cases++;};
  if(fact==='closed-data-module-strict-directive'){
    const ast=parser.parse('closed-codes',text),stack=[ast];let writes=0;
    while(stack.length){
      const node=stack.pop();assert.notEqual(node.type,'ThisExpression');assert.notEqual(node.type,'WithStatement');
      if(node.type==='CallExpression')assert.notEqual(node.callee.name,'eval');
      if(node.type==='AssignmentExpression'){assert.equal(text.slice(node.left.start,node.left.end),'module.exports');writes++;}
      for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)if(child&&typeof child.type==='string')stack.push(child);}
        else if(value&&typeof value.type==='string')stack.push(value);
    }
    assert.equal(writes,1);
    const a=reference.load('codes.cjs'),b=loader.load('codes.cjs');
    const shape=value=>{
      assert.notEqual(typeof value,'function','No callable escapes the finite data-only module');
      if(!value||typeof value!=='object')return value;
      assert.equal(Object.isFrozen(value),true);
      return Object.fromEntries(Reflect.ownKeys(value).map(key=>[String(key),shape(value[key])]));
    };
    pair(shape(b),shape(a),'Entire actual immutable finite export graph, including every status/message pair');
    domain='Entire closed no-input CODES module. Every reachable export is finite frozen data; the sole assignment is its writable module.exports binding, no this/with/eval exists, and all initialized values/own fields are compared. No callable escapes for strict caller reflection.';
  }else if(fact==='config-abrupt-snapshot-reclosed'){
    assert.match(text,/let copy;\s+try \{ copy = given === undefined \? Object\.create\(null\) : snapshot\(given\); \}\s+catch \{ return fail\(null\); \}\s+if \(!isCopy\(copy\)\) return fail\(null\);/);
    const factories=[()=>undefined,()=>({}),()=>null,()=>false,()=>1,()=>[],()=>new Date(0),()=>({keyEntries:4,entries:3,maxActive:2}),
      ()=>{const value={};value.cycle=value;return value;},
      ()=>Object.defineProperty({},'pool',{enumerable:true,get(){throw new Error('getter refuses');}}),
      ()=>new Proxy({},{ownKeys(){throw new Error('keys refuse');}}),
      ()=>new Proxy({},{getPrototypeOf(){throw new Error('prototype refuses');}})];
    for(let depth=0;depth<9;depth++)factories.push(()=>{let value={x:1};for(let n=0;n<depth;n++)value={unknown:value};return value;});
    const a=reference.load('config.cjs'),b=loader.load('config.cjs');
    for(const factory of factories)pair(capture(b,factory()),capture(a,factory()),'Both actual modules for snapshot success/abrupt completion');
    domain='All snapshot abrupt-completion paths leave the uninitialized local copy undefined: assignment never commits an RHS that throws. The unchanged immediate !isCopy(copy) route throws the identical fail(null), with no observable operation between. Actual cycles/getters/prototype/keys/depth/nominal controls are paired.';
  }else if(fact==='private-field-check-falsy-completion'){
    assert.match(text,/function checkFields[\s\S]+return null;\s+\}/);
    assert.equal((text.match(/checkFields\(/g)||[]).length,3,'Declaration plus exactly the two closed callers');
    assert.equal((text.match(/const refused = checkFields\(/g)||[]).length,2);
    assert.equal((text.match(/if \(refused\) return refused;/g)||[]).length,2);
    const a=reference.load('contract.js'),b=loader.load('contract.js');
    for(const units of [-1,0,1,2,49,50,51])for(const tier of ['standard','burst','bad'])for(const extra of [{},{owner:'other'},{cap:0},{unknown:1}]){
      const body={key:'paired-field-key',tier,units,...extra};
      pair(b.validateBody('reserve',body),a.validateBody('reserve',body),'Full current schema result, not private null/undefined identity');
      pair(b.validateBody('batch',{ops:[{op:'reserve',...body}]}),a.validateBody('batch',{ops:[{op:'reserve',...body}]}));
    }
    domain='checkFields is private, not exported, with exactly two callers. Its normal null and implicit undefined are consumed only by identical truthiness tests; all actual failure objects and value validation paths stay unchanged. Every bounded endpoint/tier/claim/server/unknown-field class is paired.';
  }else if(fact==='page-json-abrupt-assignment-keeps-null'){
    assert.match(text,/let body = null;\s+try \{ body = JSON\.parse\(text\); \} catch \{ body = null; \}/);
    let raw='',status=200;
    const fetch=async()=>({status,text:async()=>raw}),a=await page(reference,fetch),b=await page(loader,fetch);
    for(const code of [200,400,404,500]){
      status=code;
      for(const value of ['',',','{','[','undefined','null','false','true','0','""','{}','[]','{"x":1}','{"x":1,"x":2}','"\u0000"']){
        raw=value;pair(neutral(await b.helpers.ask('fixture','/v1/me')),neutral(await a.helpers.ask('fixture','/v1/me')));
      }
    }
    domain='All JSON.parse abrupt completions leave body at its explicit null initializer, because an RHS throw does not assign. The catch contains only redundant body=null and cannot change any other state. Both actual ask functions are paired over malformed/primitive/duplicate-key/normal wire text and every status class.';
  }else if(fact==='undefined-wire-members-are-omitted'){
    const property=text.slice(definition.start,definition.end).startsWith('checked.')?'field':'opIndex';
    assert.ok(text.includes(property+' === undefined ? {} : { '+property+': '));
    for(const value of [undefined,null,false,true,0,1,-1,'closed-field',[],{}]){
      const before={outcome:'REFUSED',...(value===undefined?{}:{[property]:value})},after={outcome:'REFUSED',[property]:value};
      pair(JSON.stringify(after),JSON.stringify(before),'Actual ECMAScript JSON bytes for every distinct undefined/nonundefined serialization class');
    }
    const {flow}=require('./u069-server-probes.cjs');pair(await flow(loader),await flow(reference),'Actual current service route/effect wire observations');
    domain='The only changed object member is field/opIndex: when undefined, standard JSON.stringify omits it; otherwise both branches construct the identical value. The source sends that object only through its pinned JSON responder. Actual full current route/refusal/effect observations are also paired.';
  }else if(['wire-string-parser-has-only-local-stop-refusals','primitive-string-eof-is-not-whitespace','owned-socket-destruction-subsumes-native-close-all'].includes(fact)){
    const label=fact==='owned-socket-destruction-subsumes-native-close-all'?'statement deleted @246:5':definition.label;
    const witness=await old.prove(fact,{...definition,label},loader);
    const control=await old.prove(fact,{...definition,label},reference);
    pair(witness,control,'Both actual source-bound executions complete the own specific semantic domain');
    domain=witness.domain+' The returned proof observations are additionally paired on this exact AST transformation, not inherited as a current verdict.';
  }else throw new Error('No current specific proof for '+fact);
  assert.ok(cases>0);
  return{fact,domain,cases,assertedPairs:cases,pristineSourceSha256:definition.sourceSha256,counterfactualSha256:definition.mutantSha256};
}
module.exports={identify,prove};
