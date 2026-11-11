'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {verify}=require('./public-v3-final.cjs');
const {sha}=require('./public-v3-transport.cjs');
const {physical}=require('./source.cjs');
const ns=path.resolve(__dirname,'..'),root=path.resolve(ns,'..','..'),run=process.env.C012_RUN;
const audit=verify(),patch=process.env.C012_PATCH_OUTPUT;assert.ok(patch);
const patchReport=JSON.parse(fs.readFileSync(patch+'.json'));assert.equal(sha(fs.readFileSync(patch)),patchReport.sha256);assert.equal(patchReport.applied,false);assert.equal(patchReport.readOnlyGitApplyCheckExit,0);
const immutable=[['C012.json','5935e75284e32c6c16c183ae37de872093e734985087c33c0c3481f2ca085d07'],
  ['C012-current-v2.json','ee1d3b40cfe627e995c9daeb34826052b407455d71304ef1aa8236fc8b7069a4']];
for(const [file,hash]of immutable)assert.equal(sha(fs.readFileSync(path.join(run,'results',file))),hash);
assert.equal(fs.existsSync(path.join(process.env.C012_GIT_REPOSITORY,'capability','C012')),false);
const runtime=process.env.C012_RUNTIME;assert.equal(runtime,path.join(root,'.git','kanban-orchestrator','browser-runtime'));
const own=physical(runtime),freeze=JSON.parse(fs.readFileSync(process.env.C012_PUBLIC_FREEZE));assert.deepEqual(own,freeze.runtime);
function noAliases(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);if(entry.isDirectory())noAliases(file);}}
noAliases(runtime);fs.rmSync(runtime,{recursive:true,force:false,maxRetries:3,retryDelay:100});assert.equal(fs.existsSync(runtime),false);
const final=path.join(ns,'evidence','public-v3','final');
function ref(file,role){const bytes=fs.readFileSync(file);return{path:file,bytes:bytes.length,sha256:sha(bytes),role};}
const result={schemaVersion:3,schema:'C012-same-original-unit-private-public-derivative-handoff/3',
  cardId:'C012',workerId:'worker-C012',kanoUnit:'C012',frozenClass:'S',packet:'H003',outcome:'readyForReview',readyForReview:true,
  completedAtUtc:new Date().toISOString(),deadlineUtc:'2026-11-11T23:06:54.4385459Z',deadlineExtended:false,logicalWip:1,newUnitOrBonus:false,
  candidate:root,paths:['capability\\C012'],audit,patch:patchReport,
  artifactrefs:[ref(patch,'source-complete public derivative additive patch, not applied'),ref(process.env.C012_PUBLIC_FREEZE,'actual public current source freeze'),
    ref(path.join(final,'whole-head.json'),'every actual public byte head'),ref(path.join(final,'authority.json'),'explicit current projection authority'),
    ref(path.join(ns,'evidence','public-v3','transport-map.json'),'all4932 predecessor files and original-private/public projection roles'),
    ref(path.join(process.env.C012_METADATA,'mutations-public-v3','inventory.json'),'actual full457 public-source domain'),
    ref(path.join(process.env.C012_METADATA,'closure-public-v3','report.json'),'actual435 proof bindings and recomputed closure'),
    ref(path.join(process.env.C012_METADATA,'parent-green-public-v3','report.json'),'unchanged full-domain parent invariant GREEN')],
  privateOriginalsImmutable:immutable.map(([file,hash])=>({file,sha256:hash,accepted:false})),
  publicTransport:{allFilesScanned:true,gzipAndProjectionBodiesScanned:true,absoluteLocalProfileIdentifiers:0,secretPatterns:0,
    changedHistoriesExplicitlyProjected:true,privateOriginalsRedacted:false,missingPreimageSuccessFallback:false,
    earlyUnavailableHelperPreimageRetainedAsUnavailable:true},
  publicationSurface:{ordinaryPublicReplayDoesNotExpireWithWorkerGO:true,perCommandLocalFailureWatchdog:true,
    privateWorkerOuterHardstopUnchanged:true,publicWatchdogGrantsWorkerOrCloudAuthority:false},
  cumulativeCampaigns:{originalHistoricalResourceGroups:64,currentAffectedResourceGroups:64,eachConcurrency:8,standaloneBurners:0,
    originalHistoricalNativeCampaigns:1,additionalPublicCandidateNativeCampaigns:1,counterReset:false,concurrentBrowsersMaximum:1},
  cleanup:{exactOwnedC3RuntimeRemoved:true,runtimeIdentity:own,oldRootsTouched:false,oldProcessAuthorityReused:false,globalOrNameKill:false},
  authority:{applied:false,published:false,ledgerOrIndexWritten:false,done:false,creditGranted:false,parentIndependentAcceptanceRequired:true},
  permissions:{azure:false,iac:false,scaffold:false,identity:false,deploy:false,expenditure:false},nativeAzureRuns:0,nativeAzureSpend:0,
  hints:[{kind:'test',text:'All actual public bytes, expanded gzip and labelled projection payloads are scanned; all4932 predecessor artifacts have original-private/public hashes and roles.'},
    {kind:'test',text:'All435 public valid positions bind actual current proofs. The original63 gap and all private failures are retained, not relabelled original raw.'},
    {kind:'process',text:'Public ordinary verification uses a local failure budget; private worker mode is still clamped to original23:06Z. Public verification grants no worker/cloud authority.'}],
  limitations:['Private originals remain outside public transport; without those preimages, original derivation is unavailable, never falsely verified.',
    'Altered historical source/logs are projections and are not claimed to be the original executed programs.',
    'Unavailable early helper preimage is not reconstructed or retro-certified.'],
  obstacles:[],notes:'Private public-derivative preparation only. Stop after handoff and await explicit parent application authority.'};
const file=path.join(run,'results','C012-public-v3.json');
if(fs.existsSync(file))fs.copyFileSync(file,path.join(run,'results','C012-public-v3-prev-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cardId:'C012',outcome:result.outcome,publicFiles:audit.publicFiles,identifiers:0,valid435Closed:true,resultSha256:sha(fs.readFileSync(file)),applied:false}));
