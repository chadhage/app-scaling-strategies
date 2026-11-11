'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const TOTAL = 64;
const CONCURRENCY = 8;
const deadline = Date.parse(process.env.U045_FIXED_DEADLINE);
if(process.env.U045_RESOURCE_ADMITTED !== '64-total-at-8' || !Number.isFinite(deadline) || Date.now() >= deadline) {
  throw new Error('Exactly 64 total complete deterministic groups at eight require explicit current admission');
}
const output = path.join(process.env.U045_WORK,'resource',process.argv[2] || 'campaign-01');
if(fs.existsSync(output)) throw new Error('Resource evidence is immutable');
fs.mkdirSync(output,{recursive:true});
const controller = new AbortController();
const watch=setTimeout(() => controller.abort(new Error('U045_FIXED_DEADLINE')),Math.max(1,deadline-Date.now()));
watch.unref();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const tests=fs.readdirSync(__dirname).filter(file => file.endsWith('.test.cjs')).sort().map(file => path.join(__dirname,file));
const args=['--test','--test-concurrency=1','--test-reporter=tap',...tests];
let next=0,active=0,maximum=0;
const results=[];
function counters(text) {
  return Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name => {
    const match=new RegExp(`^# ${name} (\\d+)\\s*$`,'m').exec(text);
    return [name,match ? Number(match[1]) : null];
  }));
}
async function group(index) {
  const startedAtUtc=new Date().toISOString();
  const out=[],err=[];
  let timedOut=false;
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const result=await new Promise(resolve => {
    const child=cp.spawn(process.execPath,args,{cwd:path.resolve(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(() => {timedOut=true;child.kill();},Math.max(1,Math.min(300000,deadline-Date.now())));
    child.stdout.on('data',chunk => out.push(chunk));
    child.stderr.on('data',chunk => err.push(chunk));
    child.on('error',error => {clearTimeout(timer);resolve({exitCode:null,fault:error.message});});
    child.on('close',(exitCode,signal) => {clearTimeout(timer);resolve({exitCode,signal});});
  });
  const stdout=Buffer.concat(out),stderr=Buffer.concat(err),text=stdout.toString('utf8');
  const count=counters(text),prefix=`group-${String(index+1).padStart(2,'0')}`;
  fs.writeFileSync(path.join(output,`${prefix}.stdout.raw`),stdout,{flag:'wx'});
  fs.writeFileSync(path.join(output,`${prefix}.stderr.raw`),stderr,{flag:'wx'});
  const passed=result.exitCode === 0 && !result.signal && !result.fault && !timedOut && count.tests > 0 &&
    count.pass === count.tests && count.fail === 0 && count.cancelled === 0 && count.skipped === 0 && count.todo === 0;
  const row={group:index+1,startedAtUtc,completedAtUtc:new Date().toISOString(),command:[process.execPath,...args],...result,timedOut,
    counts:count,passed,stdout:{path:`${prefix}.stdout.raw`,bytes:stdout.length,sha256:sha(stdout)},
    stderr:{path:`${prefix}.stderr.raw`,bytes:stderr.length,sha256:sha(stderr)},
    failedTests:[...text.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1])};
  fs.writeFileSync(path.join(output,`${prefix}.json`),`${JSON.stringify(row,null,2)}\n`,{flag:'wx'});
  results.push(row);
  process.stdout.write(`${JSON.stringify({completed:results.length,group:index+1,passed,counts:count})}\n`);
}
async function worker() {
  while(next < TOTAL && !controller.signal.aborted && Date.now() < deadline) {
    const index=next++;
    active+=1;maximum=Math.max(maximum,active);
    try {await group(index);} finally {active-=1;}
  }
}
async function main() {
  const freeze=JSON.parse(fs.readFileSync(process.env.U045_FREEZE_FILE,'utf8'));
  const current=require('../current.cjs');
  if(current.verifyHead({expectedHeadSha256:freeze.headSha256}).ok !== true) throw new Error('Resource jobs require the actual complete frozen current head');
  const host={logicalProcessors:os.cpus().length,totalMemory:os.totalmem(),freeMemoryBefore:os.freemem(),sharedHost:true,reservedQuietHost:false};
  await Promise.all(Array.from({length:CONCURRENCY},worker));
  const finalHead=current.verifyHead({expectedHeadSha256:freeze.headSha256});
  results.sort((a,b) => a.group-b.group);
  const summary={schema:'U045-exact-total-resource-groups/1',totalRequired:TOTAL,concurrency:CONCURRENCY,maximumObservedActiveGroups:maximum,
    completed:results.length,passed:results.filter(row => row.passed).length,failed:results.filter(row => !row.passed).map(row => row.group),
    unexecuted:Array.from({length:TOTAL},(_,index) => index+1).filter(id => !results.some(row => row.group === id)),
    host:{...host,freeMemoryAfter:os.freemem()},standaloneBurners:0,nativeBrowsers:0,
    finalHead,allComplete:results.length === TOTAL && results.every(row => row.passed) && finalHead.ok === true,deadlineUtc:new Date(deadline).toISOString()};
  fs.writeFileSync(path.join(output,'summary.json'),`${JSON.stringify(summary,null,2)}\n`,{flag:'wx'});
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if(!summary.allComplete) process.exitCode=1;
}
main().catch(error => {process.stderr.write(`${error.stack}\n`);process.exitCode=1;}).finally(() => clearTimeout(watch));
