'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const WORKER_DEADLINE='2026-11-11T23:06:54.4385459Z';
const DEFAULT_LOCAL_MS=1800000;
function policy({now=Date.now(),localDeadline,localMs=DEFAULT_LOCAL_MS,privateWorker=false}={}){
  if(!Number.isSafeInteger(localMs)||localMs<1||localMs>7200000)throw Error('explicit local verification budget must be 1..7200000 ms');
  const local=localDeadline?Date.parse(localDeadline):now+localMs;
  if(!Number.isFinite(local))throw Error('invalid local verification deadline');
  const end=privateWorker?Math.min(local,Date.parse(WORKER_DEADLINE)):local;
  return {end,localDeadline:new Date(local).toISOString(),privateWorker,scope:'local-verification-failure-watchdog-only',
    workerAuthority:false,cloudAuthority:false,expenditureAuthority:false,workerDeadlineExtended:false};
}
const active=policy({localDeadline:process.env.C012_LOCAL_VERIFY_DEADLINE,
  localMs:process.env.C012_LOCAL_VERIFY_MS?Number(process.env.C012_LOCAL_VERIFY_MS):DEFAULT_LOCAL_MS,
  privateWorker:process.env.C012_PRIVATE_WORKER==='1'});
const DEADLINE=new Date(active.end).toISOString();
function remaining(reserve=0){const value=active.end-Date.now()-reserve;if(!(value>0))throw Object.assign(new Error('local verification watchdog / original private-worker hardstop'),{code:'C012_VERIFICATION_DEADLINE'});return value;}
function environment(extra={}){const env={...process.env,...extra};delete env.NODE_TEST_CONTEXT;delete env.NODE_V8_COVERAGE;return env;}
function run(args,options={}){
  const {env:extra,...settings}=options;
  return spawnSync(process.execPath,args,{cwd:path.resolve(__dirname,'..','..','..'),windowsHide:true,maxBuffer:64*1024*1024,
    ...settings,env:environment(extra),timeout:Math.min(remaining(60000),options.timeout||600000)});
}
function write(file,value){remaining();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
module.exports={DEADLINE,WORKER_DEADLINE,policy,remaining,environment,run,write,active};
