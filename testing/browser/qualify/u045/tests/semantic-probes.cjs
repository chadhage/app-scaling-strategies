'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {sha,forms,parentBytes} = require('./build-head.cjs');
const {fixtureAdapters,report,machine,now} = require('./support.cjs');
const currentFile = path.resolve(__dirname,'..','current.cjs');
const localRequire = createRequire(currentFile);
const qualified = localRequire('../addendum.cjs');
const originalCli = localRequire('../cli.cjs');
const baseline = JSON.parse(parentBytes());
const namespace = path.resolve(__dirname,'..','..');
const ROOT = path.join(__dirname,'virtual-u045-head');
const APPEND = path.join(__dirname,'virtual-u045-append');
class ProbeFault extends Error {
  constructor(message) { super(message); this.code='U045_NONKILL_OPERATION_FAULT'; }
}
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const sink = () => ({text:'',write(value) {this.text+=value;}});
function snapshot(value) {
  if (value === undefined) return {type:'undefined'};
  if (value === null) return {type:'null'};
  if (typeof value === 'function') return {type:'function',name:value.name,length:value.length};
  if (typeof value === 'object') return {type:Array.isArray(value)?'array':'object',keys:Object.keys(value).sort()};
  return {type:typeof value,value:Number.isNaN(value)?'NaN':value};
}
function load(source,observe) {
  const state = {defaultAdapterCalls:[],cliCalls:[],requalifyCalls:[],stdout:sink(),stderr:sink(),observations:[]};
  const processApi = {argv:['node',currentFile,'--help'],env:{},stdout:state.stdout,stderr:state.stderr,exitCode:undefined};
  const defaultAdapters = options => {state.defaultAdapterCalls.push(options);return fixtureAdapters();};
  const actualLegacy = localRequire('../qualify.cjs');
  const hermeticLegacy = {...actualLegacy,qualifyEdge(options = {}) {
    const bounds=actualLegacy.resolveTimeouts(options,options.env || process.env);
    if(bounds.ok && !['now','readQualified','candidates','statFile','sha256','signature','fileVersion']
      .every(name => typeof options.adapters?.[name] === 'function')) {
      throw new ProbeFault('A mutant crossed the declared complete injected-adapter boundary; real default I/O is refused, never silently replaced');
    }
    return actualLegacy.qualifyEdge(options);
  }};
  const dependencies = {
    'node:fs':fs,'node:path':path,'node:crypto':require('node:crypto'),
    '../qualify.cjs':hermeticLegacy,
    '../adapters.cjs':{...localRequire('../adapters.cjs'),defaultAdapters},
    '../addendum.cjs':qualified,
    '../cli.cjs':{...originalCli,async main(argv,io) {
      state.cliCalls.push({argv,io});
      const options = originalCli.parseArgs(argv).options;
      const result = options.requalify
        ? await io.requalify({qualifyOptions:{...io.qualifyOptions,timeoutMs:options.timeoutMs === null ? undefined : options.timeoutMs}})
        : await io.qualify(options.timeoutMs === null ? io.qualifyOptions : {...io.qualifyOptions,timeoutMs:options.timeoutMs});
      return result?.ok === true ? 0 : 1;
    }},
    '../requalify.cjs':{async requalifyEdge(options) {
      state.requalifyCalls.push(options);
      return options.qualify({adapterFactory:() => fixtureAdapters()});
    }},
  };
  const module = {exports:{}};
  const requireApi = name => {
    if (!Object.hasOwn(dependencies,name)) throw Object.assign(new Error(`Undeclared dependency: ${name}`),{code:'MODULE_NOT_FOUND'});
    return dependencies[name];
  };
  requireApi.main = {};
  const scopeStop = Object.assign(new Error('U045 scoped observation completed'),{code:'U045_SCOPE_STOP'});
  const context = {
    Buffer,process:processApi,console,setTimeout,clearTimeout,
    __u045Observe(key,value) {
      const record = {key,value:snapshot(value),probe:state.activeProbe || 'module-initialization'};
      state.observations.push(record);
      if (observe) observe(record);
      throw scopeStop;
    },
  };
  const compiled = new vm.Script(`(function(exports,require,module,__filename,__dirname){\n${source}\n})`,{filename:`u045-semantic-scope-${sha(source)}.cjs`});
  let fault = null;
  try { compiled.runInNewContext(context)(module.exports,requireApi,module,currentFile,path.dirname(currentFile)); }
  catch (error) {if(error.code !== 'U045_SCOPE_STOP') fault=error;}
  return {api:module.exports,state,fault,scopeStop};
}
function memory(files = new Map(),root = APPEND,settings = {}) {
  const data = new Map([...files].map(([key,value]) => [key,Buffer.from(value)]));
  const operations = [];
  let renames = 0;
  const keyOf = file => path.relative(root,file);
  const absent = file => Object.assign(new Error(`ENOENT: private virtual fixture ${file}`),{code:'ENOENT'});
  const regular = value => ({isFile:() => true,isSymbolicLink:() => false,size:value.length});
  const fsApi = {
    readFileSync(file,encoding) {
      operations.push(['read',keyOf(file)]);
      if (!data.has(keyOf(file))) throw absent(file);
      let value = Buffer.from(data.get(keyOf(file)));
      if (settings.read) value=settings.read(keyOf(file),value,operations);
      return typeof encoding === 'string' ? value.toString(encoding) : value;
    },
    lstatSync(file) {
      if (!data.has(keyOf(file))) throw absent(file);
      return settings.stat?.(keyOf(file)) || regular(data.get(keyOf(file)));
    },
    statSync(file) {
      if (!data.has(keyOf(file))) throw absent(file);
      return regular(data.get(keyOf(file)));
    },
    readdirSync(directory) {
      const relative = keyOf(directory);
      const prefix = relative ? `${relative}\\` : '';
      const names = new Map();
      for (const key of data.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length), name=rest.split('\\')[0],dir=rest.includes('\\');
        names.set(name,dir || names.get(name) || false);
      }
      const entries = [...names].map(([name,dir]) => ({
        name,isSymbolicLink:() => false,isDirectory:() => dir,isFile:() => !dir,
      }));
      if (settings.directory) settings.directory(relative,entries);
      return entries;
    },
    openSync(file) {
      if(data.has(keyOf(file))) throw Object.assign(new Error('Lock exists'),{code:'EEXIST'});
      data.set(keyOf(file),Buffer.alloc(0));operations.push(['lock',keyOf(file)]);return 17;
    },
    closeSync(handle) {operations.push(['close',handle]);},
    rmSync(file) {data.delete(keyOf(file));operations.push(['remove',keyOf(file)]);},
    writeFileSync(file,value,options) {
      if(options?.flag === 'wx' && data.has(keyOf(file))) throw Object.assign(new Error('Exists'),{code:'EEXIST'});
      data.set(keyOf(file),Buffer.from(value));operations.push(['write',keyOf(file),sha(value)]);
    },
    renameSync(from,to) {
      renames+=1;operations.push(['rename',renames,keyOf(from),keyOf(to)]);
      const code=settings.errors?.[renames-1];
      if(code) throw Object.assign(new Error(`Injected ${code}`),{code});
      if(!data.has(keyOf(from))) throw absent(from);
      data.set(keyOf(to),Buffer.from(data.get(keyOf(from))));data.delete(keyOf(from));
      return 'U045_RENAME_RETURN_MARKER';
    },
  };
  return {fsApi,data,operations,get renames(){return renames;}};
}
const parentFiles = new Map(baseline.files.map(file => [file.path,fs.readFileSync(path.join(namespace,file.path))]));
const probeBytes = Buffer.from("'use strict';\nmodule.exports=1;\n");
const parentByPath = new Map(baseline.files.map(file => [file.path,file]));
const payload = [...parentFiles].map(([file,bytes]) => ({path:file,role:'predecessor',forms:forms(file,bytes,parentByPath.get(file))}));
payload.push({path:'u045\\probe.cjs',role:'current',forms:forms('u045\\probe.cjs',probeBytes)});
payload.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const oldChain = qualified.verifyFiles({
  qualifiedFile:path.join(namespace,'qualified.json'),addendumFile:path.join(namespace,'qualified.addendum.jsonl'),
});
assert.equal(oldChain.ok,true);
const amendment = `${JSON.stringify({
  schema:'U045-current-amendment/1',cardId:'U045',previous:oldChain.head,
  parentBaselineSha256:sha(parentBytes()),payloadSha256:sha(JSON.stringify(payload)),atUtc:now().toISOString(),
})}\n`;
const headFiles = [...payload,{path:'u045\\amendment.jsonl',role:'current',forms:forms('u045\\amendment.jsonl',Buffer.from(amendment))}]
  .sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const baseHead = {schema:'U045-current-source-head/1',parentBaselineBase64:parentBytes().toString('base64'),files:headFiles};
function headCase(change,settings = {}) {
  const head = clone(baseHead);
  const files = new Map(parentFiles);
  files.set('u045\\probe.cjs',probeBytes);
  files.set('u045\\amendment.jsonl',Buffer.from(amendment));
  if(change) change(head,files);
  const headBytes = Buffer.from(`${JSON.stringify(head)}\n`);
  files.set('u045\\head.json',headBytes);
  const store = memory(files,ROOT,settings);
  return {store,options:{root:ROOT,expectedHeadSha256:sha(headBytes),fsApi:store.fsApi}};
}
function appendCase(errors = [],change) {
  const files = new Map([
    ['qualified.json',Buffer.from('{"schemaVersion":1,"qualifiedMajors":[156]}\n')],
    ['report.json',Buffer.from(JSON.stringify(report()))],
  ]);
  if(change) change(files);
  const store = memory(files,APPEND,{errors});
  return {store,options:{
    qualifiedFile:path.join(APPEND,'qualified.json'),addendumFile:path.join(APPEND,'qualified.addendum.jsonl'),
    reportPath:path.join(APPEND,'report.json'),verify:machine,now,fsApi:store.fsApi,
  }};
}
function resultIs(value,expected,name) {
  if(expected.ok === true && value?.ok === false &&
      /(?:UNAVAILABLE|not a function|Cannot read|ENOENT|MODULE_NOT_FOUND)/.test(`${value.code} ${value.error}`)) {
    throw new ProbeFault(`${name}: dependency/operation fault is not an assertion kill: ${value.code}: ${value.error}`);
  }
  assert.ok(value && typeof value === 'object',`${name}: coherent typed public result`);
  for(const [key,wanted] of Object.entries(expected)) assert.deepEqual(clone(value[key]),wanted,`${name}: ${key}`);
}
const probes = [];
const probe = (name,run) => probes.push({name,run});
probe('U045 causal module contract: closed exports, strict functions, constants, and no CLI effect on require',async ({api,state}) => {
  assert.deepEqual(Object.keys(api).sort(),['APPEND_ATTEMPTS','HEAD_FILE','PARENT_BASELINE_SHA256','USAGE','appendFromReport','main','qualifyEdge','verifyHead'].sort());
  assert.equal(api.APPEND_ATTEMPTS,3);
  assert.equal(api.PARENT_BASELINE_SHA256,sha(parentBytes()));
  assert.equal(api.HEAD_FILE,path.join(path.dirname(currentFile),'head.json'));
  assert.match(api.USAGE,/clock exception:.*checkedAtUtc null/);
  for(const key of ['qualifyEdge','appendFromReport','verifyHead','main']) {
    assert.equal(typeof api[key],'function',`${key} public function`);
    assert.throws(() => api[key].caller,error => error.name === 'TypeError',`${key} is strict`);
  }
  await Promise.resolve();
  assert.equal(state.stdout.text,'','requiring a module is not invoking its OS entry');
});
probe('U045 causal qualifier: actual factory receives preserved and clamped bounds',async ({api}) => {
  for(const [timeoutMs,explicit,bound] of [[3000,400,400],[2000,60000,1500]]) {
    const seen=[];
    const value=await api.qualifyEdge({timeoutMs,shell:{timeoutMs:explicit},adapterFactory:options => {seen.push(options.shell.timeoutMs);return fixtureAdapters();}});
    resultIs(value,{ok:true},'factory qualification');assert.deepEqual(seen,[bound]);
  }
});
probe('U045 causal qualifier: default factory and default options remain a public entry',async ({api,state}) => {
  const before=state.defaultAdapterCalls.length;
  resultIs(await api.qualifyEdge(),{ok:true},'default qualification');
  assert.equal(state.defaultAdapterCalls.length,before+1);
  assert.equal(state.defaultAdapterCalls.at(-1).shell.timeoutMs,180000);
});
probe('U045 causal qualifier: invalid timeout refuses before construction and the clock exception is explicit',async ({api}) => {
  let calls=0;
  const adapterFactory=() => {calls+=1;return fixtureAdapters();};
  resultIs(await api.qualifyEdge({timeoutMs:0,adapterFactory}),{ok:false,reasonCodes:['QUALIFY_TIMEOUT_INVALID']},'invalid bound');
  assert.equal(calls,0);
  resultIs(await api.qualifyEdge({adapterFactory:() => fixtureAdapters({now:() => new Promise(() => {})})}),{ok:true,checkedAtUtc:null},'clock exception');
});
probe('U045 causal append: actual EPERM and EBUSY recover within three exact renames',async ({api}) => {
  const {store,options}=appendCase(['EPERM','EBUSY']);
  const value=await api.appendFromReport(options);
  resultIs(value,{ok:true,attempts:3},'transient append');assert.equal(store.renames,3);
  assert.ok(store.data.has('qualified.addendum.jsonl'),'actual append destination was written');
  assert.equal(store.data.has('qualified.addendum.jsonl.lock'),false,'owned append lock is released');
  const writes=store.operations.filter(row => row[0] === 'write');
  assert.equal(writes.length,1,'one fixed canonical content is retained through retries');
});
probe('U045 causal append: the actual filesystem default is exercised on an exact owned private fixture',async ({api}) => {
  const dir=fs.mkdtempSync(path.join(__dirname,'scratch-u045-semantic-'));
  try {
    const qualifiedFile=path.join(dir,'qualified.json'),reportPath=path.join(dir,'report.json');
    fs.writeFileSync(qualifiedFile,'{"schemaVersion":1,"qualifiedMajors":[156]}\n');
    fs.writeFileSync(reportPath,JSON.stringify(report()));
    const value=await api.appendFromReport({qualifiedFile,reportPath,verify:machine,now});
    resultIs(value,{ok:true,attempts:1},'actual filesystem append');
    assert.ok(fs.existsSync(path.join(dir,'qualified.addendum.jsonl')));
  } finally {fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:25});}
});
probe('U045 causal append: EPERM and EBUSY each exhaust at the fixed bound with typed cause',async ({api}) => {
  for(const code of ['EPERM','EBUSY']) {
    const {store,options}=appendCase([code,code,code]);
    resultIs(await api.appendFromReport(options),{ok:false,code:'U045_APPEND_RETRY_EXHAUSTED',causeCode:code,attempts:3},'exhausted append');
    assert.equal(store.renames,3);assert.equal(store.data.has('qualified.addendum.jsonl'),false);
  }
});
probe('U045 causal append: unrelated errors, invalid report and dry run never become retries or writes',async ({api}) => {
  let next=appendCase(['EACCES']);
  resultIs(await api.appendFromReport(next.options),{ok:false,code:'U045_APPEND_REFUSED',causeCode:'EACCES',attempts:1},'nontransient append');
  next=appendCase([],files => files.set('report.json',Buffer.from('{}')));
  resultIs(await api.appendFromReport(next.options),{ok:false,code:'U045_APPEND_REFUSED',attempts:0},'invalid report');
  next=appendCase();
  resultIs(await api.appendFromReport({...next.options,dryRun:true}),{ok:true,attempts:0},'dry-run append');
  assert.equal(next.store.renames,0);
});
probe('U045 causal append: default and explicit accepted 157 destinations are read-only',async ({api}) => {
  resultIs(await api.appendFromReport(),{ok:false,code:'U045_PINNED_FILE_READ_ONLY'},'default accepted append');
  resultIs(await api.appendFromReport({addendumFile:qualified.ADDENDUM_FILE.toUpperCase()}),{ok:false,code:'U045_PINNED_FILE_READ_ONLY'},'explicit accepted append');
});
probe('U045 causal current head: exact predecessor source and complete addition footprint pass',async ({api}) => {
  const {options}=headCase();
  resultIs(api.verifyHead(options),{ok:true,predecessors:272,currentFiles:3,files:275},'complete current head');
});
probe('U045 causal current head: external digest has a closed exact shape',async ({api}) => {
  const {options}=headCase();
  for(const digest of [undefined,123,'A'.repeat(64),'0'.repeat(64)]) resultIs(api.verifyHead({...options,expectedHeadSha256:digest}),{ok:false,code:'U045_HEAD_DIGEST'},'external head digest');
  const defaultResult=api.verifyHead();
  assert.ok(defaultResult && typeof defaultResult === 'object','the default validator always returns a coherent typed result');
  assert.equal(typeof defaultResult.ok,'boolean');
});
const headMutations = [
  ['schema',head => {head.schema='wrong';},'U045_PREDECESSOR_ANCHOR'],
  ['parent raw bytes',head => {head.parentBaselineBase64=Buffer.from('{}').toString('base64');},'U045_PREDECESSOR_ANCHOR'],
  ['array shape',head => {head.files={};},'U045_HEAD_SHAPE'],
  ['duplicate path',head => {head.files.push(head.files[0]);},'U045_HEAD_PATH'],
  ['empty path',head => {head.files[0].path='';},'U045_HEAD_PATH'],
  ['path type',head => {head.files[0].path=3;},'U045_HEAD_PATH'],
  ['forward slash',head => {head.files[0].path='a/b';},'U045_HEAD_PATH'],
  ['stream path',head => {head.files[0].path='a:b';},'U045_HEAD_PATH'],
  ['parent traversal',head => {head.files[0].path='..\\x';},'U045_HEAD_PATH'],
  ['dot traversal',head => {head.files[0].path='.\\x';},'U045_HEAD_PATH'],
  ['blank segment',head => {head.files[0].path='a\\\\b';},'U045_HEAD_PATH'],
  ['absent forms',head => {delete head.files[0].forms;},'U045_SOURCE_FORM'],
  ['empty forms',head => {head.files[0].forms=[];},'U045_SOURCE_FORM'],
  ['missing predecessor original',head => {head.files[0].forms=[{kind:'source-lf',bytes:1,sha256:'0'.repeat(64)}];},'U045_PREDECESSOR_FILE'],
  ['predecessor digest',head => {head.files[0].forms[0].sha256='0'.repeat(64);},'U045_PREDECESSOR_FILE'],
  ['predecessor length',head => {head.files[0].forms[0].bytes+=1;},'U045_PREDECESSOR_FILE'],
  ['predecessor role',head => {head.files[0].role='current';},'U045_PREDECESSOR_FILE'],
  ['current role',head => {head.files.find(file => file.path === 'u045\\probe.cjs').role='legacy';},'U045_CURRENT_SCOPE'],
  ['current outside scope',head => {head.files.push({path:'elsewhere.cjs',role:'current',forms:forms('elsewhere.cjs',probeBytes)});},'U045_CURRENT_SCOPE'],
  ['wrong form kind',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[1].kind='wrong';},'U045_SOURCE_FORM'],
  ['negative length',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[1].bytes=-1;},'U045_SOURCE_FORM'],
  ['fractional length',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[1].bytes=1.5;},'U045_SOURCE_FORM'],
  ['malformed hash',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[1].sha256='bad';},'U045_SOURCE_FORM'],
  ['forged LF hash',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[1].sha256='0'.repeat(64);},'U045_SOURCE_FORM'],
  ['forged CRLF hash',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[2].sha256='0'.repeat(64);},'U045_SOURCE_FORM'],
  ['forged LF length',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[1].bytes+=1;},'U045_SOURCE_FORM'],
  ['forged CRLF length',head => {head.files.find(file => file.path === 'u045\\probe.cjs').forms[2].bytes+=1;},'U045_SOURCE_FORM'],
  ['raw relabelled source',head => {const raw=head.files.find(file => file.path.includes('stdout.raw.gz'));raw.forms.push({...raw.forms[0],kind:'source-lf'});},'U045_SOURCE_FORM'],
  ['missing predecessor',head => {head.files=head.files.filter(file => file.path !== 'adapters.cjs');},'U045_PREDECESSOR_MISSING'],
  ['source bytes',(head,files) => {files.set('u045\\probe.cjs',Buffer.from('altered'));},'U045_SOURCE_BYTES'],
  ['extra footprint',(head,files) => {files.set('unlisted.txt',Buffer.from('extra'));},'U045_FOOTPRINT'],
];
for(const [name,change,code] of headMutations) probe(`U045 causal head refusal: ${name}`,async ({api}) => {
  const {options}=headCase(change);
  resultIs(api.verifyHead(options),{ok:false,code},name);
});
for(const [name,stat] of [
  ['directory',{isFile:() => false,isSymbolicLink:() => false}],
  ['symlink',{isFile:() => true,isSymbolicLink:() => true}],
]) probe(`U045 causal source type: ${name}`,async ({api}) => {
  const {options}=headCase(null,{stat:file => file === 'u045\\probe.cjs' ? stat : null});
  resultIs(api.verifyHead(options),{ok:false,code:'U045_SOURCE_TYPE'},name);
});
for(const name of ['symbolic','unusual']) probe(`U045 causal footprint kind: ${name}`,async ({api}) => {
  const {options}=headCase(null,{directory(relative,entries) {
    if(relative === '') entries.push({name:'alien',isSymbolicLink:() => name === 'symbolic',isDirectory:() => false,isFile:() => false});
  }});
  const value=api.verifyHead(options);
  resultIs(value,{ok:false,code:'U045_HEAD_UNAVAILABLE'},name);
  assert.match(value.error,name === 'symbolic' ? /Not a regular source footprint: alien/ : /Not a regular source file: alien/);
});
probe('U045 causal head: source CRLF is an explicit form and raw is never normalized',async ({api}) => {
  const {options}=headCase((head,files) => files.set('u045\\probe.cjs',Buffer.from(probeBytes.toString().replace(/\n/g,'\r\n'))));
  resultIs(api.verifyHead(options),{ok:true},'explicit CRLF');
});
const amendChanges = [
  text => `${text} `,
  text => text.replace('U045-current-amendment/1','unknown'),
  text => text.replace('"cardId":"U045"','"cardId":"other"'),
  text => text.replace('"atUtc":','"unexpected":0,"atUtc":'),
  text => text.replace(/"atUtc":"[^"]+"/,'"atUtc":null'),
  text => text.replace(/"atUtc":"[^"]+"/,'"atUtc":"not UTC"'),
  text => text.replace(sha(parentBytes()),'0'.repeat(64)),
  text => text.replace(/"previous":"[0-9a-f]{64}"/,`"previous":"${'0'.repeat(64)}"`),
  text => text.replace(/"payloadSha256":"[0-9a-f]{64}"/,`"payloadSha256":"${'0'.repeat(64)}"`),
];
for(const [index,change] of amendChanges.entries()) probe(`U045 causal amendment chain refusal ${index+1}`,async ({api}) => {
  const {options}=headCase((head,files) => {
    const text=change(amendment);
    files.set('u045\\amendment.jsonl',Buffer.from(text));
    head.files.find(file => file.path === 'u045\\amendment.jsonl').forms=forms('u045\\amendment.jsonl',Buffer.from(text));
  });
  resultIs(api.verifyHead(options),{ok:false,code:'U045_AMENDMENT_CHAIN'},'amendment chain');
});
probe('U045 causal head: an actual second-read predecessor race cannot be accepted',async ({api}) => {
  let reads=0;
  const {options}=headCase(null,{read(file,value) {
    if(file === 'qualified.addendum.jsonl' && ++reads > 1) return Buffer.from('broken\n');
    return value;
  }});
  resultIs(api.verifyHead(options),{ok:false,code:'U045_AMENDMENT_CHAIN'},'second-read chain race');
  assert.equal(reads,2);
});
probe('U045 causal public main: help and usage are current, default I/O is explicit, and no qualifier is called',async ({api,state}) => {
  const out=sink(),err=sink();
  assert.equal(await api.main(['--help'],{stdout:out,stderr:err}),0);assert.equal(out.text,api.USAGE);
  assert.equal(await api.main(['--help']),0);assert.equal(state.stdout.text,api.USAGE);
  for(const args of [['--unknown'],['--check-head'],['--check-head','a','b']]) {
    const io={stdout:sink(),stderr:sink()};
    assert.equal(await api.main(args,io),2);assert.ok(io.stderr.text.includes(api.USAGE));
  }
});
probe('U045 causal public main: actual current qualifier and requalifier are wired to the delegated CLI',async ({api,state}) => {
  assert.equal(await api.main(['--timeout-ms','8000'],{qualifyOptions:{adapterFactory:() => fixtureAdapters()}}),0);
  assert.equal(state.cliCalls.at(-1).io.qualify,api.qualifyEdge);
  assert.equal(await api.main(['--requalify']),0);
  assert.equal(state.requalifyCalls.at(-1).qualify,api.qualifyEdge);
  const supplied=async () => ({ok:true});
  assert.equal(await api.main([],{qualify:supplied}),0);
  assert.equal(state.cliCalls.at(-1).io.qualify,supplied);
});
probe('U045 causal public main: head bootstrap uses the public validator and reports exact nonzero refusal',async ({api}) => {
  const {options}=headCase();
  for(const [digest,code] of [[options.expectedHeadSha256,0],['0'.repeat(64),1]]) {
    const out=sink();
    assert.equal(await api.main(['--check-head',digest],{stdout:out,headOptions:options}),code);
    assert.match(out.text,/^\{.*\}\n$/,'the actual public bootstrap must write a complete JSON answer');
    assert.equal(JSON.parse(out.text).ok,code === 0);
  }
});
probe('U045 causal public main: output failure produces the current typed nonzero boundary',async ({api}) => {
  const err=sink();
  assert.equal(await api.main(['--help'],{stdout:{write(){throw new Error('injected current output failure');}},stderr:err}),1);
  assert.match(err.text,/U045_CURRENT_ENTRY: injected current output failure/);
});
async function run(loaded,options = {}) {
  if(loaded.fault) return {status:'NON_KILL_MODULE_FAULT',error:{name:loaded.fault.name,code:loaded.fault.code,message:loaded.fault.message}};
  const passed=[];
  const selected=options.only ? probes.filter(probe => probe.name === options.only) : probes;
  for(const entry of selected) {
    if(process.env.U045_FIXED_DEADLINE !== undefined &&
        (!Number.isFinite(Date.parse(process.env.U045_FIXED_DEADLINE)) || Date.now() >= Date.parse(process.env.U045_FIXED_DEADLINE))) {
      return {status:'NON_KILL_DEADLINE',passed};
    }
    loaded.state.activeProbe=entry.name;
    try {await entry.run(loaded);passed.push(entry.name);}
    catch(error) {
      if(loaded.state.observations.length) return {status:'SCOPED_OBSERVED',observation:loaded.state.observations[0],passed};
      if(error.code === 'ERR_ASSERTION') return {status:'KILLED',killer:entry.name,error:{name:error.name,code:error.code,message:error.message},passed};
      return {status:'NON_KILL_OPERATION_FAULT',probe:entry.name,error:{name:error.name,code:error.code,message:error.message},passed};
    }
    if(loaded.state.observations.length) return {status:'SCOPED_OBSERVED',observation:loaded.state.observations[0],passed};
  }
  return {status:'SURVIVOR',passed};
}
module.exports = {load,run,probes,snapshot,headCase,appendCase,ProbeFault,currentFile};
if(require.main === module) {
  const source=fs.readFileSync(currentFile,'utf8');
  run(load(source)).then(result => {
    process.stdout.write(`${JSON.stringify({schema:'U045-named-semantic-probes/1',probes:probes.length,...result})}\n`);
    if(result.status !== 'SURVIVOR' || result.passed.length !== probes.length) process.exitCode=1;
  });
}
