'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {PRODUCTION,authority,sha,root}=require('./u069-loader.cjs');
const {identify}=require('./u069-equivalence.cjs');
const initialization=require('./u069-initialization-contract.cjs');
const view=definition=>Object.fromEntries(['id','file','label','start','end','replacement','sourceSha256','mutantSha256'].map(key=>[key,definition[key]]));
function assertions(text){
  const failures=new Set(),passed=new Set(),all=[...text.matchAll(/^not ok \d+ - (.+)\r?$/gm)];
  const unescape=name=>name.replace(/\\([#\\])/g,'$1');
  let naturalFailureBlocks=0;
  for(const match of all){
    const next=text.indexOf('\n# Subtest:',match.index+match[0].length);
    const block=text.slice(match.index,next<0?text.length:next);
    if(/\bcode: ['"]?ERR_ASSERTION['"]?\s*$/m.test(block)
      && !/failureType: ['"]?(?:testTimeoutFailure|cancelledByParent)/.test(block)){
      const name=unescape(match[1]);
      failures.add(name);
      failures.add(name.replace(/\\r/g,'\r').replace(/\\n/g,'\n').replace(/\\t/g,'\t'));
      naturalFailureBlocks++;
    }
  }
  for(const match of text.matchAll(/^ok \d+ - (.+)\r?$/gm))passed.add(unescape(match[1]));
  return{failures,passed,naturalFailureBlocks};
}
function executionText(file,text){
  if(file==='page.js')return text;
  return authority.instrument(text).replace(/^const __bound = .*?;\r?\n/m,
    "const __bound=()=>{__u069Work.steps+=1;if(__u069Work.steps>__u069Work.maximum){__u069Work.exceeded=true;throw new Error('U069_ACTUAL_ITERATION_BOUND');}return true;};\n");
}
function audit(report,text,freeze,read=(file)=>fs.readFileSync(path.join(root,...file.split('/')))){
  const problems=[],add=(kind,id='')=>problems.push(kind+(id?':'+id:''));
  if(!report||report.schema!=='U069-current-mutation/1'||!Array.isArray(report.entries)||!Array.isArray(report.definitions))return['CURRENT_REPORT_REQUIRED'];
  const sources=new Map(PRODUCTION.map(file=>{
    const pin=freeze.production.find(entry=>entry.path===file);
    return[file,read(pin.subject).toString('utf8')];
  }));
  const expected=PRODUCTION.flatMap(file=>authority.generate(file,sources.get(file)));
  const server=sources.get('server.cjs'),commit=/if \(cancelled\(\)\) return undefined;\r?\n\s+registry\.verify\(token\);/.exec(server);
  if(!commit)return['REQUIRED_COMMIT_ORDER_SUBJECT_MISSING'];
  expected.push({file:'server.cjs',label:'required F3: token revalidation before cancellation',start:commit.index,end:commit.index+commit[0].length,
    replacement:'registry.verify(token);\n          if (cancelled()) return undefined;'});
  const definitions=expected.map((entry,index)=>{
    const original=sources.get(entry.file),changed=original.slice(0,entry.start)+entry.replacement+original.slice(entry.end);
    return{...entry,id:index+1,sourceSha256:sha(Buffer.from(original)),mutantSha256:sha(Buffer.from(changed))};
  });
  if(JSON.stringify(definitions.map(view))!==JSON.stringify(report.definitions.map(view)))add('RETARGETED_DEFINITIONS_DIFFER');
  if(report.generated!==definitions.length||report.executed!==definitions.length||report.entries.length!==definitions.length)add('CURRENT_EXECUTION_SET_INCOMPLETE');
  for(const key of ['survived','undecided','notExecuted'])if(report[key]!==0)add('CURRENT_'+key.toUpperCase());
  if(/asynchronous activity after the test|uncaughtException|unhandledRejection/.test(text))add('ASYNCHRONOUS_FAULT_NOT_A_VERDICT');
  const observed=assertions(text),sourcePins=new Map(freeze.files.map(entry=>[entry.path,entry])),counts={killed:0,equivalent:0,invalidSpecimens:0};
  for(const input of report.sourceInputs||[]){
    if(!sourcePins.get(input.path)?.acceptedSha256.includes(input.sha256))add('CAMPAIGN_INPUT_NOT_FROZEN',input.path);
  }
  const requiredInputs=[...PRODUCTION,...freeze.files.filter(entry=>/^tests\/.*\.cjs$/.test(entry.path)).map(entry=>entry.path)];
  if(JSON.stringify((report.sourceInputs||[]).map(entry=>entry.path).sort())!==JSON.stringify(requiredInputs.sort()))add('CAMPAIGN_SOURCE_SET_DIFFERS');
  const ids=new Set();
  for(const entry of report.entries){
    const definition=definitions[entry.id-1];
    if(!definition||ids.has(entry.id)||JSON.stringify(view(entry))!==JSON.stringify(view(definition))){add('CURRENT_POSITION_IDENTITY_DIFFERS',entry.id);continue;}
    ids.add(entry.id);
    const original=sources.get(entry.file),changed=original.slice(0,entry.start)+entry.replacement+original.slice(entry.end);
    const loaded=(entry.executedFiles||[]).find(file=>file.path===entry.file),readTarget=(entry.readFiles||[]).find(file=>file.path===entry.file);
    if(!readTarget||readTarget.sha256!==entry.mutantSha256)add('ACTUAL_COUNTERFACTUAL_READ_DIFFERS',entry.id);
    if(entry.file!=='page.js'&&(!loaded||loaded.sha256!==sha(Buffer.from(executionText(entry.file,changed)))))add('ACTUAL_COUNTERFACTUAL_EXECUTION_DIFFERS',entry.id);
    for(const file of entry.executedFiles||[]){
      if(!PRODUCTION.includes(file.path)&&sourcePins.has(file.path)&&file.sha256!==sourcePins.get(file.path).sha256)add('EXECUTED_SPECIFICATION_BYTES_DIFFER',entry.id+'/'+file.path);
    }
    if(entry.decision==='killed'){
      counts.killed++;
      const prefix=`U069 ${entry.id} ${entry.file} ${entry.label} :: `;
      const allowed=new Set((entry.probesExecuted||[]).map(probe=>probe.name));
      const fact=identify(definition,original);
      if(fact)allowed.add(prefix+'explicit paired current-source proof '+fact);
      if(entry.moduleFault||entry.namedFailures.length===0
        ||!entry.namedFailures.every(name=>name.startsWith(prefix)&&allowed.has(name)&&observed.failures.has(name)))add('NATURAL_NAMED_ASSERTION_REQUIRED',entry.id);
      if(initialization.selected(entry)){
        const proof=entry.initializationContract;
        const pristine=prefix+'pristine identical-environment configuration initialization/export contract';
        if(!proof||proof.sourceSha256!==entry.sourceSha256||proof.mutantSha256!==entry.mutantSha256
          ||proof.compiledOriginal!==true||proof.compiledMutant!==true||proof.pristineIdenticalEnvironmentPassed!==true
          ||!observed.passed.has(pristine)||!entry.namedFailures.some(name=>name.endsWith('required configuration module initializes and exports its closed validated contract')))
          add('REQUIRED_INITIALIZATION_CONTRACT_PROOF_MISSING',entry.id);
        const requiredModules=[...freeze.files.filter(pin=>!pin.path.includes('/')&&/\.(?:cjs|js|json)$/.test(pin.path)).map(pin=>pin.path),
          ...freeze.dependencies.map(pin=>pin.path)].sort();
        if(JSON.stringify((proof?.moduleHashes||[]).map(pin=>pin.path).sort())!==JSON.stringify(requiredModules))
          add('INITIALIZATION_MODULE_SET_INCOMPLETE',entry.id);
        for(const pin of proof?.moduleHashes||[]){
          const expected=sourcePins.get(pin.path)||freeze.dependencies.find(entry=>entry.path===pin.path);
          if(!expected?.acceptedSha256.includes(pin.sha256))add('INITIALIZATION_MODULE_HASH_DIFFERS',entry.id+'/'+pin.path);
        }
      }
    }else if(entry.decision==='equivalent'){
      counts.equivalent++;
      const proof=entry.equivalence,fact=identify(definition,original);
      if(!fact||!proof||proof.fact!==fact||proof.cases<=0||typeof proof.domain!=='string'||proof.domain.length<20
        ||!observed.passed.has(proof.test)||proof.originalSourceSha256!==entry.sourceSha256||proof.counterfactualSha256!==entry.mutantSha256)
        add('SPECIFIC_CURRENT_PAIRED_PROOF_REQUIRED',entry.id);
    }else if(entry.decision==='invalid-module'){
      counts.invalidSpecimens++;
      add('VALID_INITIALIZATION_POSITION_UNCLOSED',entry.id);
    }else add('UNDECIDED_VALID_POSITION',entry.id);
  }
  for(const [key,count] of Object.entries(counts))if(report[key]!==count)add('CURRENT_CENSUS_DIFFERS',key);
  if(observed.naturalFailureBlocks!==counts.killed)add('UNACCOUNTED_NATURAL_ASSERTION_FAILURES');
  if(counts.invalidSpecimens!==0||counts.killed+counts.equivalent!==definitions.length)add('VALID_VARIANT_CLOSURE_INCOMPLETE');
  return problems;
}
module.exports={audit,assertions,executionText};
