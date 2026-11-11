'use strict';
const assert=require('node:assert/strict');
const {createLoader}=require('./u074-loader.cjs');
const PRICES={version:'p1',standard:4,burst:8};
const LEASE={capUnits:6,capSpend:40,heldUnits:3,heldSpend:12,remainingUnits:3,remainingSpend:28,active:1,maxActive:3,
  replayKeys:1,maxReplayKeys:1000,remainingReplayKeys:999};
const RESERVATION={id:'rsv-00000001',tier:'standard',units:3,spend:12,state:'reserved',createdAtMs:1000000,deadlineMs:1300000};
const ALLOWANCE={allowance:{pool:{units:10,spend:60},lease:LEASE,prices:PRICES,ttlMs:300000}};
const OPERATOR={pool:{units:10,spend:60,reservedUnits:5,reservedSpend:28,freeUnits:5,freeSpend:32},leases:[
  {subject:'conductor-a',capUnits:6,capSpend:40,heldUnits:3,heldSpend:12,active:1},
  {subject:'conductor-b',capUnits:6,capSpend:40,heldUnits:2,heldSpend:16,active:1}]};
const SHARES={'conductor-a':LEASE,'conductor-b':{...LEASE,heldUnits:2,heldSpend:16,remainingUnits:4,remainingSpend:24}};
async function page(loader,fetch=async()=>({status:500,text:async()=> '{"outcome":"untrusted"}'})){
  const {createDocument,runPage}=loader.load('tests/dom-stub.cjs'),document=createDocument();
  const {context}=await runPage({document,fetch});
  assert.ok(context.__u074Helpers,'Actual unchanged page functions are observed inside the owned VM, not reimplemented');
  return{helpers:context.__u074Helpers,document,context};
}
function outcome(fn,args){
  try{return{value:neutral(fn(...args))};}catch(error){return{throws:error.name,code:error.code||null};}
}
function neutral(value){
  if(Array.isArray(value))return Array.from(value,neutral);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,neutral(item)]));
  return value;
}
function paths(value,prefix=[]){
  const result=[prefix];
  if(value&&typeof value==='object')for(const key of Object.keys(value))result.push(...paths(value[key],[...prefix,key]));
  return result;
}
function replace(value,location,replacement,remove=false){
  if(location.length===0)return replacement;
  const clone=structuredClone(value);let cursor=clone;
  for(const key of location.slice(0,-1))cursor=cursor[key];
  if(remove)delete cursor[location.at(-1)];else cursor[location.at(-1)]=replacement;
  return clone;
}
const BAD=[undefined,null,false,true,-1,-0,0,0.5,NaN,Infinity,'x','1','3',[],{},['rsv-00000001']];
function corpus(){
  const cases=[
    ['isObject',[{x:1}]],['count',[1]],
    ['validReservation',[RESERVATION,PRICES]],['validReservation',[RESERVATION,null]],['validAllowance',[ALLOWANCE]],['balanced',[OPERATOR,SHARES]],
    ['codeOf',[{reached:true,status:401,body:{outcome:'AUTHENTICATION_REQUIRED',error:{code:'AUTHENTICATION_REQUIRED',message:'untrusted'}},text:'untrusted'}]],
    ['shown',[{reached:true,status:200}]]
  ],rows=[];
  for(const[name,args]of cases)for(let argument=0;argument<args.length;argument++){
    for(const location of paths(args[argument])){
      for(const value of BAD){const changed=structuredClone(args);changed[argument]=replace(args[argument],location,value);
        rows.push({name,args:changed,label:name+' argument'+argument+'.'+location.join('.')+'='+String(value)});}
      if(location.length){const changed=structuredClone(args);changed[argument]=replace(args[argument],location,null,true);
        rows.push({name,args:changed,label:name+' missing '+location.join('.')});}
      const current=location.reduce((value,key)=>value[key],args[argument]);
      if(current&&typeof current==='object'&&!Array.isArray(current)){
        for(const[operation,value]of [['extra field',{...current,unexpected:7}],['reversed keys',Object.fromEntries(Object.entries(current).reverse())]]){
          const changed=structuredClone(args);changed[argument]=replace(args[argument],location,value);
          rows.push({name,args:changed,label:name+' '+operation+' '+location.join('.')});
        }
      }
    }
  }
  rows.push({name:'validReservation',args:[RESERVATION,null],label:'nullable reservation price comparison'});
  rows.push({name:'validAllowance',args:[{...ALLOWANCE,allowance:{...ALLOWANCE.allowance,lease:{...LEASE,maxReplayKeys:0,replayKeys:0,remainingReplayKeys:0}}}],
    label:'zero replay capacity with internally balanced zero counts'});
  rows.push({name:'codeOf',args:[{reached:true,status:403,body:{outcome:'SPOOF',error:{code:'SPOOF',message:'untrusted'}}}],label:'matching unknown typed code and outcome'});
  rows.push({name:'validAllowance',args:[{...ALLOWANCE,extra:'reserved'}],label:'untrusted reserved/free field content'});
  rows.push({name:'validAllowance',args:[{...ALLOWANCE,freeUnits:0}],label:'untrusted global-free field name'});
  return rows;
}
function pageExtraCases(loader){
  return[
    {name:'actual existing page function objects preserve their strict caller-introspection restriction',
      async run(){
        const actual=await page(loader);
        for(const name of ['balanced','judge','row','plan','showBooks']){
          assert.equal(typeof actual.helpers[name],'function');
          assert.throws(()=>actual.helpers[name].caller,error=>error.name==='TypeError',name+' strict calling semantics');
        }
      }},
    {name:'every actual pure page validator preserves the complete JSON-path/type/boundary/missing-field corpus',
      async run(){
        const changed=await page(loader),reference=await page(createLoader()),rows=corpus();
        for(const row of rows){
          assert.equal(typeof reference.helpers[row.name],'function');assert.equal(typeof changed.helpers[row.name],'function');
          assert.deepEqual(outcome(changed.helpers[row.name],row.args),outcome(reference.helpers[row.name],row.args),row.label);
        }
      }},
    {name:'page error and allowed/foreign/role outcomes validate every status/code/body field independently',
      async run(){
        const a=await page(loader),b=await page(createLoader());
        const shapes=[
          [{kind:'allowed',check:body=>body.subject==='visitor'&&body.role==='visitor'},{reached:true,status:200,body:{outcome:'ok',subject:'visitor',role:'visitor'}}],
          [{kind:'foreign'},{reached:true,status:404,body:{outcome:'RESERVATION_NOT_FOUND',error:{code:'RESERVATION_NOT_FOUND'}},text:'absent-fixed'}],
          [{kind:'denied',status:403,code:'ROLE_FORBIDDEN'},{reached:true,status:403,body:{outcome:'ROLE_FORBIDDEN',error:{code:'ROLE_FORBIDDEN'}}}]
        ];
        for(const[expected,answer]of shapes)for(const location of paths(answer))for(const value of BAD){
          const current=replace(answer,location,value),context={absent:'absent-fixed'};
          assert.deepEqual(outcome(a.helpers.judge,[expected,current,context]),outcome(b.helpers.judge,[expected,current,context]),'judge '+expected.kind+' '+location.join('.')+'='+String(value));
        }
      }},
    {name:'actual ask compares every malformed JSON, primitive body and network/text rejection without losing typed visible behavior',
      async run(){
        let text='',reject=false;
        const fetch=async()=>{if(reject)throw new Error('synthetic network refusal');return{status:200,text:async()=>text};};
        const a=await page(loader,fetch),b=await page(createLoader(),fetch);
        for(const value of ['',',','{','[','undefined','null','false','true','0','""','{}','[]','{"x":1}','{"x":1,"x":2}','"\u0000"']){
          text=value;assert.deepEqual(neutral(await a.helpers.ask('fixture','/v1/me')),neutral(await b.helpers.ask('fixture','/v1/me')),'actual text '+JSON.stringify(value));
        }
        reject=true;assert.deepEqual(neutral(await a.helpers.ask('fixture','/v1/me')),neutral(await b.helpers.ask('fixture','/v1/me')));
      }},
    {name:'actual plan checkers compare every reachable returned JSON field and role, including wrong-role correct-subject answers',
      async run(){
        const a=await page(loader),b=await page(createLoader()),tokens=Object.fromEntries(['visitor','conductor-a','conductor-b','operator'].map(name=>[name,name]));
        const own={'conductor-a':{id:'rsv-00000001',prices:PRICES,share:LEASE},'conductor-b':{id:'rsv-00000002',prices:PRICES,share:SHARES['conductor-b']}};
        const left=a.helpers.plan(tokens,own),right=b.helpers.plan(tokens,own);
        assert.equal(left.length,right.length);
        for(let index=0;index<right.length;index++){
          const current=left[index],reference=right[index];if(reference.expect.kind!=='allowed')continue;
          let body;
          if(reference.route==='/v1/me')body={outcome:'ok',subject:reference.identity,role:reference.identity.startsWith('conductor')?'conductor':reference.identity};
          else if(reference.route==='/v1/allowance')body={outcome:'ok',...ALLOWANCE};
          else if(reference.route.startsWith('/v1/reservations?'))body={outcome:'ok',total:1,items:[RESERVATION]};
          else if(reference.route.startsWith('/v1/reservations/'))body={outcome:'ok',reservation:{...RESERVATION,id:own[reference.identity]?.id||RESERVATION.id}};
          else if(reference.route==='/v1/operator/pool')body={outcome:'ok',...OPERATOR};
          else body={outcome:'ok',total:0,items:[]};
          assert.equal(typeof current.expect.check,'function');
          for(const location of paths(body))for(const value of BAD){
            const changed=replace(body,location,value);
            assert.deepEqual(outcome(current.expect.check,[changed]),outcome(reference.expect.check,[changed]),reference.identity+' '+reference.route+' '+location.join('.'));
          }
        }
      }},
    {name:'actual learned reservation discovery rejects null/nonarray/array-like/duplicate lists with consistent replay counters',
      async run(){
        let allowance=structuredClone(ALLOWANCE),list={total:1,items:[RESERVATION]},reject=false;
        const fetch=async route=>{if(reject)throw new Error('synthetic unavailable');return{status:200,text:async()=>JSON.stringify({outcome:'ok',...(route==='/v1/allowance'?allowance:list),ignoredClaims:[]})};};
        const a=await page(loader,fetch),b=await page(createLoader(),fetch);
        const observe=async fn=>{try{return{value:neutral(await fn('fixture'))};}catch(error){return{throws:error.name,code:error.code||null};}};
        for(const items of [null,undefined,{},'x',{length:1},{0:RESERVATION,length:1},[],[null],[RESERVATION,RESERVATION]]){
          list={total:Array.isArray(items)?items.length:1,items};
          allowance={...ALLOWANCE,allowance:{...ALLOWANCE.allowance,lease:{...LEASE,replayKeys:Math.max(1,list.total),remainingReplayKeys:1000-Math.max(1,list.total)}}};
          assert.deepEqual(await observe(a.helpers.learn),await observe(b.helpers.learn),'learn items '+JSON.stringify(items));
        }
        reject=true;assert.deepEqual(await observe(a.helpers.learn),await observe(b.helpers.learn),'learn unavailable wire data');
      }},
    {name:'actual books rendering preserves graceful null/unreached/non200/invalid body handling and all visible figures',
      async run(){
        const a=await page(loader),b=await page(createLoader());
        const render=(ctx,answer)=>{
          let error=null;try{ctx.helpers.showBooks(answer,SHARES);}catch(caught){error=caught.name;}
          return{error,books:[...ctx.document.elements].filter(([id])=>id.startsWith('books-')).map(([id,node])=>[id,node.textContent,node.attributes])};
        };
        for(const answer of [null,{reached:false},{reached:true,status:500,body:OPERATOR},{reached:true,status:200,body:null},{reached:true,status:200,body:OPERATOR}])
          assert.deepEqual(render(a,answer),render(b,answer),'books '+JSON.stringify(answer));
      }},
    {name:'a real pending inspection announces its progress before the first unresolved fetch; the gate, not elapsed time, proves it',
      async run(){
        let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
        const fetch=async()=>{entered=true;await gate;return{status:500,text:async()=> '{"outcome":"untrusted"}'};};
        const a=await page(loader,fetch),pending=a.helpers.inspect();
        try{await Promise.resolve();assert.equal(entered,true);assert.equal(a.document.getElementById('status').textContent,'Inspecting\u2026');}
        finally{release();await pending;}
      }}
  ];
}
module.exports={pageExtraCases,page,corpus,outcome,neutral};
