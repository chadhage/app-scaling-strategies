'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const file=path.resolve(__dirname,'..','..','adapters.cjs'),source=fs.readFileSync(file,'utf8'),local=createRequire(file);
const digest=crypto.createHash('sha256').update(source).digest('hex');
function fixture(){
  const timers=[],spawns=[],children=[];
  const processApi={...process,env:{},platform:'win32'};
  const fakeProcess={spawn(executable,args,options){
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
    child.stdout.setEncoding=()=>{};child.kills=0;child.kill=()=>{child.kills++;return true;};
    spawns.push({executable,args,options});children.push(child);return child;
  }};
  const requireApi=name=>name==='node:child_process'?fakeProcess:local(name);
  const module={exports:{}};
  new vm.Script(`(function(exports,require,module,__filename,__dirname){${source}\n})`,{
    filename:`u045-current03-recorded-original-adapter-${digest}.cjs`,
  }).runInNewContext({Buffer,process:processApi,console,setTimeout(fn,ms){const timer={fn,ms,cleared:false};timers.push(timer);return timer;},
    clearTimeout(timer){timer.cleared=true;}})(module.exports,requireApi,module,file,path.dirname(file));
  return {api:module.exports,timers,spawns,children};
}
test('CURRENT03 CAUSAL SHELL FAILURE: actual original runShell records a bound and nonzero stderr without elapsed startup',async()=>{
  const f=fixture(),pending=f.api.runShell({shell:'recorded-shell',args:['original'],env:{},timeoutMs:500});
  assert.equal(f.spawns.length,1);assert.equal(f.timers[0].ms,500);
  f.children[0].stderr.emit('data',Buffer.from('actual recorded diagnostic'));
  f.children[0].emit('close',3);
  await assert.rejects(pending,error=>error.code==='SHELL_FAILED'&&/3: actual recorded diagnostic/.test(error.message));
  assert.equal(f.timers[0].cleared,true);
});
test('CURRENT03 CAUSAL HANG: actual original runShell expires by a virtual callback and exactly one child kill',async()=>{
  const f=fixture(),pending=f.api.runShell({shell:'recorded-shell',args:[],env:{},timeoutMs:400});
  assert.equal(f.timers.length,1);assert.equal(f.timers[0].ms,400);
  f.timers[0].fn();
  await assert.rejects(pending,error=>error.code==='SHELL_TIMEOUT'&&/400 ms/.test(error.message));
  assert.equal(f.children[0].kills,1);
});
test('CURRENT03 CAUSAL MISSING/GARBAGE: original adapter reports typed spawn and decode failures on controlled actual boundaries',async()=>{
  const f=fixture(),pending=f.api.runShell({shell:'recorded-shell',args:[],env:{},timeoutMs:1000});
  f.children[0].emit('error',Object.assign(new Error('recorded absent executable'),{code:'ENOENT'}));
  await assert.rejects(pending,error=>error.code==='SHELL_SPAWN');
  assert.throws(()=>f.api.decodeInspection('not base64'),error=>error.code==='INSPECT_OUTPUT_INVALID');
  assert.throws(()=>f.api.decodeInspection(Buffer.from('{}').toString('base64')),error=>error.code==='INSPECT_OUTPUT_INVALID');
});
