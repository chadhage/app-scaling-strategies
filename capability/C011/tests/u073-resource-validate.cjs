'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {problems:typedProblems,facts:typedFacts}=require('./u073-flood-oracle.cjs');
const MB=1024*1024;
const expected={flood:1,'flood-pending':1,burst:2,'pipeline-process-a':3,'pipeline-process-b':2,'pipeline-process-c':3};
function summary(text){
  return Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>{
    const match=new RegExp('^# '+key+' (\\d+)$','m').exec(text);return[key,match?Number(match[1]):-1];
  }));
}
function validate(leaf,directory,pid,out,code,signal,timedOut){
  const problems=[],add=text=>problems.push(text),s=summary(out);
  if(code!==0||signal||timedOut)add('LEAF_EXIT_SIGNAL_OR_TIMEOUT_NONPASS');
  if(s.tests!==expected[leaf]||s.pass!==s.tests||['fail','cancelled','skipped','todo'].some(key=>s[key]!==0))add('ACTUAL_PUBLIC_NAMED_CASE_CENSUS_FAILED');
  const jsonFiles=fs.readdirSync(directory).filter(name=>name.endsWith('.json'));
  const reports=jsonFiles.map(name=>JSON.parse(fs.readFileSync(path.join(directory,name))));
  const starts=reports.filter(report=>report.schema==='U073-current-resource-observation/1'&&report.endedAtUtc===undefined);
  const ends=reports.filter(report=>report.schema==='U073-current-resource-observation/1'&&report.endedAtUtc);
  const main=ends.find(report=>report.pid===pid);
  if(!main)add('MAIN_OBSERVATION_NOT_RECORDED');
  for(const entry of starts){
    const cap=entry.role==='attacker.cjs'?40*MB:entry.role==='child-server.cjs'?80*MB:100*MB;
    if(!(entry.heapLimit>0&&entry.heapLimit<=cap))add('ACTUAL_HEAP_LIMIT_NOT_CAPPED:'+entry.role);
  }
  if(main){
    if(main.observationOverflow)add('OBSERVATION_BOUND_EXCEEDED');
    if(main.pendingClientFallbacks!==0)add('CLIENT_TIMER_DESTROY_IS_NOT_SERVER_CLOSE');
    if(main.watchdogKills!==0)add('PUBLIC_CHILD_WATCHDOG_NONPASS');
    for(const child of main.children){
      if(!child.closed)add('OWN_CHILD_NOT_CLOSED:'+child.pid);
      if(child.code!==0){
        const ownClose=child.killCalls.some(call=>call.stack.includes('targets.cjs')&&!call.stack.includes('Timeout._onTimeout'));
        if(!(child.signal&&ownClose))add('CHILD_EXCEPTION_OR_UNEXPECTED_SIGNAL_NONPASS:'+child.pid);
      }
    }
  }
  let resource=null;
  if(leaf==='flood'&&main){
    const target=mode=>main.children.find(child=>child.kind==='fork'&&child.args[2]===mode);
    const service=target('service'),reference=target('bare'),naive=target('naive');
    if(!service||!reference||!naive)add('THREE_SAME_RUN_SEPARATE_SERVER_CONTROLS_MISSING');
    else{
      const attacker=server=>ends.find(entry=>entry.role==='attacker.cjs'&&Number(entry.argv[1])===server.port);
      const actual=attacker(service),bare=attacker(reference),bad=attacker(naive);
      for(const entry of [actual,bare])if(!entry||entry.attacker?.closed!==30||entry.attacker?.timedOut!==false)add('POSITIVE_FLOOD_SERVER_CLOSURE_NONPASS');
      if(!bad||bad.attacker?.timedOut!==true||bad.attacker?.closed>=30||!(bad.attacker?.burstsAfterAnswer>0))add('NAIVE_CONTROL_STRUCTURAL_NONPASS_NOT_OBSERVED');
      const cpu=item=>(item.lastStats?.cpuMicros-item.secondStats?.cpuMicros)/30;
      if(![service,reference].every(item=>item.statsCount>=2&&item.lastStats?.connections===0&&item.lastStats?.heapUsed<32*MB))add('FLOOD_CPU_HEAP_QUIESCENCE_COUNTERS_MISSING');
      if(!(cpu(service)>=0&&cpu(reference)>=0&&cpu(service)<=10*cpu(reference)+20000))add('RELATIVE_SAME_RUN_CPU_BOUND_NONPASS');
      if(!(service.lastStats?.bytesRead<=2*reference.lastStats?.bytesRead+30*65536))add('REFUSAL_READ_COUNTER_BOUND_NONPASS');
      const observation=service.lastStats?.floodObservation;
      const causalProblems=typedProblems(observation,{cohort:actual?.attacker?.cohort,sockets:30});
      if(causalProblems.length)add('SAME_FLOOD_ACTUAL_SERVER_TYPED_COHORT_NONPASS:'+causalProblems.join(','));
      const noEffect=observation&&JSON.stringify(observation.booksBefore)===JSON.stringify(observation.booksAfter);
      if(!noEffect)add('SAME_FLOOD_REAL_BOOKS_EFFECT_NONPASS');
      resource={socketsPerControl:30,serviceClosed:actual?.attacker?.closed,referenceClosed:bare?.attacker?.closed,
        naiveClosed:bad?.attacker?.closed,naiveControlTimedOut:true,naiveControlOutcome:'NONPASS by sockets-not-closed and continued sending; never timeout kill credit',
        cpuMicrosPerSocket:{service:cpu(service),reference:cpu(reference)},heapUsed:service.lastStats?.heapUsed,
        bytesRead:service.lastStats?.bytesRead,referenceBytesRead:reference.lastStats?.bytesRead,
        realSeparateServerPids:[service.pid,reference.pid,naive.pid],typedServer:typedFacts(observation),
        actualServerBarrier:observation?.barrier,causalProblems,noEffect,
        clientRepliesDiagnosticOnly:actual?.attacker?.answered};
    }
  }
  if(leaf==='flood-pending'&&main){
    const child=main.children.find(child=>child.kind==='fork'&&child.args[2]==='hold');
    if(!child||child.lastStats?.connections!==0||!(child.lastStats?.heapUsed<32*MB))add('PENDING_CAPPED_HEAP_OR_QUIESCENCE_NONPASS');
    const pool=main.responses.find(response=>response.route==='/v1/operator/pool')?.pool;
    const lists=main.responses.filter(response=>response.method==='GET'&&response.route==='/v1/reservations');
    if(!pool||pool.reservedUnits!==1||pool.reservedSpend!==4||lists.length!==2||!lists.every(response=>response.items===0))add('PENDING_REAL_OTHER_CONNECTION_NO_EFFECT_PROOF_MISSING');
    resource={sockets:3,requestInputBound:50000,serverHeapOldSpaceMB:48,heapUsed:child?.lastStats?.heapUsed,connections:child?.lastStats?.connections,
      actualClientFallbacks:main.pendingClientFallbacks,realSeparateServerPid:child?.pid,afterPool:pool,ownListCounts:lists.map(item=>item.items)};
  }
  if(leaf==='burst'&&main){
    if(main.responses.filter(response=>response.status===200&&response.route==='/v1/me').length!==2)add('BURST_POST_CAP_POSITIVE_CONTROL_MISSING');
    if(main.children.filter(child=>child.kind==='fork'&&child.args[1]==='cap').length!==2)add('TWO_REAL_128_SOCKET_BURST_SERVERS_MISSING');
    resource={shapes:2,socketsEach:128,serverHeapOldSpaceMB:64,legitimatePostBurstAnswers:main.responses.map(entry=>entry.status)};
  }
  const matrices=main?.matrices||[];
  if(leaf.startsWith('pipeline-process')){
    if(matrices.length!==expected[leaf]||matrices.some(matrix=>matrix.cells<=0||matrix.problems!==0))add('REQUIRED_ACTUAL_MATRIX_CELL_CENSUS_NONPASS');
    if(!main.children.some(child=>child.kind==='fork'))add('REAL_SEPARATE_MATRIX_SERVER_MISSING');
  }
  const assertionDirectory=path.join(path.dirname(directory),'assertions');
  const observations=fs.existsSync(assertionDirectory)?fs.readdirSync(assertionDirectory).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(fs.readFileSync(path.join(assertionDirectory,name)))):[];
  const counted={tests:observations.reduce((n,r)=>n+r.tests,0),assertions:observations.reduce((n,r)=>n+r.assertions,0),zeroAssertionTests:observations.flatMap(r=>r.zeroAssertionTests)};
  if(counted.tests!==s.tests||counted.assertions<=0||counted.zeroAssertionTests.length)add('ACTUAL_ASSERTION_OBSERVATION_NONPASS');
  return{leaf,summary:s,passed:problems.length===0,problems,assertions:counted,resource,matrices,
    separateChildren:main?.children.length||0,heapCappedProcesses:starts.length,cpu:main?.cpu,mainMemory:main?.memory};
}
module.exports={validate,summary,expected};
