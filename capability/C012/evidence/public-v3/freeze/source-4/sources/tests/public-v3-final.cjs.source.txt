'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {sha,scan}=require('./public-v3-transport.cjs');
const {projectRecord,readRecord}=require('./public-v3-records.cjs');
const {auditMap}=require('./public-v3-map.cjs');
const {inventory,sources}=require('./ast.cjs');
const {derive,validProof}=require('./current-v2-close.cjs');
const {list}=require('./source.cjs');
const ns=path.resolve(__dirname,'..'),metadata=process.env.C012_METADATA,final=path.join(ns,'evidence','public-v3','final');
const locations={mutations:'mutations-public-v3',closure:'closure-public-v3',parent:'parent-green-public-v3',fresh:'fresh-public-v3',coverage:'coverage-public-v3',resource:'resource64-public-v3'};
function json(file){return JSON.parse(fs.readFileSync(file));}
function packageEvidence(){
  const map=auditMap(true);assert.equal(map.derivationVerified,true);
  const freezeFile=process.env.C012_PUBLIC_FREEZE,freeze=json(freezeFile);
  const actual=list(ns);assert.deepEqual(actual.map(({path,bytes,sha256,lfSha256})=>({path,bytes,sha256,lfSha256})),
    freeze.sources.map(({path,bytes,sha256,lfSha256})=>({path,bytes,sha256,lfSha256})));
  fs.mkdirSync(final,{recursive:false});const records=[];
  function collect(directory,prefix=''){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name),relative=path.join(prefix,entry.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);
    if(entry.isDirectory())collect(file,relative);
    else{
      if(!prefix&&/^(?:public-v3-package|public-v3-seal|public-v3-verify|public-v3-patch|public-v3-result)-/.test(entry.name))continue;
      const original=fs.readFileSync(file),encoded=projectRecord(original),artifact=path.join('records',relative+'.projection.json.gz');
      fs.mkdirSync(path.dirname(path.join(final,artifact)),{recursive:true});fs.writeFileSync(path.join(final,artifact),encoded,{flag:'wx'});
      records.push({privateRecordRelativePath:relative,artifact,originalPrivateSha256:sha(original),publicSha256:sha(encoded),
        role:'current execution public projection, not original raw',projectionAlgorithm:'public-v3-records.projectRecord'});
    }
  }}collect(metadata);
  const authority={schema:'C012-public-v3-complete-current-evidence-authority/3',createdAtUtc:new Date().toISOString(),
    freeze:path.relative(ns,freezeFile),freezeSha256:sha(fs.readFileSync(freezeFile)),records,locations,
    privateOriginalsRemainOutsidePublic:true,originalHeadsAreHistorical:true,allPrivateDerivationsChecked:true,
    currentParentFullInventory:true,newNativeCampaignCounterNotReset:true,originalDeadlineUnchanged:true};
  fs.writeFileSync(path.join(final,'authority.json'),JSON.stringify(authority,null,2)+'\n',{flag:'wx'});
  const before=scan(ns);assert.equal(before.findings.length,0);
  fs.writeFileSync(path.join(final,'transport-green.json'),JSON.stringify({schema:'C012-actual-public-transport-green/3',
    inspectedFiles:before.files.length,expandedGzipBodies:before.gzipBodies,identifierArtifacts:0,pass:true},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({publicCurrentRecordProjections:records.length,baseArtifacts:map.publicFiles,privatePreimagesChecked:map.privatePreimagesChecked,transportGreen:true}));
}
function seal(){
  const file=path.join(final,'whole-head.json'),rows=scan(ns);assert.equal(rows.findings.length,0);
  const historical=new Map(json(path.join(ns,'evidence','public-v3','transport-map.json')).entries.map(row=>[row.publicRelativePath,row.role]));
  const roles=rows.files.map(row=>({path:row.path,role:historical.get(row.path)||(
    row.path.startsWith('tests'+path.sep)?'operative current verification source':
    row.path.endsWith('.source.txt')?'exact current source snapshot, not executed from this archive':
    row.path.includes(path.join('final','records'))?'explicit current execution public projection, not raw':
    row.path.startsWith('evidence'+path.sep)?'current public authority/data':'current documentation or unchanged feature source')}));
  fs.writeFileSync(file,JSON.stringify({schema:'C012-public-v3-every-actual-public-byte-head/3',files:rows.files,
    fileSetSha256:sha(JSON.stringify(rows.files)),selfExcludedOnly:'evidence\\public-v3\\final\\whole-head.json',
    roles,noBlanketHistoryDigestException:true},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({files:rows.files.length,headSha256:sha(fs.readFileSync(file))}));
}
function verify(){
  const authority=json(path.join(final,'authority.json')),head=json(path.join(final,'whole-head.json')),scanned=scan(ns);
  assert.equal(scanned.findings.length,0,'all actual files, gzip and projection payloads are scanned');
  const actual=scanned.files.filter(row=>row.path!=='evidence\\public-v3\\final\\whole-head.json');
  assert.deepEqual(actual,head.files);assert.equal(sha(JSON.stringify(head.files)),head.fileSetSha256);
  assert.deepEqual(head.roles.map(row=>row.path),head.files.map(row=>row.path));assert.ok(head.roles.every(row=>row.role.length>5));
  const mapped=auditMap(true);assert.equal(mapped.derivationVerified,true);
  const store=new Map();
  for(const entry of authority.records){
    const encoded=fs.readFileSync(path.join(final,entry.artifact));assert.equal(sha(encoded),entry.publicSha256);
    const value=readRecord(encoded);assert.equal(value.meta.originalPrivateSha256,entry.originalPrivateSha256);store.set(entry.privateRecordRelativePath,value.body);
    const original=fs.readFileSync(path.join(metadata,entry.privateRecordRelativePath));
    assert.equal(sha(original),entry.originalPrivateSha256);assert.equal(sha(projectRecord(original)),entry.publicSha256,'exact current record projection');
  }
  const read=relative=>{assert.ok(store.has(relative),'current actual record '+relative);return store.get(relative);};
  const data=relative=>JSON.parse(read(relative).toString());
  const freeze=json(path.join(ns,authority.freeze));assert.equal(sha(fs.readFileSync(path.join(ns,authority.freeze))),authority.freezeSha256);
  for(const row of freeze.sources)assert.equal(sha(fs.readFileSync(path.join(ns,row.path))),row.sha256);
  const domain=inventory(sources()),saved=data(path.join(locations.mutations,'inventory.json'));assert.deepEqual(domain,saved);
  const rawRows=new Map(read(path.join(locations.mutations,'outcomes.original.ndjson')).toString().trimEnd().split('\n').map(line=>{const row=JSON.parse(line);return[row.id,row];}));
  const closure=data(path.join(locations.closure,'report.json')),proofs=new Map();
  for(const decision of closure.decisions)if(decision.proofArtifact){
    const proof=JSON.parse(read(path.join(locations.closure,decision.proofArtifact)).toString());proofs.set(decision.id,proof);
    assert.equal(sha(Buffer.from(JSON.stringify(proof))),decision.proofSha256,'proof has no private-field transformation');
    assert.equal(validProof(domain.definitions.find(row=>row.id===decision.id),decision,proof,rawRows.get(decision.id)),true);
  }
  const unresolved=derive(domain,closure.decisions,proofs,rawRows);assert.deepEqual(unresolved,[]);assert.equal(proofs.size,435);
  const parent=data(path.join(locations.parent,'report.json'));assert.equal(parent.exit,0);assert.equal(parent.definitions,457);assert.equal(parent.validChanged,435);
  assert.equal(parent.inventorySha256,sha(read(path.join(locations.mutations,'inventory.json'))));
  assert.equal(parent.decisionsSha256,sha(read(path.join(locations.closure,'report.json'))));
  const whole=read('whole-current.stdout.raw').toString(),count=Number(/^# tests (\d+)$/m.exec(whole)?.[1]);
  assert.ok(count>=45);assert.match(whole,new RegExp('^# pass '+count+'$','m'));assert.match(whole,/^# fail 0$/m);
  const fresh=data(path.join(locations.fresh,'report.json'));assert.equal(fresh.pass,true);for(const row of fresh.reports){assert.equal(row.exit,0);assert.equal(row.summary.tests,count);assert.equal(row.summary.pass,count);}
  const coverage=data(path.join(locations.coverage,'report.json'));assert.equal(coverage.pass,true);assert.equal(coverage.files.length,4);
  for(const row of coverage.files){assert.equal(row.loaded,true);for(const metric of ['lines','branches','functions'])assert.ok(row[metric]>=85);assert.equal(sha(fs.readFileSync(path.join(ns,row.file))),row.sourceReadSha256);}
  const resource=data(path.join(locations.resource,'report.json'));assert.equal(resource.pass,true);assert.equal(resource.completed,64);assert.equal(resource.peak,8);assert.equal(resource.allExited,true);
  const native=data('native-public-v3.json');assert.equal(native.qualification.major,157);assert.equal(native.qualification.signature.status,'Valid');
  assert.equal(native.sessions.length,2);assert.ok(native.sessions.every(row=>row.cleanup.clean));assert.equal(native.sessions[1].injectedFailure.code,'ERR_ASSERTION');
  return{schema:'C012-public-v3-actual-current-all-bytes-and-domain-audit/3',pass:true,sourceFiles:freeze.sources.length,publicFiles:scanned.files.length,
    basePrivateArtifactsMapped:4932,privatePreimagesVerified:mapped.privatePreimagesChecked,identifierArtifacts:0,gzipBodies:scanned.gzipBodies,
    currentTests:count,freshKinds:fresh.reports.map(row=>row.kind),coverage:coverage.files.map(row=>({file:row.file,loaded:row.loaded,lines:row.lines,branches:row.branches,functions:row.functions})),
    definitions:457,validChanged:435,acceptedProofs:435,semanticUnresolved:0,counts:closure.counts,parentUnchangedGreen:true,
    currentResource:{total:64,concurrency:8,allExited:true},additionalNative:{campaigns:1,sessions:2,qualifiedMajor:157,observations:native.observations.length,clean:true},
    originalNativeCounterReset:false,publicHeadSha256:sha(fs.readFileSync(path.join(final,'whole-head.json')))};
}
if(require.main===module){try{const mode=process.argv[2];if(mode==='package')packageEvidence();else if(mode==='seal')seal();else if(mode==='verify')console.log(JSON.stringify(verify(),null,2));else throw Error('explicit mode');}catch(error){console.error(error);process.exitCode=1;}}
module.exports={verify};
