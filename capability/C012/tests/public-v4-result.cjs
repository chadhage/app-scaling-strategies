'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {verify}=require('./public-v4-final.cjs');
const {sha}=require('./public-v3-transport.cjs');
const {physical}=require('./source.cjs');
const ns=path.resolve(__dirname,'..'),root=path.resolve(ns,'..','..'),run=process.env.C012_RUN,audit=verify();
const patch=process.env.C012_PATCH_OUTPUT,patchReport=JSON.parse(fs.readFileSync(patch+'.json'));
assert.equal(sha(fs.readFileSync(patch)),patchReport.sha256);assert.equal(patchReport.applied,false);assert.equal(patchReport.readOnlyGitApplyCheckExit,0);
for(const [file,expected]of [['C012.json','5935e75284e32c6c16c183ae37de872093e734985087c33c0c3481f2ca085d07'],
  ['C012-current-v2.json','ee1d3b40cfe627e995c9daeb34826052b407455d71304ef1aa8236fc8b7069a4'],
  ['C012-public-v3.json','6e86dcc69b11bd53bba9b41519ae11a290618a1ffc9bdd7837d5707b9704afa3']])
  assert.equal(sha(fs.readFileSync(path.join(run,'results',file))),expected,'prior result immutable');
assert.equal(fs.existsSync(path.join(process.env.C012_GIT_REPOSITORY,'capability','C012')),false);
const runtime=process.env.C012_RUNTIME;assert.equal(runtime,path.join(root,'.git','kanban-orchestrator','browser-runtime'));
const own=physical(runtime),freeze=JSON.parse(fs.readFileSync(process.env.C012_PUBLIC_FREEZE));assert.deepEqual(own,freeze.runtime);
function noAliases(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);if(entry.isDirectory())noAliases(file);}}
noAliases(runtime);fs.rmSync(runtime,{recursive:true,force:false,maxRetries:3,retryDelay:100});assert.equal(fs.existsSync(runtime),false);
function ref(file,role){const bytes=fs.readFileSync(file);return{path:file,bytes:bytes.length,sha256:sha(bytes),role};}
const result={schemaVersion:4,schema:'C012-same-original-unit-private-exact-Git-transport-handoff/4',cardId:'C012',workerId:'worker-C012',kanoUnit:'C012',frozenClass:'S',packet:'H003',
  outcome:'readyForReview',readyForReview:true,deadlineUtc:'2026-11-11T23:06:54.4385459Z',deadlineExtended:false,completedAtUtc:new Date().toISOString(),
  candidate:root,paths:['capability\\C012'],audit,patch:patchReport,
  artifactrefs:[ref(patch,'exact new c4 additive patch, not applied'),ref(process.env.C012_PUBLIC_FREEZE,'new current freeze including persistent namespace policy'),
    ref(path.join(ns,'evidence','public-v4','whole-head.json'),'every actual c4 public byte and role'),ref(path.join(ns,'evidence','public-v4','authority.json'),'explicit Git-transport current selector authority'),
    ref(path.join(process.env.C012_METADATA,'git-transport-v4','report.json'),'actual filtered/index/checkout transport under autocrlf=true; private fixture, not publication')],
  bytePolicy:{path:'capability\\C012\\.gitattributes',text:'* -text',persistent:true,globalConfigChanged:false,blanketDigestException:false},
  sourceBehavior:{productionProgramsChanged:false,acceptedImportsChanged:false,resourceNativeActualSourcesChanged:false},
  historicalReuse:{sourceInputsExact:audit.sourceInputsExact,newNativeCampaigns:0,newResourceCampaigns:0,counterReset:false,oldProofsAndHeadsUnchanged:true},
  currentGates:{whole:audit.currentTests,fresh:audit.freshKinds,coverage:audit.coverage,valid435Closed:true,privacy:0,original4932DerivationsPreserved:true},
  cleanup:{exactOwnedC4RuntimeRemoved:true,runtimeIdentity:own,privateGitFixtureRemoved:true,globalOrNameKill:false,oldRootsTouched:false},
  authority:{applied:false,published:false,sharedIndexWritten:false,ledgerWritten:false,done:false,creditGranted:false,newUnitOrBonus:false,logicalWip:1,parentIndependentAcceptanceRequired:true},
  permissions:{azure:false,iac:false,scaffold:false,identity:false,deploy:false,expenditure:false},nativeAzureRuns:0,nativeAzureSpend:0,
  hints:[{kind:'test',text:'Persistent OWN namespace * -text makes ordinary filtered Git objects and real checkout byte-exact under core.autocrlf=true. Private fixture only, no publication or new HEAD qualification.'},
    {kind:'test',text:'Current c4 authority validates all actual bytes and every unchanged c3 predecessor byte. All4932 derivations and all435 actual proof bindings remain strict.'},
    {kind:'process',text:'Same original deadline and unit; no resource/native rerun or counter reset for attribute-only correction. Only parent may apply/publish/accept/credit.'}],
  limitations:['Private original projection preimages remain required; absence never counts as successful verification.',
    'Private Git fixture transport is not actual source publication, live application or a new HEAD qualification.'],
  obstacles:[],notes:'Private bounded transport correction only. Stop after handoff and await explicit parent authority.'};
const file=path.join(run,'results','C012-public-v4.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cardId:'C012',outcome:result.outcome,resultSha256:sha(fs.readFileSync(file)),realGitExact:true,applied:false,published:false}));
