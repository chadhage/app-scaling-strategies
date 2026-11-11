'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {build,verify,PRODUCTION}=require('./u074-inventory.cjs'),{createLoader,root,originals,sha,ModuleFault}=require('./u074-loader.cjs');
const {pureCases,pageCases}=require('./u069-probes.cjs'),{serverCases}=require('./u069-server-probes.cjs');
const moduleContract=require('./u074-module-contract.cjs'),equivalence=require('./u069-equivalence.cjs'),{decide}=require('./u074-verdict.cjs');
const output=process.env.U074_CAMPAIGN_OUTPUT;
assert.ok(output&&path.isAbsolute(output));assert.equal(fs.existsSync(output),false);
const sources=Object.fromEntries(PRODUCTION.map(file=>[file,originals.get(file)])),inventory=build(sources);
assert.deepEqual(verify(inventory,sources),[]);
const sourceInputs=fs.readdirSync(__dirname).filter(file=>file.endsWith('.cjs')).map(file=>({path:'tests/'+file,sha256:sha(fs.readFileSync(path.join(__dirname,file)))}))
  .concat(PRODUCTION.map(file=>({path:file,sha256:sha(Buffer.from(sources[file]))})));
const entries=[],selected=process.env.U074_IDS?new Set(process.env.U074_IDS.split(',').map(Number)):null;
const definitions=inventory.definitions.filter(def=>!selected||selected.has(def.id));
const progress=output+'.jsonl';fs.writeFileSync(progress,'',{flag:'wx'});
let currentId=null,unexpected=[];
process.on('uncaughtExceptionMonitor',error=>{unexpected.push({id:currentId,code:error.code,name:error.name,message:String(error.message),kind:'uncaughtException'});});
function fault(error){
  const seen=new Set();
  for(let item=error;item&&typeof item==='object'&&!seen.has(item);item=item.cause){
    seen.add(item);
    if(item instanceof ModuleFault||moduleContract.environmentFault(item)||item.code==='U074_INIT_ENV_NONKILL'
      ||/ERR_TEST_TIMEOUT|ERR_SCRIPT_EXECUTION_TIMEOUT|ETIMEDOUT/.test(String(item.code)))return item;
  }
  return null;
}
async function specification(name,operation){
  let observed=null;
  await test(name,{timeout:120000},async()=>{
    try{await operation();}catch(error){observed=error;throw error;}
  });
  return observed;
}
function probes(file,loader){
  return file==='page.js'?pageCases(loader,()=>createLoader()):file==='server.cjs'?serverCases(loader,()=>createLoader()):pureCases(file,loader);
}
const pristineProbeNames=new Map();
async function pristine(file,index,name){
  const key=file+':'+index+':'+name;
  if(pristineProbeNames.has(key))return pristineProbeNames.get(key);
  const loader=createLoader(),rows=probes(file,loader);
  assert.equal(rows[index].name,name,'Same actual unchanged specification callback');
  await rows[index].run();assert.equal(loader.bounded(),true);
  const proof={name,passed:true,readFiles:[...loader.reads].map(([file,sha256])=>({path:path.relative(root,file).replaceAll('\\','/'),sha256})),
    executedFiles:[...loader.executed].map(([file,sha256])=>({path:path.relative(root,file).replaceAll('\\','/'),sha256}))};
  pristineProbeNames.set(key,proof);return proof;
}
function finish(){
  const counts={};for(const entry of entries)counts[entry.decision]=(counts[entry.decision]||0)+1;
  const report={...inventory,schema:'U074-current-parser-mutation/1',createdAtUtc:new Date().toISOString(),
    generated:inventory.definitions.length,selected:definitions.length,executed:entries.length,unexecuted:definitions.length-entries.length,
    counts,entries,sourceInputs,pristineProbes:[...pristineProbeNames.values()],unexpected,
    policy:{everyParserStatementBound:true,everySingleConditionBound:true,legacyExtrasNotCompletenessEvidence:true,
      moduleFaultSyntaxTimeoutCrashPermissionAutomaticKill:false,defaultEquivalence:false,
      actualReachedMarkersForAstVariants:true,noProductionOrImportEdits:true,
      reporter:'Original bounded Node test-event reporter output; named error codes are preserved, full diagnostic stacks are hashed, not mislabelled as full default TAP'}};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('U074_CAMPAIGN '+JSON.stringify({generated:report.generated,selected:report.selected,executed:report.executed,unexecuted:report.unexecuted,counts,unexpected:unexpected.length}));
}
(async()=>{
  try{
    for(const definition of definitions){
      if(Date.now()>Date.parse('2026-11-11T05:05:00Z'))break;
      currentId=definition.id;
      const loader=createLoader(definition),prefix='U074 '+definition.id+' '+definition.file+' '+definition.label;
      const entry={...definition,executed:false,dependenciesVerified:true,pristinePassed:false,executedSourceVerified:false,readSha256:null,
        causallyReached:false,observation:null,fault:null,pairedProof:null,probes:[],decision:null};
      try{
        if(!definition.compiled||definition.identity){
          entry.decision=decide(entry);
          await test(prefix+' :: compiled construction status is explicit NON-kill',()=>{
            assert.equal(entry.decision,definition.identity?'nonkill-identity':'nonkill-syntax');
          });
        }else{
          let contract;
          if(definition.file!=='page.js'){
            contract=moduleContract.prepare(definition);
            entry.initializationContract=contract.proof;
            entry.pristinePassed=true;
            const name=prefix+' :: required public module initializes and exports its declared coherent contract';
            const error=await specification(name,()=>contract.run(loader));
            if(error){if(fault(error))entry.fault={kind:'module-or-environment',code:error.code,message:error.message};
              else if(error.code==='ERR_ASSERTION')entry.observation={name,code:error.code};else entry.fault={kind:'unexpected-init',code:error.code};}
          }
          if(!entry.observation&&!entry.fault){
            const cases=probes(definition.file,loader);
            for(let index=0;index<cases.length;index++){
              const probe=cases[index],control=await pristine(definition.file,index,probe.name);
              entry.pristinePassed=control.passed;
              const name=prefix+' :: '+probe.name;
              const error=await specification(name,async()=>{
                loader.resetWork();let rejection;
                try{await probe.run();}catch(caught){rejection=caught;}
                if(rejection&&fault(rejection))throw rejection;
                assert.equal(rejection,undefined,'The same pinned pristine-valid public specification completes with a typed result, not a production rejection');
                assert.equal(loader.bounded(),true,'Actual finite-input work counter stays within the declared bound');
              });
              entry.probes.push({name,pristineControl:control.name,actualIterationMaximum:loader.maximumSteps()});
              if(error){if(fault(error))entry.fault={kind:'probe-fault',code:error.code,message:error.message};
                else if(error.code==='ERR_ASSERTION')entry.observation={name,code:error.code};else entry.fault={kind:'unexpected-probe',code:error.code};break;}
            }
          }
          if(!entry.observation&&!entry.fault){
            const legacyLabel=definition.label.startsWith('Legacy additional operator: ')?definition.label.slice('Legacy additional operator: '.length):definition.label;
            const legacyDefinition={...definition,label:legacyLabel},fact=equivalence.identify(legacyDefinition,sources[definition.file]);
            if(fact){
              const name=prefix+' :: specific source-exact paired proof '+fact;
              const error=await specification(name,async()=>{
                const changed=await equivalence.prove(fact,legacyDefinition,loader),reference=await equivalence.prove(fact,legacyDefinition,createLoader());
                assert.deepEqual(changed,reference,'Both actual source-bound executions satisfy the same specific declared semantic domain');
                entry.pairedProof={fact,domain:changed.domain,cases:1,assertedPairs:1,domainCases:changed.cases,
                  pristineSourceSha256:definition.sourceSha256,counterfactualSha256:definition.mutantSha256,name};
              });
              if(error){if(error.code==='ERR_ASSERTION')entry.observation={name,code:error.code};else entry.fault={kind:'paired-proof-fault',code:error.code,message:error.message};}
            }
          }
          const target=path.join(root,definition.file);
          entry.executed=loader.reads.has(target);
          entry.readSha256=loader.reads.get(target)||null;
          entry.executedSourceVerified=loader.executed.get(target)===sha(Buffer.from(loader.actualExecutionText()));
          entry.reachedMarkers=loader.reached();
          entry.causallyReached=definition.operator==='retained-lexical-extra'?entry.executed&&entry.pristinePassed:entry.reachedMarkers>0;
          entry.decision=decide(entry);
        }
      }catch(error){entry.fault={kind:'eligibility-or-pristine-fault',code:error.code,name:error.name,message:String(error.message)};entry.decision='nonkill-fault';}
      entry.readFiles=[...loader.reads].map(([file,sha256])=>({path:path.relative(root,file).replaceAll('\\','/'),sha256}));
      entry.executedFiles=[...loader.executed].map(([file,sha256])=>({path:path.relative(root,file).replaceAll('\\','/'),sha256}));
      entries.push(entry);fs.appendFileSync(progress,JSON.stringify(entry)+'\n');
      if(entries.length%100===0)console.log('U074_PROGRESS '+JSON.stringify({executed:entries.length,lastId:entry.id}));
    }
  }finally{finish();}
})().catch(error=>{console.error(error);process.exitCode=3;});
