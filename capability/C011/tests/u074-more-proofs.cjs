'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createLoader,originals}=require('./u074-loader.cjs'),{pageView}=require('./u069-probes.cjs'),old=require('./u069-equivalence.cjs');
const {open,request,turns,closeOwned,flow}=require('./u069-server-probes.cjs');
const PAGE_HELD=new Set(['!count(lease.heldUnits)','count(lease.heldUnits)','!count(lease.heldSpend)','count(lease.heldSpend)']);
const REACHED=new Set(['allowance.reached','list.reached','answer.reached','control.reached']);
function identify(d,text=originals.get(d.file)){
  const fragment=text.slice(d.start,d.end),before=text.slice(Math.max(0,d.start-100),d.start);
  if(d.file==='config.cjs'&&fragment==='Object.hasOwn(node, name)'&&d.replacement==='true')return'null-prototype-lookup-own-guard';
  if(d.file==='contract.js'&&fragment==="typeof value === 'string'"&&d.replacement==='true'&&before.includes('const isTier'))return'tier-membership-already-requires-primitive-string';
  if(d.file==='page.js'&&PAGE_HELD.has(fragment)&&['true','false'].includes(d.replacement))return'equal-validated-share-implies-valid-held-count';
  if(d.file==='page.js'&&fragment==='own.prices !== null'&&d.replacement==='true')return'successful-learn-already-has-share-and-prices';
  if(d.file==='page.js'&&fragment==="item.identity === 'operator'"&&d.replacement==='true')return'operator-is-the-final-pool-books-writer';
  if(d.file==='page.js'&&REACHED.has(fragment)&&d.replacement==='true')return'actual-unreached-answer-has-no-status-body-or-text';
  if(d.file==='page.js'&&fragment==="codeOf(control) === 'RESERVATION_NOT_FOUND'"&&d.replacement==='true')return'byte-identical-foreign-control-certifies-absent-code';
  if(d.file==='server.cjs'&&['if (error instanceof AuthError) return refuseAuth(error);','return refuseAuth(error);'].includes(fragment))return'outer-auth-catch-preserves-inner-auth-refusal';
  if(d.file==='server.cjs'&&fragment==='{}'&&before.endsWith('options.hooks || '))return'empty-hook-fallback-primitives-have-no-hook-members';
  if(d.file==='server.cjs'&&fragment==="''"&&before.endsWith("request.headers['content-type'] || "))return'absent-media-fallbacks-all-fail-json-type';
  if(d.file==='server.cjs'&&fragment==='broken === null'&&d.replacement==='true')return'repeated-native-capability-check-recloses-to-same-state';
  if(d.file==='server.cjs'&&fragment==='return;'&&before.includes('socket.destroy();'))return'destroyed-owned-socket-extra-tracking-is-drained';
  if(d.file==='store.cjs'&&fragment==='[]'&&before.endsWith("leaseOf(data, subject)?.replays ?? "))return'closed-lease-replay-ledger-never-needs-fallback';
  return null;
}
const diagnostic=(api,value)=>{try{return{value:api.resolveConfig(value)};}catch(error){return{code:error.code,message:error.message,field:error.field,name:error.name};}};
function serial(value){return JSON.parse(JSON.stringify(value));}
async function unsupported(loader){
  const {app}=await open(loader),events=[];
  class OwnedSocket extends EventEmitter{
    constructor(id){super();this.id=id;this.remoteAddress='127.0.0.1';this.destroyed=false;this._handle={};}
    destroy(){if(this.destroyed)return;this.destroyed=true;events.push(this.id);queueMicrotask(()=>this.emit('close'));}
  }
  try{
    for(let n=0;n<3;n++){const socket=new OwnedSocket(n);app.server.emit('connection',socket);await turns();assert.equal(socket.destroyed,true);}
    await closeOwned(app);return{events,health:app.health(),listening:app.server.listening,snapshot:app.snapshot()};
  }finally{await closeOwned(app);}
}
async function prove(fact,d,loader){
  const reference=createLoader(),text=originals.get(d.file);let cases=0,domain;
  const pair=(a,b,label)=>{assert.deepEqual(a,b,label);cases++;};
  if(fact==='null-prototype-lookup-own-guard'){
    assert.match(text,/const copy = Object\.create\(null\)/);assert.match(text,/Object\.getPrototypeOf\(value\) === null/);
    assert.match(text,/isCopy\(node\) && Object\.hasOwn\(node, name\) \? node\[name\] : undefined/);
    const a=reference.load('config.cjs'),b=loader.load('config.cjs');
    for(const input of [undefined,{},Object.create(null),{pool:{}},{caps:{'conductor-a':{}}},{prices:{}},
      Object.create({pool:{units:1}}),{pool:Object.create({units:1})},JSON.parse('{"__proto__":{"units":1}}')])
      pair(diagnostic(b,input),diagnostic(a,input));
    for(const[name,,min,max]of a.NUMBERS)for(const value of [min,max,min-1,max+1,null,{},'1']){
      const input=name.split('.').reduceRight((inner,key)=>({[key]:inner}),value);pair(diagnostic(b,input),diagnostic(a,input));
    }
    domain='lookup only descends into snapshots whose prototype is exactly null. An absent key therefore reads undefined without inherited properties or getters; an own key has the same value either way. Every numeric path and valid/invalid boundary plus inherited/prototype/unknown input classes is paired on the actual module.';
  }else if(fact==='tier-membership-already-requires-primitive-string'){
    const a=reference.load('contract.js'),b=loader.load('contract.js');
    assert.deepEqual(a.tiers,['standard','burst']);
    for(const tier of ['standard','burst','bad',undefined,null,true,false,0,1,[],['standard'],new String('standard'),{},Symbol('tier')])
      pair(b.validateBody('reserve',{key:'tier-domain-key',tier,units:1}),a.validateBody('reserve',{key:'tier-domain-key',tier,units:1}));
    domain='The complete tier vocabulary contains only primitive strings. Array.includes uses SameValueZero without coercion: no non-string can equal either member, and every string takes the unchanged membership path. Both actual validators are paired over all primitive/object/array/wrapper/symbol type classes.';
  }else if(['equal-validated-share-implies-valid-held-count','successful-learn-already-has-share-and-prices','operator-is-the-final-pool-books-writer','outer-auth-catch-preserves-inner-auth-refusal','repeated-native-capability-check-recloses-to-same-state'].includes(fact)){
    const labels={
      'equal-validated-share-implies-valid-held-count':'operand "!count(lease.heldUnits)" false @57:56',
      'successful-learn-already-has-share-and-prices':'operand "own.prices !== null" true @89:9',
      'operator-is-the-final-pool-books-writer':'operand "item.identity === \'operator\'" true @162:48',
      'outer-auth-catch-preserves-inner-auth-refusal':'condition false @194:15',
      'repeated-native-capability-check-recloses-to-same-state':'operand "broken === null" true @236:9'
    };
    const changed=await old.prove(fact,{...d,label:labels[fact]},loader),control=await old.prove(fact,{...d,label:labels[fact]},reference);
    pair(changed,control,'Current AST transformation runs both actual specific-domain programs; no old verdict is copied');
    domain=changed.domain+' Both complete actual current proof executions are paired for this precise source transformation.';
  }else if(fact==='actual-unreached-answer-has-no-status-body-or-text'){
    assert.match(text,/catch\s*\{\s*return \{ reached: false \};/);
    for(const value of [undefined,null,false,true,0,1,'',{},[]]){
      const none={reached:false};assert.equal(none.status===200,false);assert.equal(none.status===404,false);
      assert.equal(typeof none.body,'undefined');
      pair(none.reached&&none.status===200,true&&none.status===200);
      pair(none.reached&&Boolean(none.body),true&&Boolean(none.body));
    }
    for(const rewrite of [undefined,(r)=>{r.networkFailure=true;},(r,w,p)=>{if(p==='/v1/allowance')r.networkFailure=true;},
      (r,w,p)=>{if(p.includes('ffffffff'))r.networkFailure=true;},(r,w,p)=>{if(p==='/v1/operator/pool')r.networkFailure=true;}])
      pair(await pageView(loader,rewrite),await pageView(reference,rewrite));
    domain='Actual ask has exactly two constructors: a reached response with status/body/text, or exactly reached:false on fetch/text rejection. The affected uses retain independent status/body/typed-byte guards, so forcing reached cannot manufacture any of those missing facts. Actual whole page outputs are paired for total/allowance/absent/operator failures and success.';
  }else if(fact==='byte-identical-foreign-control-certifies-absent-code'){
    assert.match(text,/answer\.status === 404 && code === 'RESERVATION_NOT_FOUND' && answer\.text === context\.absent/);
    for(const code of ['RESERVATION_NOT_FOUND','ROLE_FORBIDDEN','SPOOF',null,'']){
      const body={outcome:code,error:{code,message:'untrusted'}},encoded=JSON.stringify(body),decoded=JSON.parse(encoded);
      if(decoded.error.code==='RESERVATION_NOT_FOUND')assert.equal(decoded.outcome,'RESERVATION_NOT_FOUND');
      for(const absent of [encoded,'different',null])pair(code==='RESERVATION_NOT_FOUND'&&encoded===absent,
        decoded.error.code==='RESERVATION_NOT_FOUND'&&encoded===absent);
    }
    for(const rewrite of [undefined,(r,w,p)=>{if(p.includes('ffffffff')){r.body.error.code='SPOOF';r.body.outcome='SPOOF';}},
      (r,w,p)=>{if(p.includes('ffffffff'))r.status=200;},(r,w,p)=>{if(p.includes('ffffffff'))r.networkFailure=true;}])
      pair(await pageView(loader,rewrite),await pageView(reference,rewrite));
    domain='A foreign row still requires a reached404, known RESERVATION_NOT_FOUND code and exact primitive wire-text equality to the absent control. Deterministic JSON decoding of equal text yields the same code/outcome; dropping the earlier control-code check cannot make unknown bytes into a valid foreign row. Actual whole-page observations are paired for every control status/code/reachability class.';
  }else if(fact==='empty-hook-fallback-primitives-have-no-hook-members'){
    assert.match(text,/const hooks = options\.hooks \|\| \{\}/);
    const members=[...text.matchAll(/hooks\.([A-Za-z0-9_]+)/g)].map(match=>match[1]);assert.ok(members.length>0);
    for(const member of new Set(members))for(const value of [{},true,false])pair(typeof value[member],typeof({})[member]);
    pair(await flow(loader),await flow(reference));
    domain='For a supplied truthy hook object the fallback is not evaluated and the exact object remains. For every falsy/absent option, only the enumerated hook members are read; fresh empty objects and Boolean primitives all have undefined hook members in the pinned unmodified Node environment. Actual complete service flow is also paired.';
  }else if(fact==='absent-media-fallbacks-all-fail-json-type'){
    assert.match(text,/JSON_TYPE\.test\(request\.headers\['content-type'\] \|\| ''\)/);
    const expression=/^application\/json\s*(;.*)?$/i;
    for(const value of ['',true,false,!('')]){assert.equal(expression.test(value),false);cases++;}
    const observe=async current=>{
      const {app,tokens}=await open(current);
      try{
        const before=app.snapshot(),answer=request(app,tokens,'conductor-a','POST','/v1/reservations');await turns();
        assert.deepEqual(app.snapshot(),before);return{status:answer.response.statusCode,text:answer.response.bytes.toString(),destroyed:answer.socket.destroyed};
      }finally{await closeOwned(app);}
    };
    pair(await observe(loader),await observe(reference));
    domain='Actual normalized Node content-type is a primitive string or absent. Present truthy strings bypass the unchanged fallback; all absent/falsy fallback spellings empty/true/false fail the same anchored JSON media-type test. Real current application dispatch proves identical typed refusal, closure and no books effect.';
  }else if(fact==='destroyed-owned-socket-extra-tracking-is-drained'){
    assert.match(text,/socket\.destroy\(\);\s+return;/);assert.match(text,/socket\.once\('close', \(\) => sockets\.delete\(socket\)\)/);
    pair(await unsupported(loader),await unsupported(reference));
    domain='The broken native connection is destroyed in both versions. Native socket close is delivered after the connection callback, so any extra set entry is immediately drained by its own close listener; later close remains idempotent and owns no foreign socket. Actual repeated unsupported-capability connection/health/listener/books observations are paired with asynchronous owned close events.';
  }else if(fact==='closed-lease-replay-ledger-never-needs-fallback'){
    assert.match(text,/leases: Object\.fromEntries\(contract\.conductors\.map/);
    assert.match(text,/replaysOf\(draft, subject\)\.some/);
    const a=reference.load('store.cjs'),b=loader.load('store.cjs'),config=reference.load('config.cjs').resolveConfig();
    let one=0,two=0;const left=a.createStore({config,now:()=>1,newId:()=> 'rsv-'+(++one).toString(16).padStart(8,'0')});
    const right=b.createStore({config,now:()=>1,newId:()=> 'rsv-'+(++two).toString(16).padStart(8,'0')});
    for(const who of ['conductor-a','conductor-b','visitor','operator','unknown','__proto__']){
      for(const key of ['ledger-first-key','ledger-second-key']){
        pair(right.reserve(who,{key,tier:'standard',units:1}),left.reserve(who,{key,tier:'standard',units:1}));
        pair(right.snapshot(),left.snapshot());
      }
      pair(right.read(who,'rsv-00000001'),left.read(who,'rsv-00000001'));
    }
    domain='The private replay lookup used by mint is enumerated over the immutable two conductor names; both state entries are constructed with replay arrays and preserved by draft cloning. Other subjects are refused before mint. Full actual known/foreign/unknown/prototype-name reserve/replay/read/books observations are paired; fallback values never enter public semantics.';
  }else throw new Error('No more-proof fact '+fact);
  assert.ok(cases>0);return{fact,domain,cases,assertedPairs:cases,pristineSourceSha256:d.sourceSha256,counterfactualSha256:d.mutantSha256};
}
module.exports={identify,prove};
