'use strict';
const {expected,counts}=require('./u073-flood-workload.cjs');
const {CODES}=require('../codes.cjs');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function problems(observation,{cohort,sockets}={}){
  const found=new Set(),add=name=>found.add(name);
  if(!object(observation)||observation.schema!=='C011-owned-flood-observation/1'||!Array.isArray(observation.slots))return['SERVER_OBSERVATION_REQUIRED'];
  if(observation.cohort!==cohort)add('COHORT_MISMATCH');
  if(!Number.isSafeInteger(sockets)||sockets<1||sockets>128)return['EXPECTED_COHORT_INVALID'];
  if(observation.slots.length!==sockets||new Set(observation.slots.map(slot=>slot?.slot)).size!==sockets)add('SOCKET_COHORT_MISMATCH');
  if(observation.closed!==sockets||observation.barrier?.serverCohortClosed!==sockets||observation.barrier?.openCohort!==0||observation.barrier?.settled!==true)add('SERVER_CLOSE_BARRIER_REQUIRED');
  if(!Array.isArray(observation.errors)||observation.errors.length)add('SERVER_OBSERVATION_ERROR');
  const statuses={};let actualFrames=0,actualRequests=0,terminalWrites=0;
  for(let slot=0;slot<sockets;slot++){
    const row=observation.slots.find(entry=>entry?.slot===slot),plan=expected(slot);
    if(!row){add('SOCKET_COHORT_MISMATCH');continue;}
    if(row.closed!==true)add('SERVER_CLOSE_BARRIER_REQUIRED');
    const required=[...(plan.precedingPublicGet?[{method:'GET',url:'/scope.json',version:'1.1'}]:[]),{method:plan.method,url:plan.url,version:'1.1'}];
    if(!Array.isArray(row.requests)||!same(row.requests.map(request=>({method:request.method,url:request.url,version:request.version})),required))add('REQUEST_COHORT_MISMATCH');
    actualRequests+=Array.isArray(row.requests)?row.requests.length:0;
    if(!Array.isArray(row.frames)||row.frames.length!==required.length){add('RESPONSE_COHORT_MISMATCH');continue;}
    for(let index=0;index<row.frames.length;index++){
      const frame=row.frames[index];actualFrames++;statuses[frame.status]=(statuses[frame.status]||0)+1;
      if(frame.finished!==true)add('SERVER_FINISH_REQUIRED');
      if(plan.precedingPublicGet&&index===0){
        if(frame.status!==200||!object(frame.body)||frame.body.cardId!=='C011'||frame.body.businessData!=='synthetic')add('PUBLIC_GET_RESPONSE_MISMATCH');
        continue;
      }
      terminalWrites++;
      if(frame.status!==plan.status)add('TYPED_STATUS_MISMATCH');
      if(!object(frame.body)||!same(Object.keys(frame.body).sort(),['error','ignoredClaims','outcome'])
        ||frame.body.outcome!==plan.code||!object(frame.body.error)
        ||!same(Object.keys(frame.body.error).sort(),['code','message'])
        ||frame.body.error.code!==plan.code||frame.body.error.message!==CODES[plan.code][1]
        ||!same(frame.body.ignoredClaims,[]))add('TYPED_BODY_MISMATCH');
      if(frame.headers?.connection!=='close'||!/^application\/json;\s*charset=utf-8$/i.test(frame.headers?.['content-type']||''))add('TYPED_HEADERS_MISMATCH');
    }
  }
  const bound=counts(sockets);
  if(actualRequests!==bound.requests)add('REQUEST_COHORT_MISMATCH');
  if(actualFrames!==bound.requests||terminalWrites!==sockets)add('RESPONSE_COHORT_MISMATCH');
  if(!same(Object.entries(statuses).sort(),Object.entries(bound.statuses).sort()))add('TYPED_STATUS_COHORT_MISMATCH');
  return[...found];
}
function facts(observation){
  const statuses={};let frames=0,typedTerminal=0;
  for(const slot of observation?.slots||[])for(const frame of slot.frames||[]){
    frames++;statuses[frame.status]=(statuses[frame.status]||0)+1;if(frame.status>=400&&frame.body?.error?.code)typedTerminal++;
  }
  return{actualServerFrames:frames,actualTypedTerminalWrites:typedTerminal,statuses};
}
module.exports={problems,facts};
