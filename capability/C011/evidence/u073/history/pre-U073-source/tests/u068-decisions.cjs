'use strict';
const {assertions,audit}=require('./u069-audit.cjs');
const {freshEpoch}=require('./u068-epoch-verifier.cjs');
const {summaryOf,sha}=require('./u068-verify.cjs');
const PRODUCTION=['codes.cjs','config.cjs','contract.js','json.cjs','page.js','server.cjs','store.cjs'];
const REQUIRED=['core','history-replay','core-replay','ui-replay','guards-replay','coverage','browser','loop',
  'fresh-lf','fresh-crlf','source-git'].map(name=>'u068-final-'+name);
function decide(verified){
  const problems=[],add=kind=>problems.push(kind),record=name=>verified.records.get(name);
  for(const name of REQUIRED){
    const value=record(name);
    if(!value||value.execution.exitCode!==0||value.execution.expectedExitCode!==0)add('CURRENT_CAPTURE_REQUIRED:'+name);
  }
  const green=(name,count)=>{
    const value=record(name),s=value?.summary;
    if(!s||s.tests<=0||s.pass!==s.tests||count!==undefined&&s.tests!==count
      ||['fail','cancelled','skipped','todo'].some(key=>s[key]!==0))add('UNCHANGED_GREEN_REQUIRED:'+name);
    return value;
  };
  const core=green('u068-final-core'),history=green('u068-final-history-replay',6);
  const coreReplay=green('u068-final-core-replay',71),ui=green('u068-final-ui-replay',4);
  green('u068-final-guards-replay',9);
  if(core)try{
    const counts=JSON.parse(/C011_ASSERTIONS (.+)$/m.exec(core.stdout)[1]);
    if(counts.tests!==core.summary.tests||counts.declared!==counts.tests||counts.assertions<=0||counts.zeroAssertionTests.length)add('ACTUAL_ASSERTIONS_INCOMPLETE');
  }catch{add('ACTUAL_ASSERTIONS_MISSING');}
  const red=(name,total,failed)=>{
    const value=record(name);
    if(!value||value.summary.tests!==total||value.summary.fail!==failed||value.execution.exitCode!==1
      ||value.execution.expectedExitCode!==1||assertions(value.stdout).naturalFailureBlocks!==failed)add('GENUINE_ASSERTION_RED_REQUIRED:'+name);
    return value;
  };
  const coreRed=red('u068-fresh-core-red',71,65),historyRed=red('u068-fresh-history-red',6,6);
  const uiRed=red('u068-ui-source-complete-red',4,2);
  const uiReapplied=green('u068-ui-source-complete-green',4);
  const observerRed=red('u069-assertion-identity-red',1,1),observerGreen=green('u069-final-assertion-identity-replay',1);
  const initializationRed=red('u069-v3-initialization-closure-red',3,3),initializationGreen=green('u069-v3-initialization-closure-green',3);
  red('u069-retained-completion-red',4,4);
  const unchanged=(before,after,suffix)=>{
    const input=value=>value?.inputs.find(entry=>entry.path.endsWith(suffix))?.rawSha256;
    if(!input(before)||input(before)!==input(after))add('RED_ASSERTION_BYTES_CHANGED:'+suffix);
  };
  unchanged(historyRed,history,'tests/u068-history.test.cjs');
  unchanged(uiRed,ui,'tests/u068-page.test.cjs');
  unchanged(uiRed,uiReapplied,'tests/u068-page.test.cjs');
  unchanged(observerRed,observerGreen,'tests/u069-assertion-identity.test.cjs');
  unchanged(initializationRed,initializationGreen,'tests/u069-initialization-closure.test.cjs');
  const uiEpoch=JSON.parse(verified.readers.read('evidence/u068/ui-replay-epoch.json'));
  if(uiEpoch.schema!=='U068-explicit-ui-replay-epoch/1'||uiEpoch.correctedPageAlreadyExistedOutsideSubject!==true
    ||uiEpoch.newAuthorshipClaimed!==false||uiEpoch.originalChronologyCertified!==false
    ||uiEpoch.originalHelperPreimageRetained!==false||uiEpoch.oldPartialRetainedUnchanged!==true
    ||uiEpoch.redCompletedAtUtc!==uiRed?.completedAtUtc
    ||!(Date.parse(uiEpoch.correctedPageReappliedAtUtc)>Date.parse(uiEpoch.redCompletedAtUtc))
    ||!(Date.parse(uiReapplied?.startedAtUtc)>=Date.parse(uiEpoch.correctedPageReappliedAtUtc)))add('HONEST_SOURCE_COMPLETE_UI_REPLAY_REQUIRED');
  for(const name of ['reserve','race','idempotency','lifecycle','leaks','roles','hostile','batch','audit'])unchanged(coreRed,coreReplay,'tests/'+name+'.test.cjs');
  const epoch=JSON.parse(verified.readers.read('evidence/u068/fresh-epoch.json'));
  for(const problem of freshEpoch(epoch))add(problem);
  for(const [key,value] of [['coreRed',coreRed],['historyRed',historyRed]]){
    if(!value||value.privateOriginalRecordSha256!==epoch[key].privateOriginalRecordSha256
      ||value.completedAtUtc!==epoch[key].completedAtUtc)add('FRESH_EPOCH_CAPTURE_BINDING_DIFFERS:'+key);
  }
  const coverage=verified.data.get('coverage');
  if(!coverage||!coverage.passed||coverage.missing?.length||coverage.unenumerated?.length
    ||JSON.stringify(coverage.files?.map(row=>row.file).sort())!==JSON.stringify([...PRODUCTION].sort()))add('WHOLE_FILE_COVERAGE_SET_INCOMPLETE');
  for(const row of coverage?.files||[])if(!row.loaded||row.nestedExit!==0||row.lines<85||row.branches<85||row.functions<85||row.failures.length)add('COVERAGE_BELOW_85:'+row.file);
  if(JSON.stringify(coverage?.actualRows?.map(row=>row.file).sort())!==JSON.stringify([...PRODUCTION].sort()))add('ACTUAL_WHOLE_FILE_COVERAGE_ROWS_REQUIRED');
  for(const entry of coverage?.actualRows||[])try{
    const text=verified.projection(entry.output),row=coverage.files.find(row=>row.file===entry.file);
    const number='(\\d+(?:\\.\\d+)?)';
    const actual=new RegExp('^#\\s+'+entry.file.replace('.','\\.')+'\\s+\\|\\s+'+number+'\\s+\\|\\s+'+number+'\\s+\\|\\s+'+number+'\\s+\\|','m').exec(text);
    const args=entry.command.args,includes=args.filter(arg=>arg.startsWith('--test-coverage-include='));
    if(!actual||Number(actual[1])!==row.lines||Number(actual[2])!==row.branches||Number(actual[3])!==row.functions
      ||entry.command.status!==0||includes.length!==1||!includes[0].endsWith(entry.file)||includes[0].includes('*')
      ||args.some(arg=>arg.startsWith('--test-coverage-exclude'))
      ||!['lines','branches','functions'].every(metric=>args.includes('--test-coverage-'+metric+'=85')))add('ACTUAL_COVERAGE_ROW_DIFFERS:'+entry.file);
  }catch{add('ACTUAL_COVERAGE_ROW_UNREADABLE:'+entry.file);}
  const browser=verified.data.get('browser');
  if(!browser||browser.browser?.signature!=='Valid'||browser.browser?.publisher!=='Microsoft Corporation'
    ||browser.browser?.major!==157||browser.observations?.length!==2)add('ACTUAL_QUALIFIED_BROWSER_REQUIRED');
  for(const observation of browser?.observations||[]){
    if(!observation.cleanup?.clean||observation.cleanup.absentProfileCount!==1||observation.cleanup.absentScratchCount!==1
      ||observation.cleanup.absentCreatedDirectoryCount!==2||observation.cleanup.ownedNativeIdentities.length<1)add('BROWSER_OWN_CLEANUP_UNPROVEN');
    if(observation.label==='injected-failure'&&!observation.failureCaught)add('INJECTED_BROWSER_FAILURE_REQUIRED');
    if(observation.label==='success')for(const view of [observation.first,observation.second]){
      if(view.rows.length!==21||view.outcomes.filter(outcome=>outcome==='allowed').length!==12
        ||view.outcomes.filter(outcome=>outcome==='forbidden').length!==9||view.balanced!=='yes'
        ||new Set(view.ids).size!==view.ids.length||!view.rowVisibility.every(Boolean)||!view.status.includes('Replay keys:'))add('REAL_BROWSER_CURRENT_UI_DIFFERS');
    }
  }
  const loop=verified.data.get('loop');
  if(!loop||!loop.passed||loop.completed!==80||loop.bad!==0||loop.rounds!==20||loop.concurrency!==4
    ||loop.burners?.length!==4||loop.burners.some(burner=>!burner.stopped))add('CURRENT_LOAD_LOOP_INCOMPLETE');
  for(const run of loop?.runs||[])try{
    const out=verified.projection(run.streams.stdout.publicProjection);
    verified.projection(run.streams.stderr.publicProjection);
    const summary=summaryOf(out);
    if(run.code!==0||run.signal||run.timedOut||summary.tests<=0||summary.pass!==summary.tests
      ||['fail','cancelled','skipped','todo'].some(key=>summary[key]!==0)
      ||Object.entries(run.summary).some(([key,value])=>summary[key]!==value))add('LOAD_REPETITION_FAILED:'+run.index);
  }catch{add('LOAD_STREAM_UNREADABLE:'+run.index);}
  for(const mode of ['lf','crlf']){
    const fresh=verified.data.get('fresh-'+mode);
    if(!fresh||fresh.mode!==mode||fresh.code!==0||fresh.signal||fresh.spawnError||fresh.summary.tests<=0
      ||fresh.summary.pass!==fresh.summary.tests||fresh.summary.fail||fresh.summary.cancelled||fresh.summary.skipped||fresh.summary.todo
      ||fresh.assertions?.zeroAssertionTests.length)add('CURRENT_FRESH_NAMESPACE_FAILED:'+mode);
  }
  const mutation=record('u069-final-mutations');
  if(!mutation||mutation.execution.exitCode!==1||mutation.execution.expectedExitCode!==1)add('ACTUAL_CURRENT_MUTATION_CAPTURE_REQUIRED');
  else{
    const report=JSON.parse(verified.readers.read('evidence/u069/current-report-v2.json'));
    for(const problem of audit(report,mutation.stdout,verified.freeze,verified.readers.read))add(problem);
    const projected=verified.data.get('mutation');
    if(!projected||sha(Buffer.from(JSON.stringify(projected)))!==sha(Buffer.from(JSON.stringify(report))))add('CURRENT_MUTATION_DATA_DIFFERS');
  }
  const source=verified.data.get('source-git');
  if(!source||!source.passed||!source.frozenSourceMatches||!source.inheritedLiveBytesUnchanged
    ||!source.currentAcceptedDependenciesMatch||source.inheritedFiles!==59||!Array.isArray(source.consumers))add('SOURCE_GIT_CONSUMER_GATE_REQUIRED');
  const provenance=verified.data.get('provenance');
  if(!provenance||provenance.originalChronologyCertified!==false||provenance.credit!==0
    ||JSON.stringify(provenance.logicalItems)!==JSON.stringify(['U068','U069'])
    ||provenance.sourceFreezeSha256!==sha(verified.readers.read('evidence/current/source-freeze.json')))add('SINGLE_JOINT_SOURCE_EPOCH_REQUIRED');
  return problems;
}
module.exports={decide,REQUIRED,PRODUCTION};
