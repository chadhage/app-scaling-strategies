'use strict';
const assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),{test}=require('node:test');
const {startChildTarget}=require('./targets.cjs'),{runAttack}=require('./u073-attack.cjs');
const {problems,facts}=require('./u073-flood-oracle.cjs'),{counts}=require('./u073-flood-workload.cjs');
async function observe(mode,{sockets=8,retention='retain'}={}){
  const child=await startChildTarget('default',{mode,watchdogMs:90000}),cohort='u73-control-'+randomBytes(8).toString('hex');
  try{
    await child.stats({flood:{cohort,sockets}});
    const report=await runAttack(child.port,sockets,mode==='naive'?250:30000,cohort,retention);
    let stats;
    for(let n=0;n<20000;n++){
      stats=await child.stats();
      if(stats.connections===0)break;
      await new Promise(resolve=>setImmediate(resolve));
    }
    assert.equal(stats.connections,0,'owned control is quiescent, not judged by a fixed delay');
    assert.notEqual(child.pid,process.pid);assert.notEqual(report.attackerPid,process.pid);assert.notEqual(report.attackerPid,child.pid);
    return{mode,cohort,report,stats,serverPid:child.pid};
  }finally{await child.close();}
}
test('U073 exact original30 workload contains45 requests:15public GETs and30terminal refusals with independently declared cohorts',()=>{
  assert.deepEqual(counts(30),{sockets:30,requests:45,terminalRefusals:30,precedingPublicGets:15,
    statuses:{200:15,401:15,404:4,405:4,414:4,421:3}});
});
test('U073 real typed server writes qualify when the client deliberately retains zero answers, without assuming any delivered byte count',async t=>{
  const run=await observe('service',{retention:'discard'});
  assert.equal(run.report.closed,8);assert.equal(run.report.timedOut,false);assert.equal(run.report.answered,0);
  assert.ok(run.report.sockets.every(socket=>socket.retainedStatuses.length===0));
  assert.deepEqual(problems(run.stats.floodObservation,{cohort:run.cohort,sockets:8}),[]);
  assert.equal(facts(run.stats.floodObservation).actualServerFrames,12);
  assert.equal(facts(run.stats.floodObservation).actualTypedTerminalWrites,8);
  assert.deepEqual(run.stats.floodObservation.booksAfter,run.stats.floodObservation.booksBefore);
  t.diagnostic(JSON.stringify({mode:run.mode,retention:'explicit application discard, not a claim about OS delivery',
    clientRetained:0,actualServer:facts(run.stats.floodObservation),barrier:run.stats.floodObservation.barrier,
    realServerPid:run.serverPid,realAttackerPid:run.report.attackerPid}));
});
for(const mode of ['missing-observation','silent','wrong','bare','naive']){
  test('U073 real owned '+mode+' control is rejected by the server-evidence oracle, never promoted from closed sockets',async t=>{
    const run=await observe(mode);
    const rejected=problems(run.stats.floodObservation,{cohort:run.cohort,sockets:8});
    assert.ok(rejected.length>0,'negative control must fail its actual typed-server requirement');
    if(mode==='missing-observation')assert.ok(rejected.includes('SERVER_OBSERVATION_REQUIRED'));
    if(mode==='silent')assert.equal(facts(run.stats.floodObservation).actualServerFrames,0);
    if(mode==='wrong')assert.ok(rejected.includes('TYPED_STATUS_MISMATCH'));
    if(mode==='naive'){assert.equal(run.report.closed,0);assert.equal(run.report.timedOut,true);}
    t.diagnostic(JSON.stringify({mode,oracleOutcome:'NONPASS',issues:rejected,server:facts(run.stats.floodObservation),
      clientClosedBeforeControlCutoff:run.report.closed,timedOutControlNonpass:run.report.timedOut,killCredit:false}));
  });
}
