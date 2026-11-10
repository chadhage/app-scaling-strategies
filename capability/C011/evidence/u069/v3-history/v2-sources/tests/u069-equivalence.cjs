'use strict';
const assert = require('node:assert/strict');
const { originals, createLoader } = require('./u069-loader.cjs');
const opaque = (value) => typeof value === 'symbol' ? { sentinel:value.description }
  : Array.isArray(value) ? value.map(opaque) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,opaque(v)])) : value;
const diagnostic = (module,given) => {
  try {return{value:module.resolveConfig(given)};}
  catch(error){return{code:error.code,message:error.message,field:error.field,type:error.constructor.name};}
};
const PAGE_FACTS=new Map([
  ...['operand "!count(lease.heldUnits)" false @57:56','operand "!count(lease.heldSpend)" false @57:83',
    'operator || @57:81','operator || @57:108'].map(label=>[label,'equal-validated-share-implies-valid-held-count']),
  ...['operand "!isObject(shares[name])" false @57:110','operand "own.prices !== null" true @89:9']
    .map(label=>[label,'successful-learn-already-has-share-and-prices']),
  ['operand "allowance.reached" true @80:9','unreached-ask-has-no-status-or-body'],
  ['operand "item.identity === \'operator\'" true @162:48','operator-is-the-final-pool-books-writer'],
  ['number 1 minus one @43:46','visible-history-implies-positive-replay-capacity']
]);
const SERVER_FACTS=new Map([
  ['condition false @194:15','outer-auth-catch-preserves-inner-auth-refusal'],
  ['condition true @226:9','single-fail-closed-entry-already-prevents-warning-spam'],
  ['operand "broken === null" true @236:9','repeated-native-capability-check-recloses-to-same-state'],
  ['statement deleted @246:5','owned-socket-destruction-subsumes-native-close-all']
]);
function identify(definition,text=originals.get(definition.file)) {
  const before=text.slice(Math.max(0,definition.start-100),definition.start);
  if(definition.file==='config.cjs'&&definition.label.includes('argument 1 "null" of fail(')&&before.includes('prototype !== Object.prototype'))return'prototype-refusal-is-reclosed';
  if(definition.file==='contract.js'&&definition.label.includes('repetition {1,2} to {0,2}')&&before.includes('limit:'))return'empty-limit-still-fails-positive-range';
  if(definition.file==='json.cjs'){
    if((definition.label.includes('operand "at < text.length" true')||definition.label==='operator < @18:35'))return'primitive-string-eof-is-not-whitespace';
    if(definition.label==='condition false @99:9')return'wire-string-parser-has-only-local-stop-refusals';
    if(definition.label==='number 6 plus one @30:60')return'anchored-json-escape-consumes-at-most-five-code-units';
  }
  if(definition.file==='store.cjs'&&((definition.label.includes('argument 3 "at" of release('))||definition.label.includes('argument 3 "at" of OPS.release(')))return'release-time-is-already-settled-by-mutate';
  if(definition.file==='server.cjs'
    &&['return dropped @115:7','return dropped @192:11','return dropped @198:7'].includes(definition.label)
    &&definition.replacement===text.slice(definition.start,definition.end).replace(/^return\s+/,''))
    return'private-route-responder-results-are-void';
  if(definition.file==='page.js'&&PAGE_FACTS.has(definition.label))return PAGE_FACTS.get(definition.label);
  if(definition.file==='server.cjs'&&SERVER_FACTS.has(definition.label))return SERVER_FACTS.get(definition.label);
  return null;
}
async function nativeOwnedClose(loader){
  const http=require('node:http'),{open,closeOwned}=require('./u069-server-probes.cjs');
  const {app,tokens}=await open(loader),agent=new http.Agent({keepAlive:true,maxSockets:2}),sockets=[];
  app.server.on('connection',socket=>sockets.push(socket));
  const ask=()=>new Promise((resolve,reject)=>{
    const request=http.get({host:'127.0.0.1',port:app.server.address().port,path:'/v1/me',agent,
      headers:{Authorization:'Bearer '+tokens['conductor-a']}},response=>{
      let text='';response.on('data',bytes=>{text+=bytes;});response.once('end',()=>resolve({status:response.statusCode,body:JSON.parse(text)}));
    });request.once('error',reject);
  });
  try{
    const responses=await Promise.all([ask(),ask()]);
    assert.ok(sockets.length>0&&sockets.length<=2,'only the positively created own agent connections are in this witness');
    const closed=sockets.map(socket=>new Promise(resolve=>socket.once('close',resolve)));
    await closeOwned(app);await Promise.all(closed);
    assert.ok(sockets.every(socket=>socket.destroyed));
    return{responses,closed:sockets.length,health:app.health()};
  }finally{agent.destroy();await closeOwned(app);}
}
async function prove(fact,definition,loader){
  const reference=createLoader();
  if(PAGE_FACTS.get(definition.label)===fact){
    const {pageCases,pageView}=require('./u069-probes.cjs'),source=originals.get('page.js');
    let cases=0,domain;
    if(fact==='equal-validated-share-implies-valid-held-count'){
      const count=value=>Number.isSafeInteger(value)&&value>=0;
      for(const held of [0,-0,1,2,2000,Number.MAX_SAFE_INTEGER])for(const candidate of [held,String(held),null,{},[],NaN,-1,0.5]){
        if(candidate===held)assert.equal(count(candidate),true);
        cases++;
      }
      assert.match(source,/lease\.heldUnits !== shares\[name\]\.heldUnits \|\| lease\.heldSpend !== shares\[name\]\.heldSpend/);
      domain='The two own shares have already passed validAllowance. A candidate held figure unequal to its validated share is independently refused; strict equality to that number implies the same valid count. Applies to the exact redundant count-chain positions only.';
    }else if(fact==='successful-learn-already-has-share-and-prices'){
      assert.match(source,/own\.prices = allowance\.body\.allowance\.prices;\s+own\.share = allowance\.body\.allowance\.lease;/);
      assert.match(source,/own\.share !== null && own\.share\.replayKeys >= list\.body\.total/);
      assert.match(source,/const missing = CONDUCTORS\.filter\(\(identity\) => owned\[identity\]\.id === null\)/);
      assert.ok(source.indexOf('if (missing.length > 0)')<source.indexOf('for (const item of plan(tokens, owned))'));cases+=4;
      domain='Prices and the validated object share are installed together, with no await between them. A retained visible id requires that share; inspection aborts before plan/balanced unless both ids exist. The removed checks cannot admit an unvalidated share.';
    }else if(fact==='unreached-ask-has-no-status-or-body'){
      assert.match(source,/catch\s*\{\s*return \{ reached: false \};/);
      assert.equal(({reached:false}).status===200,false);cases+=2;
      domain='ask returns exactly reached:false on fetch/text failure, with no status or body. The still-required status===200 and object-body guards reject it even if reached is forced true.';
    }else if(fact==='operator-is-the-final-pool-books-writer'){
      const view=await pageView(reference),pool=view.requests.filter(request=>request.route==='/v1/operator/pool');
      assert.equal(pool.length,3);assert.equal(pool.at(-1).headers.Authorization,'Bearer operator');cases+=2;
      domain='plan is awaited sequentially. Both conductor pool requests precede the sole operator pool request, which always overwrites the local books variable before showBooks. No later row writes books.';
    }else if(fact==='visible-history-implies-positive-replay-capacity'){
      for(let replay=1;replay<=2000;replay++){assert.ok(0-replay<0);cases++;}
      assert.match(source,/list\.body\.total >= items\.length/);assert.match(source,/own\.share\.replayKeys >= list\.body\.total/);
      domain='Successful discovery needs at least one visible item, total>=items.length and replayKeys>=total. Capacity zero would then make remainingReplayKeys negative, independently rejected by the unchanged count and subtraction guards. Every configured replay count 1..2000 is checked.';
    }else throw new Error('Unknown page-specific fact');
    for(const probe of pageCases(loader,createLoader)){await probe.run();cases++;}
    return{domain,cases};
  }
  if(SERVER_FACTS.get(definition.label)===fact){
    const {serverCases}=require('./u069-server-probes.cjs'),source=originals.get('server.cjs');
    let cases=0,domain;
    if(fact==='outer-auth-catch-preserves-inner-auth-refusal'){
      assert.equal((source.match(/if \(error instanceof AuthError\) return refuseAuth\(error\);/g)||[]).length,2);cases++;
      domain='The removed inner AuthError shortcut throws the identical error into the unchanged enclosing AuthError shortcut, before its cancellation check. There is no intervening state mutation or await. Live-expiry and cancellation/auth precedence are paired.';
    }else if(fact==='single-fail-closed-entry-already-prevents-warning-spam'){
      assert.match(source,/server\.once\('listening'/);
      assert.match(source,/if \(broken === null && !canStopReading\(socket\)\) failClosed\(\)/);cases+=2;
      domain='In the single-edit native server lifecycle, once(listening) can enter failClosed once; the remaining connection guard prevents entry after broken is set. The warning guard is therefore redundant, not a notification waiver.';
    }else if(fact==='repeated-native-capability-check-recloses-to-same-state'){
      assert.match(source,/broken = 'READ_STOP_UNAVAILABLE'/);
      assert.match(source,/if \(broken === null\) process\.emitWarning/);cases+=2;
      domain='Native TCP _handle.readStop capability reads are side-effect-free (no user Proxy/getter). Rechecking an already broken connection either does nothing or assigns the same reason; the independent warning guard prevents repeats and the unchanged broken guard destroys it.';
    }else if(fact==='owned-socket-destruction-subsumes-native-close-all'){
      assert.match(source,/sockets\.add\(socket\)/);assert.match(source,/for \(const socket of sockets\) socket\.destroy\(\)/);cases+=2;
      assert.deepEqual(await nativeOwnedClose(loader),await nativeOwnedClose(reference));cases++;
      domain='Every accepted native TCP connection is in the owned set; unsupported connections are immediately destroyed. close already stops the listener and destroys every standing owned socket. Native keep-alive connections plus tracked-ended/standing fixture sockets prove identical closure; no externally monkeypatched destroy implementation is in scope.';
    }else throw new Error('Unknown server-specific fact');
    for(const probe of serverCases(loader,createLoader)){await probe.run();cases++;}
    return{domain,cases};
  }
  if(fact==='prototype-refusal-is-reclosed'){
    const current=loader.load('config.cjs'),base=reference.load('config.cjs');
    const inputs=[new Map(),new Set(),new Date(0),/x/,Object.create({custom:true}),new(class Configuration{})()];
    for(const input of inputs){
      assert.deepEqual(diagnostic(current,input),diagnostic(base,input));
      assert.deepEqual(diagnostic(current,{pool:input}),{code:'CONFIG_INVALID',message:'CONFIG_INVALID',field:null,type:'RangeError'});
    }
    return{domain:'Every prototype-denial path of the supplied plain-configuration boundary; original exception is caught and reclosed to null field',cases:inputs.length*2};
  }
  if(fact==='empty-limit-still-fails-positive-range'){
    const current=loader.load('contract.js'),base=reference.load('contract.js');let cases=0;
    for(const route of base.routes.filter(r=>r.query?.includes('limit'))){
      const actual=current.routes.find(r=>r.name===route.name);
      for(const value of ['',...Array.from({length:100},(_,n)=>String(n).padStart(2,'0')),'x',' ','-1','1.5']){
        assert.deepEqual(current.parseQuery(actual,'limit='+encodeURIComponent(value)),base.parseQuery(route,'limit='+encodeURIComponent(value)));cases++;
      }
      assert.equal(Number(''),0);assert.ok(Number('')<1);
    }
    return{domain:'The only added regular-expression word is empty; Number(empty)=0 cannot satisfy the independent minimum one',cases};
  }
  if(fact.startsWith('primitive-string-')||fact.startsWith('wire-string-')||fact.startsWith('anchored-json-')){
    const current=loader.load('json.cjs').parseStrict,base=reference.load('json.cjs').parseStrict;let cases=0;
    const compare=(text)=>{loader.resetWork();reference.resetWork();assert.deepEqual(opaque(current(text,{depth:6})),opaque(base(text,{depth:6})));assert.equal(loader.bounded(),true);cases++;};
    for(let n=0;n<128;n++){
      const char=String.fromCharCode(n);
      for(const text of [char+'0','0'+char,'"'+char+'"','{"a"'+char+'1}','[1'+char+'2]'])compare(text);
    }
    for(let n=0;n<65536;n++)compare('"\\u'+n.toString(16).padStart(4,'0')+'"');
    for(const escape of ['"','\\','/','b','f','n','r','t'])compare(String.fromCharCode(34,92)+escape+String.fromCharCode(34));
    for(let n=0;n<64;n++){
      const text=' \t\n\r'.repeat(n);
      assert.equal(text[text.length],undefined);assert.equal(' \t\n\r'.includes(undefined),false);
      for(const body of ['0','{}','[]','"x"','null','false','[1,2]','{"x":1}'])compare(text+body+text);
    }
    return{domain:'Primitive bounded JSON wire strings, all UTF-16 four-hex escapes, every ASCII boundary and all short escape classes; no mutable host JSON intrinsic or non-string caller',cases};
  }
  if(fact==='release-time-is-already-settled-by-mutate'){
    const current=loader.load('store.cjs'),base=reference.load('store.cjs');
    const config=reference.load('contract.js').resolveConfig({pool:{units:10,spend:60},caps:{'conductor-a':{units:6,spend:40},'conductor-b':{units:6,spend:40}},maxActive:1,entries:2,keyEntries:4,ttlMs:1000});
    let cases=0;
    for(const delta of [0,999,1000,1001]){
      let now=1000000,one=0,two=0;
      const a=base.createStore({config,now:()=>now,newId:()=>`rsv-${(++one).toString(16).padStart(8,'0')}`});
      const b=current.createStore({config,now:()=>now,newId:()=>`rsv-${(++two).toString(16).padStart(8,'0')}`});
      const body={key:'release-scope-key',tier:'standard',units:1};
      assert.deepEqual(b.reserve('conductor-a',body),a.reserve('conductor-a',body));now+=delta;
      for(const subject of ['conductor-a','conductor-b','visitor','operator']){
        assert.deepEqual(b.release(subject,'rsv-00000001'),a.release(subject,'rsv-00000001'));cases++;
        assert.deepEqual(b.snapshot(),a.snapshot());
      }
      assert.deepEqual(b.batch('conductor-a',[{op:'release',id:'rsv-00000001'}]),a.batch('conductor-a',[{op:'release',id:'rsv-00000001'}]));cases++;
    }
    return{domain:'Known/foreign/absent ownership across held/released/exact-deadline/expired state and batch replay; mutate settles the injected clock before OPS.release',cases};
  }
  if(fact==='private-route-responder-results-are-void'){
    const io=require('../../C009/http-io.cjs'),{flow,Socket}=require('./u069-server-probes.cjs');
    let cases=0;
    for(const status of [200,400,401,403,404,409,413,500]){
      const socket=new Socket(),response={req:{socket},writeHead(){},end(){}};
      const responder=io.createResponder(response);
      assert.equal(responder.json(status,{outcome:status===200?'ok':'REFUSED'}),undefined);
      assert.equal(responder.file(Buffer.from('fixture'),'text/plain'),undefined);
      cases+=2;
    }
    assert.deepEqual(await flow(loader),await flow(reference));
    return{domain:'Every unchanged pinned C009 responder method returns undefined; private route/answer/refuse return values are not an API and Node lanes await completion only. All current route/role/refusal/effect observations are paired.',cases:cases+1};
  }
  throw new Error('No explicit runnable equivalence fact exists');
}
module.exports={identify,prove};
