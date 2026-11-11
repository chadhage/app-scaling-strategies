'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net');
const {createLoader}=require('./u074-loader.cjs'),{open,request,turns,closeOwned}=require('./u069-server-probes.cjs');
function pureExtraCases(file,loader){
  if(file==='contract.js')return[{name:'real key/id predicate rejects every non-string coercion without touching an attacker getter',
    run(){
      const api=loader.load(file);
      for(const[name,valid]of [['isId','rsv-00000001'],['isKey','valid-key-0001']]){
        let reads=0;
        const values=[null,undefined,true,false,0,1,[],[valid],new String(valid),{toString(){reads++;return valid;}},
          {[Symbol.toPrimitive](){reads++;throw new Error('attacker coercion');}}];
        for(const value of values){
          let result;assert.doesNotThrow(()=>{result=api[name](value);},name+' is total on invalid non-string values');
          assert.equal(result,false,name+' never coerces a non-string into a valid identifier');
        }
        assert.equal(reads,0,'The primitive type guard does not touch untrusted conversion hooks');
      }
    }}];
  if(file==='store.cjs')return[{name:'real direct store read selects exactly the requested own id, never a first own record or another lease id',
    run(){
      const api=loader.load(file),contract=loader.load('contract.js');
      let n=0;const store=api.createStore({config:contract.resolveConfig(),now:()=>1000,newId:()=> 'rsv-'+(++n).toString(16).padStart(8,'0')});
      const a=store.reserve('conductor-a',{key:'own-first-key',tier:'standard',units:1});
      const b=store.reserve('conductor-b',{key:'other-first-key',tier:'standard',units:1});
      const a2=store.reserve('conductor-a',{key:'own-second-key',tier:'standard',units:2});
      assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(a2.ok,true);
      assert.equal(store.read('conductor-a',b.value.reservation.id).ok,false);
      assert.equal(store.read('conductor-a','rsv-ffffffff').ok,false);
      assert.equal(store.read('conductor-a',a2.value.reservation.id).value.reservation.id,a2.value.reservation.id);
      assert.equal(store.read('conductor-a',a.value.reservation.id).value.reservation.id,a.value.reservation.id);
      assert.equal(store.has('conductor-a',b.value.reservation.id),false);
      assert.equal(store.has('conductor-a','rsv-ffffffff'),false);
      assert.equal(store.release('conductor-a',b.value.reservation.id).ok,false);
      assert.equal(store.release('conductor-a','rsv-ffffffff').ok,false);
      assert.equal(store.release('conductor-a',a2.value.reservation.id).ok,true);
      assert.equal(store.read('conductor-a',a.value.reservation.id).value.reservation.state,'reserved');
      assert.equal(store.read('conductor-b',b.value.reservation.id).value.reservation.state,'reserved');
    }}];
  return[];
}
async function realMissingHost(loader){
  const {app}=await open(loader);
  let socket;
  try{
    const raw=await new Promise((resolve,reject)=>{
      const chunks=[];socket=net.connect({host:'127.0.0.1',port:app.server.address().port});
      socket.on('error',reject);socket.on('data',bytes=>chunks.push(bytes));socket.once('close',()=>resolve(Buffer.concat(chunks).toString()));
      socket.once('connect',()=>socket.write('GET /v1/me HTTP/1.1\r\nConnection: close\r\n\r\n'));
      socket.setTimeout(30000,()=>socket.destroy(Object.assign(new Error('bounded real socket control NONPASS'),{code:'ETIMEDOUT'})));
    });
    const at=raw.indexOf('\r\n\r\n');let body;
    try{body=JSON.parse(raw.slice(at+4));}catch{body={nonJson:raw.slice(at+4)};}
    return{status:/^HTTP\/1\.[01] (\d+)/.exec(raw)?.[1],body,connection:/\r\nconnection:\s*close/i.test(raw)};
  }finally{socket?.destroy();await closeOwned(app);}
}
function serverExtraCases(loader){
  return[
    {name:'repeated release keeps its actual audited replay outcome; every audited mutation exposes exact private before/after figures',
      async run(){
        const {app,tokens}=await open(loader);
        const ask=async(...args)=>{const value=request(app,tokens,...args);await turns();return value;};
        try{
          await ask('conductor-a','POST','/v1/reservations',{key:'audit-release-key',tier:'standard',units:1});
          await ask('conductor-a','POST','/v1/reservations/rsv-00000001/release');
          await ask('conductor-a','POST','/v1/reservations/rsv-00000001/release');
          const own=app.auditLog().filter(row=>row.route==='reservation.release');
          assert.equal(own.at(-1).outcome,'replayed','The source explicitly records replayed release, not released twice');
          assert.equal(own.at(-1).unitsBefore,own.at(-1).unitsAfter);assert.equal(own.at(-1).spendBefore,own.at(-1).spendAfter);
        }finally{await closeOwned(app);}
      }},
    {name:'a supplied closed role-table override really changes its declared read permission, not an ignored option',
      async run(){
        const roleTable={...require('../contract.js').roleTable,'operator.pool':{roles:['visitor']}};
        const {app,tokens}=await open(loader,{roleTable});
        try{
          const visitor=request(app,tokens,'visitor','GET','/v1/operator/pool');await turns();
          const operator=request(app,tokens,'operator','GET','/v1/operator/pool');await turns();
          assert.equal(visitor.response.statusCode,200);assert.equal(operator.response.statusCode,403);
        }finally{await closeOwned(app);}
      }},
    {name:'the real Node HTTP parser and the application agree with the source-exact no-Host response, not merely a synthetic request emit',
      async run(){assert.deepEqual(await realMissingHost(loader),await realMissingHost(createLoader()));}}
  ];
}
module.exports={pureExtraCases,serverExtraCases,realMissingHost};
