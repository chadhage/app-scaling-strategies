'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {problems}=require('./u073-flood-oracle.cjs');
const {startChildTarget}=require('./targets.cjs');
const {call}=require('./helpers.cjs');
const {CODES}=require('../codes.cjs');
const TYPES=[
  [401,'AUTHENTICATION_REQUIRED'],[401,'AUTHENTICATION_REQUIRED'],[405,'METHOD_NOT_ALLOWED'],[404,'NOT_FOUND'],
  [414,'URL_TOO_LONG'],[401,'AUTHENTICATION_REQUIRED'],[401,'AUTHENTICATION_REQUIRED'],[421,'LOCAL_HOST_REQUIRED']
];
const REQUESTS=[['GET','/v1/me'],['POST','/v1/reservations'],['PUT','/v1/reservations'],['GET','/nope'],
  ['GET','/'+'a'.repeat(2100)],['GET','/v1/reservations?x=1'],['POST','/v1/reservations/rsv-ffffffffffffffff/release'],['GET','/']];
function synthetic(){
  const slots=Array.from({length:30},(_,slot)=>({slot,closed:true,requests:[
    ...(slot%2?[{method:'GET',url:'/scope.json',version:'1.1'}]:[]),
    {method:REQUESTS[slot%8][0],url:REQUESTS[slot%8][1],version:'1.1'}
  ],frames:[
    ...(slot%2?[{status:200,kind:'scope',finished:true,body:{cardId:'C011',businessData:'synthetic'}}]:[]),
    {status:TYPES[slot%8][0],kind:'refusal',finished:true,headers:{connection:'close','content-type':'application/json; charset=utf-8'},
      body:{outcome:TYPES[slot%8][1],error:{code:TYPES[slot%8][1],message:CODES[TYPES[slot%8][1]][1]},ignoredClaims:[]}}
  ]}));
  return{schema:'C011-owned-flood-observation/1',cohort:'unit-cohort',closed:30,slots,errors:[],
    barrier:{serverCohortClosed:30,openCohort:0,settled:true},clientAnswers:0,fixture:'SYNTHETIC ORACLE UNIT INPUT, not actual server proof'};
}
test('U073 a zero client receipt count with complete actual-shape server writes is not itself a failure',()=>{
  assert.deepEqual(problems(synthetic(),{cohort:'unit-cohort',sockets:30}),[]);
});
for(const [name,alter,expected] of [
  ['missing server observations',value=>{delete value.slots;},'SERVER_OBSERVATION_REQUIRED'],
  ['silent closed server',value=>{for(const slot of value.slots)slot.frames=[];},'RESPONSE_COHORT_MISMATCH'],
  ['wrong typed status',value=>{value.slots[0].frames[0].status=200;},'TYPED_STATUS_MISMATCH'],
  ['wrong typed body',value=>{value.slots[0].frames[0].body.outcome='ok';},'TYPED_BODY_MISMATCH'],
  ['wrong cohort',value=>{value.cohort='different-cohort';},'COHORT_MISMATCH'],
  ['a lost required socket row',value=>{value.slots.pop();},'SOCKET_COHORT_MISMATCH']
])test('U073 deterministic server oracle rejects '+name+' by a named assertion',()=>{
  const value=synthetic();alter(value);
  assert.ok(problems(value,{cohort:'unit-cohort',sockets:30}).includes(expected),expected);
});
test('U073 the real owned child exposes actual server response observations, not inferred client counts',async()=>{
  const child=await startChildTarget('default');
  try{
    await child.stats({flood:{cohort:'one-real-owned-socket',sockets:1}});
    const answer=await call(child,null,'GET','/v1/me',undefined,{'X-C011-Flood-Cohort':'one-real-owned-socket','X-C011-Flood-Slot':'0'});
    assert.equal(answer.status,401);
    let stats;
    for(let n=0;n<100;n++){stats=await child.stats();if(stats.connections===0)break;await new Promise(resolve=>setImmediate(resolve));}
    assert.equal(stats.connections,0);
    assert.ok(stats.floodObservation,'actual server observation field is required; closure/client receipt is not a substitute');
    assert.deepEqual(problems(stats.floodObservation,{cohort:'one-real-owned-socket',sockets:1}),[]);
  }finally{await child.close();}
});
