'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process'),{gzipSync}=require('node:zlib');
const {sha,verify,make}=require('./u073-resource-source.cjs'),{validate}=require('./u073-resource-validate.cjs');
const namespace=path.resolve(__dirname,'..'),candidate=path.resolve(namespace,'..','..');
const output=process.env.U073_RESOURCE_OUTPUT,release=process.env.U073_STRESS_RELEASE,repo=process.env.C011_GIT_REPOSITORY;
const deadline=Date.parse(process.env.U073_CAPTURE_DEADLINE);
assert.ok(Number.isFinite(deadline)&&deadline>Date.now(),'An explicit bounded invocation deadline is required');
const own=value=>typeof value==='string'&&path.isAbsolute(value)&&path.relative(path.join(candidate,'private'),value)!==''
  &&!path.relative(path.join(candidate,'private'),value).startsWith('..');
assert.ok(own(output)&&own(release)&&repo&&path.isAbsolute(repo),'Explicit owned resource output and actual parent release notice are required');
assert.equal(fs.existsSync(output),false);
const permission=JSON.parse(fs.readFileSync(release));
assert.equal(permission.parentActuallyReleasedC014StressLane,true,'No resource admission by inference or fallback');
assert.ok(permission.actualParentNotice&&permission.receivedAtUtc);
const directory=path.join(path.dirname(output),'resource64-originals');
assert.equal(fs.existsSync(directory),false);fs.mkdirSync(directory);
const bindings=path.join(directory,'module-bindings.json'),snapshot=make(repo,bindings);
const leaves=['flood','flood-pending','burst','pipeline-process-a','pipeline-process-b','pipeline-process-c'];
const active=new Set(),phases=[],groups=[],rounds=[],allNative=[],GB=1024**3;
let emergency=null,minFree=os.freemem();
function nativeRoots(workers){
  const ids=workers.map(worker=>worker.child.pid),filter=ids.map(id=>'ProcessId='+id).join(' OR ');
  const script="$ErrorActionPreference='Stop';@(Get-CimInstance Win32_Process -Filter '"+filter+"' | ForEach-Object { @{pid=$_.ProcessId;ppid=$_.ParentProcessId;creationUtc=$_.CreationDate.ToUniversalTime().ToString('o');workingSet=[long]$_.WorkingSetSize} }) | ConvertTo-Json -Compress";
  const rows=JSON.parse(execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],
    {windowsHide:true,timeout:60000,maxBuffer:1024*1024}).toString());
  for(const worker of workers)worker.nativeIdentity=rows.find(row=>row.pid===worker.child.pid);
  assert.deepEqual(rows.map(row=>row.pid).sort((a,b)=>a-b),ids.sort((a,b)=>a-b),'All eight actual owned roots have native creation identities');
  allNative.push(...rows);return rows;
}
function stopOwned(worker,reason){
  if(!active.has(worker)||worker.stopping)return;worker.stopping=true;
  const identity=worker.nativeIdentity;
  if(!identity){worker.child.kill();return;}
  const script="$ErrorActionPreference='Stop';$r=Get-CimInstance Win32_Process -Filter 'ProcessId="+identity.pid+"';"+
    "if($r -and $r.CreationDate.ToUniversalTime().ToString('o') -eq '"+identity.creationUtc+"'){"+
    "$all=[Collections.Generic.List[object]]::new();$all.Add($r);for($i=0;$i -lt $all.Count;$i++){"+
    "foreach($c in @(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$all[$i].ProcessId))){$all.Add($c)}};"+
    "for($i=$all.Count-1;$i -ge 0;$i--){$o=$all[$i];$now=Get-CimInstance Win32_Process -Filter ('ProcessId='+$o.ProcessId);"+
    "if($now -and $now.CreationDate -eq $o.CreationDate){Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue}}}";
  try{execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});}
  catch(error){worker.cleanupFailure=String(error.message);}
  worker.stopReason=reason;
}
const memory=setInterval(()=>{
  minFree=Math.min(minFree,os.freemem());
  if(os.freemem()<384*1024*1024){emergency='SHARED_FREE_MEMORY_BELOW_EMERGENCY_RESERVE';for(const worker of active)stopOwned(worker,emergency);}
},1000);
async function safeMemory(leaf){
  const needed=(leaf==='flood'?3.75:2)*GB;
  while(os.freemem()<needed){
    if(Date.now()>deadline)throw new Error('REQUIRED_EIGHT_WAY_QUEUED_UNSAFE_MEMORY');
    console.log('U073_EIGHT_WAY_QUEUED '+JSON.stringify({leaf,free:os.freemem(),needed}));
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
}
function start(group,leaf){
  const target=path.join(directory,'g'+String(group.job).padStart(2,'0'),leaf);fs.mkdirSync(target,{recursive:true});
  const observer=path.join(target,'observer'),assertions=path.join(target,'assertions');fs.mkdirSync(observer);fs.mkdirSync(assertions);
  const env={...process.env,NODE_OPTIONS:'--max-old-space-size=64 --max-semi-space-size=4 --require '+path.join(__dirname,'u073-resource-observe.cjs'),
    C011_ACCEPT_SOURCE:bindings,C011_ACCEPT_OBSERVER_DIR:observer,C011_ACCEPT_LEAF:leaf,C011_ASSERTION_DIR:assertions};
  for(const key of ['NODE_V8_COVERAGE','NODE_TEST_CONTEXT','C011_MATRIX_ONLY','C011_SUBJECT_DIR','CAPTURE_BROWSER_EVIDENCE'])delete env[key];
  const args=['--max-old-space-size=64','--max-semi-space-size=4','--require',path.join(__dirname,'assertions-preload.cjs'),
    path.join(__dirname,'u073-resource-entry.cjs'),path.join(__dirname,leaf+'.test.cjs')];
  const child=spawn(process.execPath,args,{cwd:target,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  const worker={child};active.add(worker);
  const chunks={stdout:[],stderr:[]},lengths={stdout:0,stderr:0};let timedOut=false,overflow=false,readyResolve,readyReject;
  worker.ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  child.on('message',message=>{if(message?.type==='owned-leaf-ready'){assert.equal(message.pid,child.pid);readyResolve(message);}});
  for(const name of ['stdout','stderr'])child[name].on('data',bytes=>{
    lengths[name]+=bytes.length;
    if(lengths[name]>16*1024*1024){overflow=true;stopOwned(worker,'RAW_OUTPUT_BOUND_NONPASS');return;}
    chunks[name].push(Buffer.from(bytes));
  });
  const watchdog=setTimeout(()=>{timedOut=true;stopOwned(worker,'WATCHDOG_NONPASS');},240000);
  worker.done=new Promise(resolve=>{
    child.once('error',readyReject);
    child.once('close',(code,signal)=>{
      clearTimeout(watchdog);active.delete(worker);readyReject(new Error('Leaf exited before required start barrier'));
      const streams={};
      for(const name of ['stdout','stderr']){
        const bytes=Buffer.concat(chunks[name]),compressed=gzipSync(bytes),file=path.join(target,name+'.original.raw.gz');
        fs.writeFileSync(file,compressed,{flag:'wx'});
        streams[name]={path:path.relative(path.dirname(output),file),bytes:bytes.length,sha256:sha(bytes),gzipSha256:sha(compressed),kind:'exact original raw bytes'};
      }
      let checked;
      try{checked=validate(leaf,observer,child.pid,Buffer.concat(chunks.stdout).toString(),code,signal,timedOut);}
      catch(error){checked={leaf,passed:false,problems:['OBSERVATION_EXCEPTION_NONPASS:'+error.message],summary:{tests:0,pass:0,fail:1,cancelled:0,skipped:0,todo:0}};}
      if(overflow||worker.cleanupFailure){checked.passed=false;checked.problems.push(overflow?'RAW_OUTPUT_BOUND_NONPASS':'OWN_CLEANUP_EXCEPTION_NONPASS');}
      const result={...checked,pid:child.pid,nativeIdentity:worker.nativeIdentity,code,signal,timedOut,argv:args,
        stopReason:worker.stopReason||null,streams,heapFlags:{oldSpaceMB:64,semiSpaceMB:4}};
      fs.writeFileSync(path.join(target,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});group.leaves.push(result);resolve(result);
    });
  });
  return worker;
}
(async()=>{
  let failure=null;
  try{
    for(let round=1;round<=8;round++){
      const batch=Array.from({length:8},(_,column)=>({job:(round-1)*8+column+1,round,column:column+1,leaves:[]}));
      groups.push(...batch);
      for(const leaf of leaves){
        if(Date.now()>deadline)throw new Error('NO_NEW_PHASE_WITHOUT_DEADLINE_BUDGET');
        verify(snapshot);await safeMemory(leaf);const workers=batch.map(group=>start(group,leaf));
        try{
          const roots=nativeRoots(workers),ready=await Promise.all(workers.map(worker=>worker.ready));
          assert.equal(ready.length,8);assert.ok(ready.every(entry=>entry.heapLimit<=84*1024*1024));
          phases.push({round,leaf,requiredConcurrency:8,readyCount:8,nativeOwnedRoots:roots,freeAtStart:os.freemem(),releasedTogetherAtUtc:new Date().toISOString()});
          for(const worker of workers)worker.child.send({type:'start-required-eight-way'});
          const results=await Promise.all(workers.map(worker=>worker.done));
          console.log('U073_RESOURCE_PHASE '+JSON.stringify({round,leaf,executed:results.length,passed:results.filter(result=>result.passed).length}));
        }finally{for(const worker of workers)stopOwned(worker,'PHASE_FINALLY_NONPASS');await Promise.all(workers.map(worker=>worker.done));}
        if(emergency)throw new Error(emergency);
      }
      verify(snapshot);rounds.push({round,complete:batch.every(group=>group.leaves.length===6),passed:batch.every(group=>group.leaves.every(leaf=>leaf.passed))});
      if(!rounds.at(-1).passed)break;
    }
  }catch(error){failure={name:error.name,message:error.message};}
  finally{clearInterval(memory);for(const worker of active)stopOwned(worker,'LOOP_FINALLY_NONPASS');await Promise.all([...active].map(worker=>worker.done));}
  const failedLeaves=groups.flatMap(group=>group.leaves.filter(leaf=>!leaf.passed).map(leaf=>({job:group.job,leaf:leaf.leaf,problems:leaf.problems})));
  const report={schema:'U073-resource64/1',requiredTotal:64,concurrency:8,plannedRounds:8,cpuBurnersStarted:0,
    completedGroups:groups.filter(group=>group.leaves.length===6).length,
    passedGroups:groups.filter(group=>group.leaves.length===6&&group.leaves.every(leaf=>leaf.passed)).length,
    groups,phases,rounds,failedLeaves,failure,emergency,minSharedFreePhysical:minFree,nativeOwnedRoots:allNative,
    sourceFreezeSha256:snapshot.sourceFreezeSha256,actualParentStressRelease:permission,cleanup:{activeOwnedRoots:active.size},
    allOriginalFailuresPreserved:true,aggregateSummaryRole:'Sum of actual separate original Node leaf TAP censuses, not synthetic driver test callbacks'};
  report.passed=report.completedGroups===64&&report.passedGroups===64&&failedLeaves.length===0&&!failure&&!emergency&&active.size===0;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('U073_RESOURCE64 '+JSON.stringify({completedGroups:report.completedGroups,passedGroups:report.passedGroups,failedLeaves,failure,emergency}));
  assert.equal(report.passed,true,'All 64 total eight-way groups must genuinely pass; no timeout, exception or extra failure is erased');
})().catch(error=>{console.error(error);process.exitCode=1;});
