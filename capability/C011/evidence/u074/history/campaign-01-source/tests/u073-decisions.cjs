'use strict';
const {assertions,audit}=require('./u069-audit.cjs'),{summaryOf,sha}=require('./u073-verify.cjs');
const PRODUCTION=['codes.cjs','config.cjs','contract.js','json.cjs','page.js','server.cjs','store.cjs'];
const REQUIRED=['core','red-replay','controls','flood','coverage','browser','resource64','load80','fresh-lf','fresh-crlf','source-git','consumer']
  .map(name=>'U073-final-'+name);
function decide(verified){
  const problems=[],add=text=>problems.push(text),record=name=>verified.records.get(name);
  for(const name of REQUIRED){const value=record(name);if(!value||value.execution.exitCode!==0||value.execution.expectedExitCode!==0)add('CURRENT_CAPTURE_REQUIRED:'+name);}
  for(const name of [...REQUIRED,'U073-final-mutations']){
    const value=record(name);if(!value)continue;
    if(!(Date.parse(value.startedAtUtc)>=Date.parse(verified.freeze.frozenAtUtc)))add('CAPTURE_PRECEDES_FINAL_SOURCE_FREEZE:'+name);
    const sources=value.inputs.filter(input=>input.subject.scope==='C011'&&!input.subject.path.startsWith('evidence/')).map(input=>input.subject.path).sort();
    if(JSON.stringify(sources)!==JSON.stringify(verified.freeze.files.map(entry=>entry.path).sort()))add('CURRENT_CAPTURE_SOURCE_SET_DIFFERS:'+name);
  }
  const green=(name,count)=>{
    const value=record(name),s=value?.summary;
    if(!s||s.tests<=0||s.pass!==s.tests||count!==undefined&&s.tests!==count
      ||['fail','cancelled','skipped','todo'].some(key=>s[key]!==0))add('CURRENT_GREEN_REQUIRED:'+name);
    return value;
  };
  const core=green('U073-final-core'),replay=green('U073-final-red-replay',8);
  green('U073-final-controls',7);const flood=green('U073-final-flood',1);
  if(core)try{
    const counts=JSON.parse(/C011_ASSERTIONS (.+)$/m.exec(core.stdout)[1]);
    if(counts.tests!==core.summary.tests||counts.declared!==counts.tests||counts.assertions<=0||counts.zeroAssertionTests.length)add('ACTUAL_ASSERTIONS_INCOMPLETE');
  }catch{add('ACTUAL_ASSERTIONS_MISSING');}
  const red=record('U073-causal-server-red-01');
  if(!red||red.summary.tests!==8||red.summary.fail!==7||red.summary.pass!==1||red.execution.exitCode!==1
    ||red.execution.expectedExitCode!==1||assertions(red.stdout).naturalFailureBlocks!==7)add('GENUINE_CAUSAL_RED_REQUIRED');
  const test=value=>value?.inputs.find(input=>input.path.endsWith('tests/u073-flood-oracle.test.cjs'))?.rawSha256;
  if(!test(red)||test(red)!==test(replay))add('CAUSAL_RED_ASSERTION_BYTES_CHANGED');
  const transition=JSON.parse(verified.readers.read('evidence/u073/history/wrong-client-predicate-transition.json'));
  if(transition.oldFailureRemainsGenuine!==true||transition.editedAssertionClaimedUnchangedGreen!==false||transition.originalChronologyCertified!==false
    ||transition.oldFailureStdoutSha256!=='03b1550737b75c1626434a9cd7dacbc6130c6731776f83e4912eeb54c620fc2c')add('EXPLICIT_WRONG_PREDICATE_TRANSITION_REQUIRED');
  if(flood)try{
    const actual=JSON.parse(/U073_CAUSAL_SERVER_WRITES (.+)$/m.exec(flood.stdout)[1]);
    if(actual.writes.actualServerFrames!==45||actual.writes.actualTypedTerminalWrites!==30
      ||JSON.stringify(actual.writes.statuses)!==JSON.stringify({200:15,401:15,404:4,405:4,414:4,421:3})
      ||actual.serverBarrier.serverCohortClosed!==30||actual.serverBarrier.openCohort!==0||actual.serverBarrier.settled!==true
      ||actual.oldClientMinimumPredicateUsed!==false)add('ACTUAL_SAME_FLOOD_SERVER_COHORT_REQUIRED');
  }catch{add('ACTUAL_SAME_FLOOD_DIAGNOSTIC_REQUIRED');}
  const controls=record('U073-final-controls');
  if(controls)try{
    const lines=controls.stdout.split('\n').filter(line=>line.startsWith('# {')).map(line=>JSON.parse(line.slice(2)));
    const zero=lines.find(line=>line.retention?.startsWith('explicit application discard'));
    if(!zero||zero.clientRetained!==0||zero.actualServer.actualTypedTerminalWrites!==8||zero.actualServer.actualServerFrames!==12)add('REAL_ZERO_RETENTION_SERVER_PROOF_REQUIRED');
    for(const mode of ['missing-observation','silent','wrong','bare','naive']){
      const actual=lines.find(line=>line.mode===mode&&line.oracleOutcome==='NONPASS');
      if(!actual||actual.issues.length===0||actual.killCredit!==false)add('REAL_NEGATIVE_SERVER_CONTROL_REQUIRED:'+mode);
    }
  }catch{add('ACTUAL_CAUSAL_CONTROLS_UNREADABLE');}
  const coverage=verified.data.get('coverage');
  if(!coverage||!coverage.passed||coverage.missing?.length||coverage.unenumerated?.length
    ||JSON.stringify(coverage.files?.map(row=>row.file).sort())!==JSON.stringify([...PRODUCTION].sort()))add('WHOLE_FILE_COVERAGE_SET_INCOMPLETE');
  for(const row of coverage?.files||[])if(!row.loaded||row.nestedExit!==0||row.lines<85||row.branches<85||row.functions<85||row.failures.length)add('COVERAGE_BELOW_85:'+row.file);
  if(JSON.stringify(coverage?.actualRows?.map(row=>row.file).sort())!==JSON.stringify([...PRODUCTION].sort()))add('ACTUAL_WHOLE_FILE_COVERAGE_ROWS_REQUIRED');
  for(const entry of coverage?.actualRows||[])try{
    const text=verified.projection(entry.output),row=coverage.files.find(row=>row.file===entry.file),number='(\\d+(?:\\.\\d+)?)';
    const actual=new RegExp('^#\\s+'+entry.file.replace('.','\\.')+'\\s+\\|\\s+'+number+'\\s+\\|\\s+'+number+'\\s+\\|\\s+'+number+'\\s+\\|','m').exec(text);
    const args=entry.command.args,includes=args.filter(arg=>arg.startsWith('--test-coverage-include='));
    if(!actual||Number(actual[1])!==row.lines||Number(actual[2])!==row.branches||Number(actual[3])!==row.functions||entry.command.status!==0
      ||includes.length!==1||!includes[0].endsWith(entry.file)||includes[0].includes('*')||args.some(arg=>arg.startsWith('--test-coverage-exclude'))
      ||!['lines','branches','functions'].every(metric=>args.includes('--test-coverage-'+metric+'=85')))add('ACTUAL_COVERAGE_ROW_DIFFERS:'+entry.file);
  }catch{add('ACTUAL_COVERAGE_ROW_UNREADABLE:'+entry.file);}
  const browser=verified.data.get('browser');
  if(!browser||browser.browser?.signature!=='Valid'||browser.browser?.publisher!=='Microsoft Corporation'||browser.browser?.major!==157
    ||browser.observations?.length!==2)add('ACTUAL_QUALIFIED_BROWSER_REQUIRED');
  for(const observation of browser?.observations||[]){
    if(!observation.cleanup?.clean||observation.cleanup.absentProfileCount!==1||observation.cleanup.absentScratchCount!==1
      ||observation.cleanup.ownedNativeIdentities.length<1)add('BROWSER_OWN_CLEANUP_UNPROVEN');
    if(observation.label==='injected-failure'&&!observation.failureCaught)add('INJECTED_BROWSER_FAILURE_REQUIRED');
    if(observation.label==='success')for(const view of [observation.first,observation.second]){
      if(view.rows.length!==21||view.outcomes.filter(outcome=>outcome==='allowed').length!==12
        ||view.outcomes.filter(outcome=>outcome==='forbidden').length!==9||view.balanced!=='yes'||!view.rowVisibility.every(Boolean))add('REAL_BROWSER_CURRENT_UI_DIFFERS');
    }
  }
  const load=verified.data.get('load80');
  if(!load||!load.passed||load.completed!==80||load.rounds!==20||load.concurrency!==4||load.bad!==0||load.burners?.length!==4
    ||load.actualParentStressRelease?.additionalLoaded80BurnersExplicitlyAdmitted!==4
    ||load.burners.some(burner=>!burner.stopped||burner.nativeIdentity?.pid!==burner.pid||!burner.nativeIdentity.creationUtc))add('CURRENT_LOAD80_REQUIRED');
  for(const run of load?.runs||[])try{
    const out=verified.projection(run.streams.stdout.publicProjection);verified.projection(run.streams.stderr.publicProjection);
    const s=summaryOf(out);if(run.code!==0||run.signal||run.timedOut||s.tests!==12||s.pass!==s.tests||s.fail||s.cancelled||s.skipped||s.todo
      ||['tests','pass','fail','cancelled','skipped','todo'].some(key=>run.summary[key]!==s[key]))add('LOAD_RUN_NONPASS:'+run.index);
  }catch{add('LOAD_RAW_UNREADABLE:'+run.index);}
  const resource=verified.data.get('resource64');
  if(!resource||resource.requiredTotal!==64||resource.concurrency!==8||resource.completedGroups!==64||resource.passedGroups!==64
    ||resource.cpuBurnersStarted!==0||resource.failedLeaves?.length||resource.groups?.length!==64||!resource.passed||resource.failure||resource.emergency
    ||resource.cleanup?.activeOwnedRoots!==0||resource.phases?.length!==48||resource.actualParentStressRelease?.parentActuallyReleasedC014StressLane!==true
    ||resource.sourceFreezeSha256!==sha(verified.readers.read('evidence/u073/current/source-freeze.json')))add('CURRENT_RESOURCE64_REQUIRED');
  if(resource&&JSON.stringify(resource.groups.map(group=>group.job).sort((a,b)=>a-b))!==JSON.stringify(Array.from({length:64},(_,i)=>i+1)))add('RESOURCE_GROUP_IDENTITIES_INCOMPLETE');
  for(const phase of resource?.phases||[])if(phase.requiredConcurrency!==8||phase.readyCount!==8||phase.nativeOwnedRoots.length!==8
    ||new Set(phase.nativeOwnedRoots.map(row=>row.pid)).size!==8||phase.nativeOwnedRoots.some(row=>!row.creationUtc))add('ACTUAL_EIGHT_WAY_BARRIER_REQUIRED');
  for(const group of resource?.groups||[]){
    const expected={flood:1,'flood-pending':1,burst:2,'pipeline-process-a':3,'pipeline-process-b':2,'pipeline-process-c':3};
    if(JSON.stringify(group.leaves.map(leaf=>leaf.leaf).sort())!==JSON.stringify(Object.keys(expected).sort())
      ||group.leaves.reduce((n,leaf)=>n+leaf.summary.tests,0)!==12
      ||group.leaves.flatMap(leaf=>leaf.matrices||[]).reduce((n,matrix)=>n+matrix.cells,0)!==355)add('RESOURCE_GROUP_LEAF_SET:'+group.job);
    for(const leaf of group.leaves)try{
      const out=verified.projection(leaf.streams.stdout.publicProjection);verified.projection(leaf.streams.stderr.publicProjection);
      const s=summaryOf(out);
      if(!leaf.passed||leaf.code!==0||leaf.signal||leaf.timedOut||s.tests!==expected[leaf.leaf]||s.pass!==s.tests||s.fail||s.cancelled||s.skipped||s.todo
        ||['tests','pass','fail','cancelled','skipped','todo'].some(key=>leaf.summary[key]!==s[key])
        ||leaf.assertions.tests!==s.tests||leaf.assertions.assertions<=0||leaf.assertions.zeroAssertionTests.length
        ||leaf.nativeIdentity?.pid!==leaf.pid||!leaf.nativeIdentity.creationUtc||leaf.heapCappedProcesses<=0)add('RESOURCE_LEAF_NONPASS:'+group.job+'/'+leaf.leaf);
      if(leaf.leaf==='flood'){
        const actual=JSON.parse(/U073_CAUSAL_SERVER_WRITES (.+)$/m.exec(out)[1]);
        const r=leaf.resource;
        if(actual.writes.actualServerFrames!==45||actual.writes.actualTypedTerminalWrites!==30||actual.serverBarrier.serverCohortClosed!==30
          ||r.typedServer.actualServerFrames!==45||r.typedServer.actualTypedTerminalWrites!==30||r.causalProblems.length||r.noEffect!==true
          ||r.serviceClosed!==30||r.referenceClosed!==30||r.naiveClosed>=30||r.naiveControlTimedOut!==true
          ||r.realSeparateServerPids.length!==3||new Set(r.realSeparateServerPids).size!==3||r.realSeparateServerPids.includes(leaf.pid)
          ||r.heapUsed>=32*1024*1024||r.cpuMicrosPerSocket.service<0||r.cpuMicrosPerSocket.reference<0
          ||r.cpuMicrosPerSocket.service>10*r.cpuMicrosPerSocket.reference+20000
          ||r.bytesRead>2*r.referenceBytesRead+30*65536)add('RESOURCE_CAUSAL_SERVER_PROOF:'+group.job);
      }else if(leaf.leaf==='flood-pending'){
        const r=leaf.resource;
        if(r.actualClientFallbacks!==0||r.connections!==0||r.heapUsed>=32*1024*1024||r.afterPool.reservedUnits!==1
          ||r.afterPool.reservedSpend!==4||JSON.stringify(r.ownListCounts)!=='[0,0]')add('RESOURCE_PENDING_NO_EFFECT_PROOF:'+group.job);
      }else if(leaf.leaf==='burst'){
        if(leaf.resource.shapes!==2||leaf.resource.socketsEach!==128||JSON.stringify(leaf.resource.legitimatePostBurstAnswers)!=='[200,200]')add('RESOURCE_BURST_POSITIVE_CONTROLS:'+group.job);
      }else if(leaf.matrices.some(matrix=>matrix.cells<=0||matrix.problems!==0)){
        add('RESOURCE_REAL_TYPED_MATRIX:'+group.job+'/'+leaf.leaf);
      }
    }catch{add('RESOURCE_RAW_UNREADABLE:'+group.job+'/'+leaf.leaf);}
  }
  for(const mode of ['lf','crlf']){
    const fresh=verified.data.get('fresh-'+mode);
    if(!fresh||fresh.mode!==mode||fresh.code!==0||fresh.signal||fresh.spawnError||fresh.summary.tests<=0||fresh.summary.pass!==fresh.summary.tests
      ||fresh.summary.fail||fresh.summary.cancelled||fresh.summary.skipped||fresh.summary.todo||fresh.assertions?.zeroAssertionTests.length)add('CURRENT_FRESH_REQUIRED:'+mode);
  }
  const mutation=record('U073-final-mutations');
  if(!mutation||mutation.execution.exitCode!==1||mutation.execution.expectedExitCode!==1)add('CURRENT_MUTATION_CAPTURE_REQUIRED');
  else{
    const report=JSON.parse(verified.readers.read('evidence/u073/current/mutation-report.json'));
    for(const problem of audit(report,mutation.stdout,verified.freeze,verified.readers.read))add(problem);
    if(report.generated!==1839||report.executed!==1839||report.killed!==1815||report.equivalent!==24||report.invalidSpecimens!==0)add('STRICT_CURRENT_MUTATION_CLOSURE_REQUIRED');
  }
  const source=verified.data.get('source-git');
  if(!source||!source.passed||!source.frozenSourceMatches||!source.inheritedLiveBytesUnchanged||!source.currentAcceptedDependenciesMatch
    ||!source.currentConsumerInputsMatch||source.inheritedFiles!==5745||source.productionEdits!==0||source.importEdits!==0)add('CURRENT_SOURCE_GIT_REQUIRED');
  const consumer=verified.data.get('consumer');
  if(!consumer||consumer.code!==0||consumer.summary.tests<=0||consumer.summary.tests!==consumer.summary.pass||consumer.summary.fail
    ||consumer.signal||consumer.spawnError||consumer.sourceBytesMatchBeforeAndAfter!==true
    ||JSON.stringify(consumer.sourceFiles)!==JSON.stringify(verified.freeze.consumerSources)
    ||consumer.sourceFreezeSha256!==sha(verified.readers.read('evidence/u073/current/source-freeze.json'))
    ||consumer.sourceRole!=='unchanged accepted C009 producer regression; no unproven C011 executable consumer claim')add('CURRENT_CONSUMER_FOOTPRINT_REQUIRED');
  const provenance=verified.data.get('provenance');
  if(!provenance||provenance.cardId!=='U073'||provenance.credit!==0||provenance.originalChronologyCertified!==false
    ||provenance.sourceFreezeSha256!==sha(verified.readers.read('evidence/u073/current/source-freeze.json')))add('ONE_CURRENT_QUALIFYING_EPOCH_REQUIRED');
  return problems;
}
module.exports={decide,REQUIRED,PRODUCTION};
