'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {fileURLToPath} = require('node:url');
const deadline=Date.parse(process.env.U045_FIXED_DEADLINE);
if(!Number.isFinite(deadline) || Date.now() >= deadline || !process.env.U045_WORK) throw new Error('U045 coverage admission is missing or expired');
const namespace=path.resolve(__dirname,'..','..');
const output=path.join(process.env.U045_WORK,'coverage',process.argv[2] || 'campaign-01');
if(fs.existsSync(output)) throw new Error('Coverage evidence is immutable');
fs.mkdirSync(output,{recursive:true});
const sha=bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const plan=[
  ['adapters.cjs',['adapters','shell','timeouts','decode-base64']],
  ['addendum.cjs',['addendum','addendum-anomalies','addendum-cli','checklist','qualify-addendum']],
  ['cli.cjs',['cli','cli-target','cli-write','cli-line','cli-catch','survivors','survivors-r3']],
  ['qualify.cjs',['qualify','fail-closed','qualify-addendum','qualify-recheck','qualify-recheck','n4-guards']],
  ['requalify.cjs',['requalify','requalify-counts','requalify-flow','requalify-tree','requalify-verdict']],
  ['subject.cjs',['subject','subject-lookalike']],
  ['version.cjs',['version']],
  ['u045\\current.cjs',null],
];
const controller=new AbortController();
const watch=setTimeout(() => controller.abort(new Error('U045_FIXED_DEADLINE')),Math.max(1,deadline-Date.now()));
watch.unref();
function loadedSource(directory,target) {
  const found=[];
  for(const name of fs.readdirSync(directory).filter(name => name.endsWith('.json'))) {
    const raw=fs.readFileSync(path.join(directory,name));
    const data=JSON.parse(raw);
    for(const entry of data.result || []) {
      if(!entry.url.startsWith('file:')) continue;
      const actual=path.resolve(fileURLToPath(entry.url));
      if(actual.toLowerCase() !== target.toLowerCase()) continue;
      const ranges=entry.functions.flatMap(fn => fn.ranges);
      found.push({record:name,recordSha256:sha(raw),scriptId:entry.scriptId,url:entry.url,functions:entry.functions.length,
        positiveRanges:ranges.filter(range => range.count > 0).length,executed:ranges.some(range => range.count > 0)});
    }
  }
  return found;
}
async function gate(relative,names) {
  if(controller.signal.aborted || Date.now() >= deadline) return {relative,passed:false,unexecuted:true};
  const target=path.resolve(namespace,relative),name=path.basename(relative),own=name === 'current.cjs';
  const cwd=own ? path.resolve(namespace,'u045') : namespace;
  const tests=own
    ? fs.readdirSync(path.join(cwd,'tests')).filter(file => file.endsWith('.test.cjs')).sort().map(file => `tests\\${file}`)
    : [...new Set(names)].map(name => `tests\\${name}.test.cjs`);
  const args=['--test','--test-concurrency=1','--test-reporter=tap','--experimental-test-coverage',
    `--test-coverage-include=${name}`,'--test-coverage-lines=85','--test-coverage-branches=85','--test-coverage-functions=85',...tests];
  const folder=path.join(output,name);
  fs.mkdirSync(folder);
  const v8=path.join(folder,'v8');fs.mkdirSync(v8);
  const before=fs.readFileSync(target),out=[],err=[];
  let timedOut=false;
  const env={...process.env,NODE_V8_COVERAGE:v8};
  delete env.NODE_TEST_CONTEXT;
  const result=await new Promise(resolve => {
    const child=cp.spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(() => {timedOut=true;child.kill();},Math.max(1,Math.min(600000,deadline-Date.now())));
    child.stdout.on('data',chunk => out.push(chunk));child.stderr.on('data',chunk => err.push(chunk));
    child.on('error',error => {clearTimeout(timer);resolve({exitCode:null,fault:error.message});});
    child.on('close',(exitCode,signal) => {clearTimeout(timer);resolve({exitCode,signal});});
  });
  const stdout=Buffer.concat(out),stderr=Buffer.concat(err),text=stdout.toString('utf8');
  fs.writeFileSync(path.join(folder,'stdout.raw'),stdout,{flag:'wx'});
  fs.writeFileSync(path.join(folder,'stderr.raw'),stderr,{flag:'wx'});
  const row=text.split(/\r?\n/).find(line => new RegExp(`^# ${name.replace(/\./g,'\\.')}\\s+\\|`).test(line));
  const percentages=row ? row.split('|').slice(1,4).map(value => Number(value.trim())) : [];
  const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name => {
    const match=new RegExp(`^# ${name} (\\d+)\\s*$`,'m').exec(text);return [name,match?Number(match[1]):null];
  }));
  const loaded=loadedSource(v8,target);
  const sourceStable=sha(before) === sha(fs.readFileSync(target));
  const passed=result.exitCode === 0 && !timedOut && !result.signal && !result.fault && sourceStable &&
    counts.tests > 0 && counts.pass === counts.tests && counts.fail === 0 && counts.skipped === 0 && counts.todo === 0 && counts.cancelled === 0 &&
    percentages.length === 3 && percentages.every(value => Number.isFinite(value) && value >= 85) && loaded.some(entry => entry.executed);
  const summary={schema:'U045-literal-loaded-per-file-coverage/1',relative,role:own?'current production':'unchanged predecessor production',
    command:[process.execPath,...args],cwd,sourceSha256:sha(before),sourceBytes:before.length,sourceStable,
    ...result,timedOut,counts,coverage:{lines:percentages[0],branches:percentages[1],functions:percentages[2],literalRow:row},
    actualLoadedV8:loaded,unloadedFilesCountAsZero:true,vmInstrumentedSourcesUseDistinctUrls:true,passed,
    stdout:{bytes:stdout.length,sha256:sha(stdout)},stderr:{bytes:stderr.length,sha256:sha(stderr)}};
  fs.writeFileSync(path.join(folder,'result.json'),`${JSON.stringify(summary,null,2)}\n`,{flag:'wx'});
  process.stdout.write(`${JSON.stringify({file:relative,passed,counts,coverage:summary.coverage,actualLoadedRecords:loaded.length})}\n`);
  return summary;
}
async function main() {
  const results=[];
  for(const [relative,names] of plan) results.push(await gate(relative,names));
  const summary={schema:'U045-all-applicable-production-coverage/1',production:plan.map(([file]) => file),results,
    allPassed:results.length === plan.length && results.every(result => result.passed),deadlineUtc:new Date(deadline).toISOString()};
  fs.writeFileSync(path.join(output,'summary.json'),`${JSON.stringify(summary,null,2)}\n`,{flag:'wx'});
  if(!summary.allPassed) process.exitCode=1;
}
main().catch(error => {process.stderr.write(`${error.stack}\n`);process.exitCode=1;}).finally(() => clearTimeout(watch));
