'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{sha}=require('./u073-seal.cjs');
const namespace=path.resolve(__dirname,'..'),candidate=path.resolve(namespace,'..','..');
const repo=process.env.C011_GIT_REPOSITORY,output=process.env.U073_CONSUMER_OUTPUT,scratch=process.env.U053_SCRATCH_ROOT;
assert.ok(repo&&path.isAbsolute(repo)&&output&&path.isAbsolute(output)&&scratch&&path.isAbsolute(scratch));
assert.ok(!path.relative(path.join(candidate,'private'),output).startsWith('..'));
assert.ok(!path.relative(path.join(candidate,'private'),scratch).startsWith('..'));
assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(scratch),false);fs.mkdirSync(scratch);
const freezePath=path.join(namespace,'evidence','u073','current','source-freeze.json'),freeze=JSON.parse(fs.readFileSync(freezePath));
const check=()=>freeze.consumerSources.every(pin=>sha(fs.readFileSync(path.join(repo,...pin.path.split('/'))))===pin.sha256);
assert.equal(check(),true,'Actual current C009 regression source, including its whole test set, matches the new freeze');
const env={...process.env};for(const key of ['NODE_OPTIONS','NODE_TEST_CONTEXT','NODE_V8_COVERAGE'])delete env[key];
const args=[path.join(repo,'capability','C009','tests','u053-suite.cjs'),'suite'];
let result;
try{
  result=spawnSync(process.execPath,args,{cwd:repo,env,windowsHide:true,timeout:1200000,maxBuffer:64*1024*1024});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  const text=(result.stdout||Buffer.alloc(0)).toString(),summary=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo']
    .map(key=>[key,Number(new RegExp('^# '+key+' (\\d+)$','m').exec(text)?.[1]??-1)]));
  const report={schema:'U073-current-C009-regression/1',sourceRole:'unchanged accepted C009 producer regression; no unproven C011 executable consumer claim',
    sourceFreezeSha256:sha(fs.readFileSync(freezePath)),sourceFiles:freeze.consumerSources,sourceBytesMatchBeforeAndAfter:check(),
    code:result.status,signal:result.signal,spawnError:result.error?.message||null,command:[process.execPath,...args],summary,
    stdoutSha256:sha(result.stdout||Buffer.alloc(0)),stderrSha256:sha(result.stderr||Buffer.alloc(0))};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  assert.equal(result.error,undefined);assert.equal(result.status,0);assert.equal(report.sourceBytesMatchBeforeAndAfter,true);
  assert.ok(summary.tests>0);assert.equal(summary.pass,summary.tests);
  for(const key of ['fail','cancelled','skipped','todo'])assert.equal(summary[key],0);
}finally{
  const leftovers=fs.readdirSync(scratch);
  try{assert.deepEqual(leftovers,[],'Every C009-owned nested fixture and drive alias was cleaned by its exact owner');}
  finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
