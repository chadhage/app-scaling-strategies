'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {inventory,sources}=require('./ast.cjs');
const {paired}=require('./pairs.cjs');
const {classify}=require('./verdict.cjs');
const {IDS}=require('./current-v2-contracts.cjs');
const {prove,acceptedProof}=require('./current-v2-proof.cjs');
const {sha}=require('./integrity.cjs');
const {remaining}=require('./budget.cjs');
function validProof(definition,decision,proof,raw) {
  if(definition.identity||definition.syntax)return false;
  if(decision?.id!==definition.id||decision?.key!==definition.key||decision?.file!==definition.file||
    decision?.sourceSha256!==definition.sourceSha256||decision?.mutantSha256!==definition.mutantSha256)return false;
  if(!decision||!proof||decision.proofSha256!==sha(Buffer.from(JSON.stringify(proof))))return false;
  if(proof.definitionId!==definition.id)return false;
  if(proof.kind==='current-raw-named-causal-assertion')return decision.decision==='named-assertion-kill'&&raw&&raw.id===definition.id&&raw.sourceReadSha256===definition.sourceSha256&&
    raw.executedSourceSha256===definition.mutantSha256&&raw.faults.length===0&&raw.failures.length===1&&raw.failures[0].code==='ERR_ASSERTION'&&
    raw.pristineFailures===0&&raw.pristineFaults===0&&proof.name===raw.failures[0].name&&proof.originalOutcomeSha256===sha(Buffer.from(JSON.stringify(raw)));
  if(proof.schema==='C012-valid-fault-position-specific-public-contract-witness/2')return acceptedProof(definition,proof)&&decision.decision===proof.decision;
  if(proof.kind==='existing-specific-equivalence')return decision.decision==='specific-runnable-scoped-pair'&&proof.definitionId===definition.id&&proof.proof.counterfactualSha256===definition.mutantSha256&&
    proof.proof.pristineSourceSha256===definition.sourceSha256&&proof.proof.cases===proof.proof.assertedPairs&&proof.proof.cases>0&&
    require('node:util').isDeepStrictEqual(proof.proof.pristineTrace,proof.proof.counterfactualTrace)&&proof.proof.extra.every(row=>require('node:util').isDeepStrictEqual(row.pristine,row.counterfactual));
  return false;
}
function derive(domain,decisions,proofs,raws) {
  return domain.definitions.filter(row=>!row.identity&&!row.syntax&&!validProof(row,decisions.find(d=>d.id===row.id),proofs.get(row.id),raws.get(row.id))).map(row=>row.id);
}
async function main(){
  remaining(60000);
  const input=process.env.C012_MUTATION_INPUT,output=process.env.C012_CURRENT_CLOSURE_OUTPUT;
  assert.ok(input&&output&&path.isAbsolute(input)&&path.isAbsolute(output));fs.mkdirSync(output,{recursive:false});
  const source=sources(),domain=inventory(source),saved=JSON.parse(fs.readFileSync(path.join(input,'inventory.json')));
  assert.deepEqual(domain,saved,'actual complete current independent domain');
  const bytes=fs.readFileSync(path.join(input,'outcomes.original.ndjson')),raws=new Map(bytes.toString().trimEnd().split('\n').map(line=>{const row=JSON.parse(line);return[row.id,row];}));
  assert.equal(raws.size,domain.definitions.length);
  assert.deepEqual([...raws.values()].filter(row=>row.classification==='nonkill-runtime-module-environment-fault').map(row=>row.id).sort((a,b)=>a-b),IDS);
  const decisions=[],proofs=new Map(),artifacts=[];
  for(const definition of domain.definitions){
    remaining(60000);
    const raw=raws.get(definition.id);assert.equal(classify(definition,raw),raw.classification);
    assert.equal(raw.sourceReadSha256,definition.sourceSha256);assert.equal(raw.executedSourceSha256,definition.mutantSha256);
    let decision,proof;
    if(definition.identity||definition.syntax){decisions.push({id:definition.id,decision:raw.classification,noKillCredit:true,constructionOnly:true});continue;}
    if(raw.classification==='named-assertion-kill'){
      proof={kind:'current-raw-named-causal-assertion',definitionId:definition.id,name:raw.failures[0].name,
        sourceSha256:definition.sourceSha256,mutantSha256:definition.mutantSha256,originalOutcomeSha256:sha(Buffer.from(JSON.stringify(raw)))};
      decision='named-assertion-kill';
    }else if(raw.classification==='survivor-unresolved'){
      proof={kind:'existing-specific-equivalence',definitionId:definition.id,proof:await paired(definition,source)};
      decision='specific-runnable-scoped-pair';
    }else{
      assert.equal(raw.classification,'nonkill-runtime-module-environment-fault');
      proof=await prove(definition,source);decision=proof.decision;
    }
    const rawProof=Buffer.from(JSON.stringify(proof)),gzip=zlib.gzipSync(rawProof),file='proof-'+definition.id+'.json.gz';
    fs.writeFileSync(path.join(output,file),gzip,{flag:'wx'});
    const row={id:definition.id,key:definition.key,file:definition.file,sourceSha256:definition.sourceSha256,mutantSha256:definition.mutantSha256,
      decision,proofArtifact:file,proofSha256:sha(rawProof),proofGzipSha256:sha(gzip),originalObservationClass:raw.classification,
      rawFaultConvertedToKill:false};
    decisions.push(row);proofs.set(definition.id,proof);artifacts.push({id:definition.id,file,sha256:sha(gzip),originalJsonSha256:sha(rawProof)});
    assert.equal(validProof(definition,row,proof,raw),true,'accepted actual proof binding '+definition.id);
  }
  const unresolved=derive(domain,decisions,proofs,raws),valid=domain.definitions.filter(row=>!row.identity&&!row.syntax);
  const counts=Object.fromEntries([...new Set(decisions.map(row=>row.decision))].sort().map(key=>[key,decisions.filter(row=>row.decision===key).length]));
  const report={schema:'C012-whole-valid-domain-actual-proof-closure/2',generatedAtUtc:new Date().toISOString(),
    definitions:domain.definitions.length,compiledNonIdentity:valid.length,inventorySha256:sha(fs.readFileSync(path.join(input,'inventory.json'))),
    currentRawOutcomesSha256:sha(bytes),counts,decisions,artifacts,
    semanticUnresolved:unresolved.length,unresolvedIds:unresolved,
    formerFaultPositions:IDS.length,formerFaultDiagnosticsRemainNonkills:true,newContrastWitnessesAreNotEquivalence:true,
    existingEquivalenceScopesUnchanged:true,existingVersionBound:1024,parentMayCountOneOriginalSOnly:true};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  assert.deepEqual(unresolved,[],'closure derives from all435 valid definitions and actual proof bindings');
  assert.equal(derive(domain,decisions,new Map(),raws).length,435,'negative control: status labels without artifacts do not close any valid position');
  console.log(JSON.stringify({definitions:domain.definitions.length,valid:valid.length,counts,semanticUnresolved:unresolved.length,proofs:proofs.size}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={validProof,derive};
