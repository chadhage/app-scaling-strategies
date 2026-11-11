'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha,scan}=require('./public-v3-transport.cjs');
const {projectRecord,readRecord}=require('./public-v3-records.cjs');
const {auditMap}=require('./public-v3-map.cjs');
const {list}=require('./source.cjs');
const {inventory,sources}=require('./ast.cjs');
const {derive,validProof}=require('./current-v2-close.cjs');
const ns=path.resolve(__dirname,'..'),folder=path.join(ns,'evidence','public-v4');
function predecessor(){
  const old=JSON.parse(fs.readFileSync(path.join(ns,'evidence','public-v3','final','whole-head.json')));
  for(const row of old.files){const bytes=fs.readFileSync(path.join(ns,row.path));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256,'unchanged predecessor public byte '+row.path);}
  assert.equal(sha(fs.readFileSync(path.join(ns,'evidence','public-v3','final','whole-head.json'))),'0b06335b9fd59e3fc90b97495b0372c40db1d07cf54acd8ae45f4dd3f367efb2');
  const authority=JSON.parse(fs.readFileSync(path.join(ns,'evidence','public-v3','final','authority.json'))),records=new Map();
  for(const row of authority.records){
    const encoded=fs.readFileSync(path.join(ns,'evidence','public-v3','final',row.artifact));assert.equal(sha(encoded),row.publicSha256);
    const decoded=readRecord(encoded);assert.equal(decoded.meta.originalPrivateSha256,row.originalPrivateSha256);
    const privateBytes=fs.readFileSync(path.join(process.env.C012_PREDECESSOR_RECORDS,row.privateRecordRelativePath));
    assert.equal(sha(privateBytes),row.originalPrivateSha256);assert.equal(sha(projectRecord(privateBytes)),row.publicSha256);
    records.set(row.privateRecordRelativePath,decoded.body);
  }
  const read=p=>{assert.ok(records.has(p),'strict retained predecessor input '+p);return records.get(p);};
  const domain=inventory(sources()),saved=JSON.parse(read('mutations-public-v3\\inventory.json'));assert.deepEqual(domain,saved);
  const rawRows=new Map(read('mutations-public-v3\\outcomes.original.ndjson').toString().trimEnd().split('\n').map(line=>{const r=JSON.parse(line);return[r.id,r];}));
  const closure=JSON.parse(read('closure-public-v3\\report.json')),proofs=new Map();
  for(const d of closure.decisions)if(d.proofArtifact){
    const proof=JSON.parse(read(path.join('closure-public-v3',d.proofArtifact)));assert.equal(sha(Buffer.from(JSON.stringify(proof))),d.proofSha256);
    assert.equal(validProof(domain.definitions.find(row=>row.id===d.id),d,proof,rawRows.get(d.id)),true);proofs.set(d.id,proof);
  }
  assert.equal(proofs.size,435);assert.deepEqual(derive(domain,closure.decisions,proofs,rawRows),[]);
  const parent=JSON.parse(read('parent-green-public-v3\\report.json'));assert.equal(parent.exit,0);assert.equal(parent.validChanged,435);
  const originalFreeze=JSON.parse(fs.readFileSync(path.join(ns,authority.freeze)));
  for(const row of originalFreeze.sources)assert.equal(sha(fs.readFileSync(path.join(ns,row.path))),row.sha256,'exact actual prior control/source input '+row.path);
  return{files:old.files.length+1,sourceInputsExact:originalFreeze.sources.length,validChanged:435,proofs:435,semanticUnresolved:0,
    parentUnchangedGreen:true,resourceNativeRole:'exact original public-v3 producer/UI/data/control source reuse; historical actual campaigns; no new campaign or counter reset'};
}
function packageEvidence(){
  predecessor();assert.equal(auditMap(true).privatePreimagesChecked,4932);
  const freeze=JSON.parse(fs.readFileSync(process.env.C012_PUBLIC_FREEZE));
  for(const row of freeze.sources)assert.equal(sha(fs.readFileSync(path.join(ns,row.path))),row.sha256);
  fs.mkdirSync(folder,{recursive:false});
  const records=[],meta=process.env.C012_METADATA;
  for(const relative of ['git-transport-v4\\report.json','fresh-v4\\report.json','coverage-v4\\report.json','whole-v4.stdout.raw','whole-v4.stderr.raw']){
    const original=fs.readFileSync(path.join(meta,relative)),encoded=projectRecord(original),artifact=path.join('current-records',relative+'.projection.json.gz');
    fs.mkdirSync(path.dirname(path.join(folder,artifact)),{recursive:true});fs.writeFileSync(path.join(folder,artifact),encoded,{flag:'wx'});
    records.push({relative,artifact,originalPrivateSha256:sha(original),publicSha256:sha(encoded),role:'explicit current execution public projection, not original raw'});
  }
  const data={schema:'C012-public-v4-exact-own-Git-byte-policy-authority/4',createdAtUtc:new Date().toISOString(),
    predecessorHeadSha256:'0b06335b9fd59e3fc90b97495b0372c40db1d07cf54acd8ae45f4dd3f367efb2',
    sourceFreeze:path.relative(ns,process.env.C012_PUBLIC_FREEZE),sourceFreezeSha256:sha(fs.readFileSync(process.env.C012_PUBLIC_FREEZE)),
    bytePolicy:{path:'.gitattributes',sha256:sha(fs.readFileSync(path.join(ns,'.gitattributes'))),textPolicy:'* -text'},
    records,oldPrivateAndPublicHeadsUnchanged:true,noNewNativeOrResourceCampaign:true,applicationOrPublication:false};
  fs.writeFileSync(path.join(folder,'authority.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  const scanned=scan(ns);assert.equal(scanned.findings.length,0);
  fs.writeFileSync(path.join(folder,'whole-head.json'),JSON.stringify({schema:'C012-public-v4-every-actual-byte-head/4',files:scanned.files,
    fileSetSha256:sha(JSON.stringify(scanned.files)),selfExcludedOnly:'evidence\\public-v4\\whole-head.json',
    roles:scanned.files.map(row=>({path:row.path,role:row.path.startsWith('evidence\\public-v4')?'current Git transport authority/projection':row.path==='.gitattributes'?'persistent exact own-namespace source/data byte policy':row.path.startsWith('tests\\public-v4')?'operative current source selector/transport verification':'unchanged public predecessor source/data/history, exact digest required'}))},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({packaged:true,files:scanned.files.length,privacy:0}));
}
function verify(){
  const p=predecessor(),a=JSON.parse(fs.readFileSync(path.join(folder,'authority.json'))),h=JSON.parse(fs.readFileSync(path.join(folder,'whole-head.json'))),actual=scan(ns);
  assert.equal(actual.findings.length,0);assert.deepEqual(actual.files.filter(row=>row.path!=='evidence\\public-v4\\whole-head.json'),h.files);
  assert.equal(sha(JSON.stringify(h.files)),h.fileSetSha256);assert.deepEqual(h.roles.map(row=>row.path),h.files.map(row=>row.path));
  assert.equal(fs.readFileSync(path.join(ns,'.gitattributes'),'utf8').trim(),'* -text');
  assert.equal(sha(fs.readFileSync(path.join(ns,'.gitattributes'))),a.bytePolicy.sha256);
  const records=new Map();
  for(const row of a.records){const encoded=fs.readFileSync(path.join(folder,row.artifact));assert.equal(sha(encoded),row.publicSha256);records.set(row.relative,readRecord(encoded).body);}
  const git=JSON.parse(records.get('git-transport-v4\\report.json'));assert.equal(git.pass,true);assert.equal(git.red.changed,true);assert.equal(git.green.rawEqual,true);
  assert.equal(git.allOrdinaryIndexBlobsRawExact,true);assert.equal(git.allRealCheckoutBytesExact,true);assert.equal(git.sharedIndexWritten,false);assert.equal(git.globalConfigChanged,false);assert.equal(git.fixtureRemoved,true);
  const whole=records.get('whole-v4.stdout.raw').toString(),count=Number(/^# tests (\d+)$/m.exec(whole)?.[1]);assert.ok(count>=46);assert.match(whole,new RegExp('^# pass '+count+'$','m'));assert.match(whole,/^# fail 0$/m);
  const fresh=JSON.parse(records.get('fresh-v4\\report.json'));assert.equal(fresh.pass,true);assert.equal(fresh.reports.length,2);for(const row of fresh.reports){assert.equal(row.summary.tests,count);assert.equal(row.summary.pass,count);assert.equal(row.exit,0);}
  const coverage=JSON.parse(records.get('coverage-v4\\report.json'));assert.equal(coverage.pass,true);assert.equal(coverage.files.length,4);for(const row of coverage.files){assert.equal(row.loaded,true);for(const k of ['lines','branches','functions'])assert.ok(row[k]>=85);assert.equal(sha(fs.readFileSync(path.join(ns,row.file))),row.sourceReadSha256);}
  assert.equal(auditMap(true).privatePreimagesChecked,4932);
  return{schema:'C012-public-v4-complete-exact-Git-transport-and-source-reuse-audit/4',pass:true,sourceInputsExact:p.sourceInputsExact,
    currentTests:count,freshKinds:fresh.reports.map(row=>row.kind),coverage:coverage.files.map(row=>({file:row.file,loaded:row.loaded,lines:row.lines,branches:row.branches,functions:row.functions})),
    validChanged:435,proofs:435,semanticUnresolved:0,parentUnchangedGreen:true,all4932DerivationsPreserved:true,publicFiles:actual.files.length,
    privacyIdentifiers:0,expandedGzipBodies:actual.gzipBodies,realGit:{red:true,filteredGreen:true,checkoutExact:true,files:git.files.length,privateFixtureOnly:true,published:false,newHeadQualification:false},
    resourceNativeHistoricalSourceInputsExact:true,newNativeCampaigns:0,newResourceCampaigns:0,counterReset:false,
    headSha256:sha(fs.readFileSync(path.join(folder,'whole-head.json')))};
}
if(require.main===module){try{if(process.argv[2]==='package')packageEvidence();else if(process.argv[2]==='verify')console.log(JSON.stringify(verify(),null,2));else throw Error('explicit mode required');}catch(error){console.error(error);process.exitCode=1;}}
module.exports={verify};
