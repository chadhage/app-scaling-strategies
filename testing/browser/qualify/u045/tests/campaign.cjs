'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const {inventory} = require('./inventory.cjs');
const {sha} = require('./parser.cjs');
const {load,run,probes,currentFile} = require('./semantic-probes.cjs');
const {scopedPair} = require('./scoped-pairs.cjs');
const deadline = Date.parse(process.env.U045_FIXED_DEADLINE);
const work = process.env.U045_WORK;
const source = fs.readFileSync(currentFile,'utf8');
const own = path.join(work,'mutation');
const campaignName = process.argv[2] || 'campaign-01';
const output = path.join(own,campaignName);
if(!Number.isFinite(deadline) || !work || Date.now() >= deadline) throw new Error('U045 fixed mutation admission is unavailable');
if(fs.existsSync(output)) throw new Error('U045 mutation evidence is immutable');
fs.mkdirSync(output,{recursive:true});
const controller = new AbortController();
const watch = setTimeout(() => controller.abort(new Error('U045_FIXED_DEADLINE')),Math.max(1,deadline-Date.now()));
watch.unref();
const domain = inventory();
fs.writeFileSync(path.join(output,'inventory.json'),`${JSON.stringify(domain,null,2)}\n`,{flag:'wx'});
const harnessInputs=['campaign.cjs','semantic-probes.cjs','scoped-pairs.cjs','inventory.cjs','domain-oracle.cjs','parser.cjs','support.cjs','build-head.cjs','fixtures\\parent-baseline.json']
  .map(file => ({file,sha256:sha(fs.readFileSync(path.join(__dirname,file)))}));
fs.writeFileSync(path.join(output,'harness-inputs-before.json'),`${JSON.stringify(harnessInputs,null,2)}\n`,{flag:'wx'});
const write = (file,value) => fs.writeFileSync(path.join(output,file),`${JSON.stringify(value,null,2)}\n`,{flag:'wx'});
async function osCases(text,id) {
  const file=path.join(output,`${id}.os-source.cjs.txt`);
  fs.writeFileSync(file,text,{flag:'wx'});
  const usage=require(currentFile).USAGE;
  const cases=[];
  for(const [args,wanted] of [[['--help'],0],[['--unknown'],2]]) {
    if(controller.signal.aborted || Date.now() >= deadline) return {status:'NON_KILL_DEADLINE',cases};
    const result=await new Promise(resolve => {
      const out=[],err=[];
      let timeout=false;
      const child=cp.spawn(process.execPath,['--require',path.join(__dirname,'mutant-loader.cjs'),currentFile,...args],{
        windowsHide:true,stdio:['ignore','pipe','pipe'],
        env:{...process.env,U045_MUTATION_CURRENT_FILE:currentFile,U045_MUTATION_SOURCE_FILE:file,
          U045_MUTATION_SOURCE_SHA256:sha(text),U045_MUTATION_ORIGINAL_SHA256:sha(source)},
      });
      const timer=setTimeout(() => {timeout=true;child.kill();},Math.max(1,Math.min(30000,deadline-Date.now())));
      child.stdout.on('data',chunk => out.push(chunk));child.stderr.on('data',chunk => err.push(chunk));
      child.on('error',error => {clearTimeout(timer);resolve({fault:error.message});});
      child.on('close',(code,signal) => {clearTimeout(timer);resolve({
        code,signal,timeout,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8'),
      });});
    });
    cases.push({args,...result});
    if(result.timeout || result.fault || result.signal) return {status:'NON_KILL_OS_FAULT_OR_TIMEOUT',cases};
    try {
      assert.equal(result.code,wanted,'U045 causal actual OS current entry preserves the public exit code');
      if(wanted === 0) assert.equal(result.stdout,usage,'U045 causal actual OS --help writes the complete current help');
      else assert.ok(result.stderr.includes(usage),'U045 causal actual OS usage refusal writes the complete current help');
    } catch(error) {
      if(error.code === 'ERR_ASSERTION') return {status:'KILLED',killer:'U045 causal actual OS current --help/usage entry',error:{code:error.code,message:error.message},cases};
      throw error;
    }
  }
  return {status:'SURVIVOR',cases};
}
async function main() {
  const pristine=await run(load(source));
  write('pristine.json',pristine);
  if(pristine.status !== 'SURVIVOR' || pristine.passed.length !== probes.length) throw new Error('Pristine identical-environment semantic contract is NONPASS');
  const pristineOs=await osCases(source,'pristine');
  write('pristine-os.json',pristineOs);
  if(pristineOs.status !== 'SURVIVOR') throw new Error('Pristine actual OS entry contract is NONPASS');
  const results=[];
  for(const definition of domain.sites) {
    if(controller.signal.aborted || Date.now() >= deadline) break;
    const changed=source.slice(0,definition.start)+definition.replacement+source.slice(definition.end);
    let outcome;
    if(definition.identity) outcome={status:'NON_KILL_IDENTITY'};
    else if(!definition.compiled) outcome={status:'NON_KILL_SYNTAX',error:definition.syntaxError};
    else {
      try {outcome=await run(load(changed));}
      catch(error) {outcome={status:'NON_KILL_UNEXPECTED_FAULT',error:{name:error.name,code:error.code,message:error.message}};}
    }
    if(outcome.status === 'SURVIVOR' && /(?:require\.main|process\.exitCode)/.test(definition.original)) {
      outcome=await osCases(changed,definition.id);
    }
    const pair=outcome.status === 'KILLED' ? null : await scopedPair(definition);
    const row={id:definition.id,key:definition.key,kind:definition.kind,type:definition.type,line:definition.line,
      sourceSha256:definition.sourceSha256,mutantSha256:definition.mutantSha256,outcome,pair};
    results.push(row);
    fs.appendFileSync(path.join(output,'results.jsonl'),`${JSON.stringify(row)}\n`);
    if(results.length % 50 === 0) process.stdout.write(`${JSON.stringify({completed:results.length,total:domain.sites.length})}\n`);
  }
  const killed=results.filter(row => row.outcome.status === 'KILLED').length;
  const paired=results.filter(row => row.pair?.status === 'RUNNABLE_SCOPED_PAIR').length;
  const remaining=results.filter(row => row.outcome.status !== 'KILLED' && row.pair?.status !== 'RUNNABLE_SCOPED_PAIR');
  const summary={schema:'U045-causal-mutation-campaign/1',sourceSha256:sha(source),parser:domain.parser,total:domain.sites.length,
    executed:results.length,killed,runnableScopedPairs:paired,remaining:remaining.map(row => ({id:row.id,key:row.key,status:row.outcome.status,pairStatus:row.pair?.status})),
    unexecuted:domain.sites.slice(results.length).map(row => row.key),deadlineUtc:new Date(deadline).toISOString(),
    harnessInputs,harnessStable:harnessInputs.every(input => sha(fs.readFileSync(path.join(__dirname,input.file))) === input.sha256),
    allClosed:results.length === domain.sites.length && remaining.length === 0,
    noDefaultEquivalence:true,nonKillsNeverRenamedKills:true,resultsSha256:sha(fs.readFileSync(path.join(output,'results.jsonl')))};
  summary.allClosed=summary.allClosed && summary.harnessStable;
  write('summary.json',summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if(!summary.allClosed) process.exitCode=1;
}
main().catch(error => {process.stderr.write(`${error.stack}\n`);process.exitCode=1;}).finally(() => clearTimeout(watch));
