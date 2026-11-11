'use strict';
const fs=require('node:fs'),path=require('node:path');
const inventory=require('./u074-inventory.cjs'),{decide}=require('./u074-verdict.cjs'),loader=require('./u074-loader.cjs');
const {assertions}=require('./u069-audit.cjs');
const view=d=>Object.fromEntries(['id','file','start','end','replacement','operator','inventoryKeys','sourceSha256','mutantSha256','compiled','identity','statementType','statementParentType'].map(key=>[key,d[key]]));
function audit(report,text,freeze,read=file=>fs.readFileSync(path.join(loader.root,...file.split('/')))){
  const issues=[],add=value=>issues.push(value);
  if(!report||report.schema!=='U074-final-parser-closure/1')return['CURRENT_PARSER_CLOSURE_REQUIRED'];
  const sources=Object.fromEntries(freeze.production.map(pin=>[pin.path,read(pin.subject).toString()]));
  const expected=inventory.build(sources);
  if(JSON.stringify(expected.definitions.map(view))!==JSON.stringify(report.definitions.map(view)))add('COMPLETE_PARSER_DEFINITIONS_DIFFER');
  for(const issue of inventory.verify(report,sources))add(issue);
  if(report.entries.length!==expected.definitions.length||new Set(report.entries.map(row=>row.id)).size!==expected.definitions.length)add('CURRENT_POSITION_CENSUS_INCOMPLETE');
  const actual=assertions(text),counts={};
  for(const entry of report.entries){
    const definition=expected.definitions[entry.id-1];
    if(!definition||JSON.stringify(view(entry))!==JSON.stringify(view(definition))){add('CURRENT_VARIANT_IDENTITY_DIFFERS:'+entry.id);continue;}
    counts[entry.decision]=(counts[entry.decision]||0)+1;
    if(entry.decision!==decide(entry))add('CURRENT_CLASSIFIER_DIFFERS:'+entry.id);
    if(!definition.compiled){if(entry.decision!=='nonkill-syntax')add('SYNTAX_NOT_A_KILL:'+entry.id);continue;}
    if(definition.identity){if(entry.decision!=='nonkill-identity')add('IDENTITY_NOT_A_KILL:'+entry.id);continue;}
    const changed=sources[entry.file].slice(0,entry.start)+entry.replacement+sources[entry.file].slice(entry.end);
    const execution=entry.file==='page.js'?loader.pageExecutionText(loader.markedText(definition,changed)):loader.executionText(loader.markedText(definition,changed));
    if(!entry.readFiles.some(row=>row.path===entry.file&&row.sha256===entry.mutantSha256))add('ACTUAL_CHANGED_SOURCE_READ_MISSING:'+entry.id);
    if(!entry.executedFiles.some(row=>row.path===entry.file&&row.sha256===loader.sha(Buffer.from(execution))))add('ACTUAL_CHANGED_EXECUTION_MISSING:'+entry.id);
    if(!entry.dependenciesVerified||!entry.pristinePassed)add('ACTUAL_PRISTINE_ENVIRONMENT_REQUIRED:'+entry.id);
    if(entry.decision==='killed'){
      if(entry.observation?.code!=='ERR_ASSERTION'||!actual.failures.has(entry.observation.name)||!entry.causallyReached
        ||entry.operator!=='retained-lexical-extra'&&!(entry.reachedMarkers>0))add('NATURAL_REACHED_ASSERTION_REQUIRED:'+entry.id);
    }else if(entry.decision==='equivalent'){
      const proof=entry.pairedProof;
      if(!proof||proof.cases<=0||proof.assertedPairs!==proof.cases||proof.pristineSourceSha256!==entry.sourceSha256
        ||proof.counterfactualSha256!==entry.mutantSha256||proof.domain.length<30||!actual.passed.has(proof.name)
        ||!entry.pristinePairCertificate||!entry.pairedPristineReadFiles?.length)add('OWN_CURRENT_PAIRED_DOMAIN_REQUIRED:'+entry.id);
    }else add('VALID_POSITION_UNCLOSED:'+entry.id+':'+entry.decision);
    for(const row of entry.executedFiles){
      const pin=freeze.files.find(pin=>pin.path===row.path);
      if(pin&&!inventory.PRODUCTION.includes(row.path)&&!pin.acceptedSha256.includes(row.sha256))add('ACTUAL_EXECUTED_HELPER_DIFFERS:'+entry.id+'/'+row.path);
    }
  }
  if(actual.naturalFailureBlocks!==(counts.killed||0))add('UNACCOUNTED_NATURAL_FAILURES');
  if(report.unexecuted||report.unexpected?.length)add('EXECUTION_FAULT_OR_UNEXECUTED_POSITION');
  return issues;
}
module.exports={audit,view};
