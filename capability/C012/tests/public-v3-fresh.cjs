'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {run,remaining}=require('./budget.cjs');
const {copyTree,list,physical}=require('./source.cjs');
const {representation}=require('./representations.cjs');
const {sha}=require('./public-v3-transport.cjs');
const ns=path.resolve(__dirname,'..'),freezeFile=process.env.C012_PUBLIC_FREEZE,output=process.env.C012_PUBLIC_FRESH_OUTPUT;
assert.ok(freezeFile&&output);remaining(60000);fs.mkdirSync(output,{recursive:false});
const freeze=JSON.parse(fs.readFileSync(freezeFile)),work=path.join(process.env.C012_PRIVATE_ROOT,'w-public-v3');
fs.mkdirSync(work);const own=physical(work),reports=[];
try{for(const kind of ['lf','crlf']){
  remaining(60000);
  const root=path.join(work,kind),target=path.join(root,'capability','C012');fs.mkdirSync(path.dirname(target),{recursive:true});copyTree(ns,target);
  for(const row of freeze.sources){const bytes=fs.readFileSync(path.join(path.dirname(freezeFile),row.artifact));assert.equal(sha(bytes),row.sha256);fs.writeFileSync(path.join(target,row.path),representation(row.path,bytes,kind));}
  for(const row of require('../imports.json').entries){const file=path.join(root,row.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,representation(row.path,fs.readFileSync(path.join(path.dirname(freezeFile),'imports',row.path+'.source.txt')),kind),{flag:'wx'});}
  const before=list(target),result=run(['capability\\C012\\tests\\public-v3-suite.cjs'],{cwd:root,env:{C012_FRESH_KIND:kind,C012_TRANSPORT_TARGET:target,C012_PUBLIC_CANONICAL_NAMESPACE:ns},timeout:1500000});
  for(const stream of ['stdout','stderr'])fs.writeFileSync(path.join(output,kind+'.'+stream+'.raw'),result[stream]||'',{flag:'wx'});
  const text=(result.stdout||'').toString(),summary=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,Number(new RegExp('^# '+key+' (\\d+)$','m').exec(text)?.[1]??-1)]));
  reports.push({kind,exit:result.status,error:result.error?.code||null,signal:result.signal,summary,sourceSet:before,
    stdoutSha256:sha(result.stdout||''),stderrSha256:sha(result.stderr||''),historicalDataByteNormalized:false});
  assert.deepEqual(list(target),before);assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,String(result.stderr));assert.equal(summary.tests,summary.pass);assert.ok(summary.tests>=44);
}}finally{assert.deepEqual(physical(work),own);fs.rmSync(work,{recursive:true,force:false});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({schema:'C012-public-v3-complete-fresh-source/3',reports,workspaceRemoved:!fs.existsSync(work),pass:reports.length===2&&reports.every(row=>row.exit===0&&!row.error&&!row.signal)},null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({kinds:reports.map(row=>row.kind),summary:reports.map(row=>row.summary),removed:true}));
