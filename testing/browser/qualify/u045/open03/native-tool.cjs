'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const timers = require('node:timers/promises');
const cp = require('node:child_process');
const work = process.env.U045_WORK;
const deadline = Date.parse(process.env.U045_FIXED_DEADLINE);
if(process.env.U045_NATIVE_ADMITTED !== '1' || !work || !Number.isFinite(deadline) || Date.now() >= deadline) throw new Error('U045 native admission is missing or expired');
const {request} = require(path.join(work,'process-preload-v2.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const EXPECTED_BINARY = 'd258e512aa24947cfbef0c0033d8c3cd56ecb40f7b2ad59802fa75c4e4f3324d';
const freeze = JSON.parse(fs.readFileSync(process.env.U045_FREEZE_FILE,'utf8'));
assert.equal(sha(fs.readFileSync(path.join(__dirname,'..','current.cjs'))),freeze.production[0].sha256,'verify the externally frozen bootstrap bytes before loading them');
const current = require('../current.cjs');
const output = path.join(work,'native','campaign-01');
if(fs.existsSync(output)) throw new Error('Native evidence is immutable and the one admission cannot be silently retried');
fs.mkdirSync(output,{recursive:true});
const controller = new AbortController();
const watch=setTimeout(() => controller.abort(new Error('U045_FIXED_DEADLINE')),Math.max(1,deadline-Date.now()));
watch.unref();
const result={schema:'U045-final-source-native-success-and-injected-cleanup/1',startedAtUtc:new Date().toISOString(),
  sourceSha256:sha(fs.readFileSync(path.join(__dirname,'..','current.cjs'))),headSha256:freeze.headSha256,
  host:{logicalProcessors:os.cpus().length,totalMemory:os.totalmem(),freeMemory:os.freemem(),shared:true,reservedQuietHost:false},
  browserConcurrency:1,policy:'Unchanged accepted 156 seal and 157 addendum; no new major, package, cache, or browser-policy fallback',
  cases:[],unexpectedFailures:[]};
function admit() {
  if(controller.signal.aborted || Date.now() >= deadline) throw new Error('U045_FIXED_DEADLINE: no new native work');
}
function save() {fs.writeFileSync(path.join(output,'progress.json'),`${JSON.stringify(result,null,2)}\n`);}
async function qualification(label) {
  admit();
  const stdout={text:'',write(value){this.text+=value;}},stderr={text:'',write(value){this.text+=value;}};
  const timeout=Math.max(1,Math.min(60000,deadline-Date.now()-1000));
  const code=await current.main(['--timeout-ms',String(timeout)],{stdout,stderr});
  const report=JSON.parse(stdout.text);
  fs.writeFileSync(path.join(output,`${label}.stdout.raw`),stdout.text,{flag:'wx'});
  fs.writeFileSync(path.join(output,`${label}.stderr.raw`),stderr.text,{flag:'wx'});
  fs.writeFileSync(path.join(output,`${label}.json`),`${JSON.stringify({exitCode:code,report},null,2)}\n`,{flag:'wx'});
  assert.equal(code,0,stderr.text);
  assert.equal(report.ok,true);
  assert.equal(report.major,157);
  assert.equal(report.signature.status,'Valid');
  assert.equal(report.signature.publisher,'Microsoft Corporation');
  assert.equal(report.sha256,EXPECTED_BINARY);
  assert.equal(sha(fs.readFileSync(report.path)),EXPECTED_BINARY);
  return report;
}
function census(phase) {
  admit();
  const answer=request('journal-native-snapshot',process.pid,{phase});
  assert.ok(answer.roots.length > 0,'the exact owned browser launch root was journalled before heavy work');
  assert.ok(answer.identities.length > 0,'the actual native child census is nonempty');
  return answer;
}
async function cleanup(context,profile,marker,record) {
  const failures=[];
  if(context) {
    try {await context.close();} catch(error) {failures.push(`Context close failed: ${error.message}`);}
  }
  let remaining=request('native-remaining',process.pid).remaining;
  for(let turn=0;turn<10 && remaining.length && Date.now() < deadline;turn+=1) {
    await timers.setTimeout(50);
    remaining=request('native-remaining',process.pid).remaining;
  }
  if(remaining.length) {
    failures.push(`Native identities remained after graceful close: ${remaining.map(value => value.pid).join(',')}`);
    for(const root of request('native-roots',process.pid).roots) request('kill-tree',root.identity.pid,'explicit exact owned cleanup after a recorded graceful-close failure');
  }
  const after=request('native-remaining',process.pid).remaining;
  if(after.length) failures.push('Exact native cleanup remained incomplete');
  if(fs.existsSync(profile)) {
    const actual=JSON.parse(fs.readFileSync(path.join(profile,'.u045-owner.json'),'utf8'));
    assert.deepEqual(actual,marker,'never remove a profile without its exact original ownership nonce');
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
  record.cleanup={remainingExactIdentities:after,profileRemoved:!fs.existsSync(profile),failures};
  assert.equal(after.length,0);
  assert.equal(fs.existsSync(profile),false);
  assert.deepEqual(failures,[],'extra cleanup failures remain blocking, even when exact emergency cleanup succeeds');
}
async function nativeCase(chromium,edge,injectFailure) {
  admit();
  const nonce=crypto.randomUUID();
  const profileRoot=path.join(work,'native','profiles');
  fs.mkdirSync(profileRoot,{recursive:true});
  const profile=path.join(profileRoot,`p-${nonce.replace(/-/g,'').slice(0,16)}`);
  fs.mkdirSync(profile);
  const marker={pid:process.pid,capture:process.env.U045_CAPTURE_NAME,nonce};
  fs.writeFileSync(path.join(profile,'.u045-owner.json'),JSON.stringify(marker),{flag:'wx'});
  request('profile',process.pid,{path:profile});
  const record={name:injectFailure?'injected-failure-cleanup':'current-native-success',profile,startedAtUtc:new Date().toISOString()};
  result.cases.push(record);save();
  let context;
  let expectedFailure=false;
  try {
    assert.equal(sha(fs.readFileSync(edge.path)),EXPECTED_BINARY,'no updated 158 or alternate executable can be launched');
    context=await chromium.launchPersistentContext(profile,{
      executablePath:edge.path,headless:true,chromiumSandbox:true,serviceWorkers:'block',
      timeout:Math.max(1,Math.min(60000,deadline-Date.now()-1000)),
      env:{...process.env,TEMP:profile,TMP:profile,TMPDIR:profile},
    });
    const page=context.pages()[0] || await context.newPage();
    const protocol=await context.newCDPSession(page);
    const facts=await protocol.send('Browser.getVersion');
    await protocol.detach();
    const version=/^[A-Za-z]+\/(\d+\.\d+\.\d+\.\d+)$/.exec(facts.product);
    assert.ok(version,`The actual installed browser exposes its full native version: ${facts.product}`);
    assert.equal(version[1],edge.version);
    record.nativeVersionFacts=facts;
    await page.route('**/*',route => route.abort());
    await page.setContent('<!doctype html><meta charset="utf-8"><title>U045 local fixture</title><button id="probe" onclick="this.textContent=String(Number(this.textContent)+1)">0</button>');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before=census(`${record.name}:before-heavy-assertions`);
    record.beforeHeavy=before.identities;
    await page.locator('#probe').click();
    assert.equal(await page.title(),'U045 local fixture');
    assert.equal(await page.locator('#probe').textContent(),'1');
    const after=census(`${record.name}:after-heavy-assertions`);
    const knownBefore=new Set(before.identities.map(identity => `${identity.pid}:${identity.creationFileTime}`));
    const late=after.identities.filter(identity => !knownBefore.has(`${identity.pid}:${identity.creationFileTime}`));
    record.lateBirthsAfterHeavy=late;
    assert.deepEqual(late,[],'late first-observed native births are an actual blocking census limitation');
    record.version=version[1];
    record.pageAssertionsPassed=true;
    if(injectFailure) throw Object.assign(new Error('Actual injected failure after the current signed browser launched and passed page assertions'),{code:'U045_INJECTED_NATIVE_FAILURE'});
    record.success=true;
  } catch(error) {
    record.error={name:error.name,code:error.code,message:error.message};
    if(injectFailure && error.code === 'U045_INJECTED_NATIVE_FAILURE') {
      expectedFailure=true;record.expectedInjectedFailureObserved=true;
    } else {
      result.unexpectedFailures.push({case:record.name,...record.error});
      throw error;
    }
  } finally {
    try {await cleanup(context,profile,marker,record);}
    finally {record.completedAtUtc=new Date().toISOString();save();}
  }
  if(injectFailure) assert.equal(expectedFailure,true);
}
async function main() {
  assert.equal(result.sourceSha256,freeze.production[0].sha256,'actual final production source epoch, not old native proof');
  assert.equal(current.verifyHead({expectedHeadSha256:freeze.headSha256}).ok,true,'the actual complete final source head');
  const packageFile=fs.realpathSync(require.resolve('playwright/package.json'));
  assert.equal(packageFile.toLowerCase(),fs.realpathSync(path.join(process.env.NODE_PATH,'playwright','package.json')).toLowerCase(),'only the existing explicitly admitted Playwright installation is used');
  assert.equal(require('playwright/package.json').version,'1.56.1');
  const {chromium}=require('playwright');
  result.playwrightVersion=require('playwright/package.json').version;
  const before=await qualification('current-before');
  result.edge={path:before.path,version:before.version,major:before.major,sha256:before.sha256,signature:before.signature};
  result.playwrightPackage={path:packageFile,sha256:sha(fs.readFileSync(packageFile))};
  admit();
  const legacyArgs=['--test','--test-concurrency=1','--test-reporter=tap','testing\\browser\\qualify\\tests\\qualify.machine.test.cjs'];
  const legacy=await new Promise(resolve => {
    const out=[],err=[];
    let timedOut=false;
    const env={...process.env};
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const child=cp.spawn(process.execPath,legacyArgs,{cwd:process.env.U045_PREDECESSOR_ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(() => {timedOut=true;child.kill();},Math.max(1,Math.min(240000,deadline-Date.now()-1000)));
    child.stdout.on('data',chunk => out.push(chunk));child.stderr.on('data',chunk => err.push(chunk));
    child.on('error',error => {clearTimeout(timer);resolve({fault:error.message,timedOut});});
    child.on('close',(exitCode,signal) => {clearTimeout(timer);resolve({exitCode,signal,timedOut,stdout:Buffer.concat(out),stderr:Buffer.concat(err)});});
  });
  if(legacy.stdout) fs.writeFileSync(path.join(output,'immutable-legacy-machine.stdout.raw'),legacy.stdout,{flag:'wx'});
  if(legacy.stderr) fs.writeFileSync(path.join(output,'immutable-legacy-machine.stderr.raw'),legacy.stderr,{flag:'wx'});
  const text=legacy.stdout?.toString('utf8') || '';
  result.immutableLegacyNativeMachine={role:'Unchanged old-version native machine tests, not relabelled current tests',command:[process.execPath,...legacyArgs],
    exitCode:legacy.exitCode,signal:legacy.signal,timedOut:legacy.timedOut,fault:legacy.fault,
    counts:Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name => {
      const match=new RegExp(`^# ${name} (\\d+)\\s*$`,'m').exec(text);return [name,match?Number(match[1]):null];
    }))};
  assert.equal(legacy.exitCode,0,legacy.stderr?.toString('utf8'));
  assert.equal(legacy.timedOut,false);
  assert.deepEqual(result.immutableLegacyNativeMachine.counts,{tests:6,pass:6,fail:0,cancelled:0,skipped:0,todo:0});
  await nativeCase(chromium,before,false);
  await nativeCase(chromium,before,true);
  const after=await qualification('current-after');
  assert.deepEqual([after.path,after.version,after.sha256],[before.path,before.version,before.sha256]);
  assert.equal(current.verifyHead({expectedHeadSha256:freeze.headSha256}).ok,true,'native work did not alter the final source footprint');
  result.completedAtUtc=new Date().toISOString();
  result.passed=result.cases.length === 2 && result.cases.every(item => item.cleanup.profileRemoved && item.cleanup.remainingExactIdentities.length === 0)
    && result.unexpectedFailures.length === 0;
}
main().catch(error => {
  result.passed=false;
  result.fatal={name:error.name,code:error.code,message:error.message,stack:error.stack};
  process.exitCode=1;
}).finally(() => {
  clearTimeout(watch);result.completedAtUtc=new Date().toISOString();
  fs.writeFileSync(path.join(output,'result.json'),`${JSON.stringify(result,null,2)}\n`,{flag:'wx'});
  process.stdout.write(`${JSON.stringify({passed:result.passed,cases:result.cases.map(item => ({name:item.name,success:item.success,expectedFailure:item.expectedInjectedFailureObserved,cleanup:item.cleanup})),fatal:result.fatal})}\n`);
});
