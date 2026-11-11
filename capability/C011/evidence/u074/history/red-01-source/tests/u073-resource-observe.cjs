'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),cp=require('node:child_process'),Module=require('node:module');
const {randomUUID}=require('node:crypto'),{sha}=require('./u073-resource-source.cjs');
function atomicJson(file,value){
  const partial=file+'.partial';
  fs.writeFileSync(partial,JSON.stringify(value)+'\n',{flag:'wx'});
  fs.renameSync(partial,file);
}
const directory=process.env.C011_ACCEPT_OBSERVER_DIR;
if(!directory)throw new Error('Missing explicitly owned observer directory');
fs.mkdirSync(directory,{recursive:true});
const source=JSON.parse(fs.readFileSync(process.env.C011_ACCEPT_SOURCE)),script=process.argv[1]||'',tag=process.pid+'-'+randomUUID();
const role=path.basename(script),started=process.cpuUsage(),children=[],matrices=[],loaded=new Map();
const record={schema:'U073-current-resource-observation/1',pid:process.pid,ppid:process.ppid,tag,role,argv:process.argv.slice(1),responses:[],
  startedAtUtc:new Date().toISOString(),heapLimit:v8.getHeapStatistics().heap_size_limit,execArgv:process.execArgv,
  children,matrices,pendingClientFallbacks:0,watchdogKills:0,observationOverflow:false};
atomicJson(path.join(directory,tag+'.start.json'),record);
function metrics(state,message){
  if(!message||message.type!=='stats')return;
  state.statsCount=(state.statsCount||0)+1;
  if(state.statsCount===1)state.firstStats=message;
  if(state.statsCount===2)state.secondStats=message;
  state.lastStats=message;
  state.maxHeapUsed=Math.max(state.maxHeapUsed||0,message.heapUsed||0);
  state.maxRss=Math.max(state.maxRss||0,message.rss||0);
  state.maxBytesRead=Math.max(state.maxBytesRead||0,message.bytesRead||0);
}
function own(child,args,kind){
  if(children.length>=4096){record.observationOverflow=true;throw new Error('Bounded observer child count exceeded');}
  const state={kind,args,pid:child.pid,startedAtUtc:new Date().toISOString(),closed:false,killCalls:[]};children.push(state);
  child.on('message',message=>{
    metrics(state,message);
    if(message?.type==='listening')state.port=message.port;
  });
  for(const name of ['stdout','stderr'])if(child[name]){
    const file=path.join(directory,tag+'.child-'+child.pid+'.'+name+'.original');
    let fd=null,bytes=0;
    child[name].on('data',chunk=>{
      if(fd===null)fd=fs.openSync(file,'wx');
      bytes+=chunk.length;
      if(bytes>16*1024*1024){record.observationOverflow=true;child.kill();return;}
      fs.writeSync(fd,chunk);
    });
    child[name].once('close',()=>{if(fd!==null)fs.closeSync(fd);});
  }
  const kill=child.kill;
  child.kill=function(...values){
    const stack=new Error().stack;
    state.killCalls.push({signal:values[0]||'SIGTERM',stack});
    if(stack.includes('Timeout._onTimeout'))record.watchdogKills++;
    return kill.apply(this,values);
  };
  child.once('close',(code,signal)=>Object.assign(state,{closed:true,code,signal,closedAtUtc:new Date().toISOString()}));
  return child;
}
const spawn=cp.spawn,fork=cp.fork;
cp.spawn=function(command,args,options){
  let actual=args;
  if(Array.isArray(args)&&args.some(arg=>typeof arg==='string'&&path.basename(arg)==='attacker.cjs')){
    actual=['--max-old-space-size=24','--max-semi-space-size=4',...args.filter(arg=>!/^--max-(?:old|semi)-space-size=/.test(arg))];
  }
  return own(spawn.call(this,command,actual,options),actual,'spawn');
};
cp.fork=function(file,args,options){return own(fork.call(this,file,args,options),[file,...(args||[])],'fork');};
const load=Module._load,resolve=Module._resolveFilename,wrapped=new WeakMap();
Module._load=function(request,parent,isMain){
  const actual=load.call(this,request,parent,isMain);
  let file;try{file=resolve.call(this,request,parent);}catch{return actual;}
  if(typeof file==='string'&&source.modules[file]){
    const digest=sha(fs.readFileSync(file));
    if(digest!==source.modules[file])throw new Error('C011 immutable executed source differs: '+file);
    if(!loaded.has(file))fs.appendFileSync(path.join(directory,tag+'.loaded.jsonl'),JSON.stringify({file,sha256:digest})+'\n');
    loaded.set(file,digest);
  }
  if(file===path.join(source.namespace,'tests','matrix.cjs')){
    if(wrapped.has(actual))return wrapped.get(actual);
    const observed={...actual,async runMatrix(...args){
      const value=await actual.runMatrix(...args);
      matrices.push({config:args[1],part:args[2]?.part,cells:value.cells,problems:value.problems.length});
      return value;
    }};
    wrapped.set(actual,observed);return observed;
  }
  if(file===path.join(source.namespace,'tests','helpers.cjs')&&['flood-pending','burst'].includes(process.env.C011_ACCEPT_LEAF)){
    if(wrapped.has(actual))return wrapped.get(actual);
    const observed={...actual,async call(...args){
      const value=await actual.call(...args);
      if(record.responses.length<64)record.responses.push({method:args[2],route:args[3],status:value.status,
        items:Array.isArray(value.json?.items)?value.json.items.length:undefined,pool:value.json?.pool});
      else record.observationOverflow=true;
      return value;
    }};
    wrapped.set(actual,observed);return observed;
  }
  return actual;
};
const set=global.setTimeout;
global.setTimeout=function(callback,ms,...args){
  const stack=new Error().stack;
  if(typeof callback==='function'&&stack.includes('flood-pending.test.cjs')&&String(callback).includes('socket.destroy(); end();')){
    const operation=callback;
    callback=function(...values){record.pendingClientFallbacks++;return operation.apply(this,values);};
  }
  return set.call(this,callback,ms,...args);
};
if(process.send){
  const send=process.send;
  process.send=function(message,...args){metrics(record,message);return send.call(this,message,...args);};
}
let attacker='';
if(role==='attacker.cjs'){
  const write=process.stdout.write;
  process.stdout.write=function(chunk,...args){
    attacker+=Buffer.isBuffer(chunk)?chunk.toString():String(chunk);
    if(attacker.length>16384)record.observationOverflow=true;
    return write.call(this,chunk,...args);
  };
}
process.once('exit',code=>{
  record.exitCode=code;record.endedAtUtc=new Date().toISOString();
  record.cpu=process.cpuUsage(started);record.memory=process.memoryUsage();
  record.loadedSource=[...loaded].map(([file,sha256])=>({file,sha256}));
  if(attacker)try{record.attacker=JSON.parse(attacker.trim());}catch{record.attackerReportInvalid=true;}
  atomicJson(path.join(directory,tag+'.end.json'),record);
});
