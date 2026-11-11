'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,list,pin,sha}=require('./u074-seal.cjs'),{verifyPublished,baseline}=require('./u074-history.cjs');
const candidate=path.resolve(root,'..','..'),repo=process.env.C011_GIT_REPOSITORY;
assert.ok(repo&&path.isAbsolute(repo));
const target=path.join(root,'evidence','u074','current','source-freeze.json');assert.equal(fs.existsSync(target),false);
const files=list().filter(file=>!file.startsWith('evidence/')).map(pin);
const production=['codes.cjs','config.cjs','contract.js','json.cjs','page.js','server.cjs','store.cjs'].map(file=>{
  const bytes=fs.readFileSync(path.join(root,file)),prior=baseline.files.find(row=>row.path===file);assert.equal(sha(bytes),prior.sha256,'No production edit authorized');
  const subject='evidence/u074/current/subjects/'+sha(bytes)+'.source.txt';fs.mkdirSync(path.dirname(path.join(root,...subject.split('/'))),{recursive:true});
  fs.writeFileSync(path.join(root,...subject.split('/')),bytes,{flag:'wx'});
  return{path:file,subject,rawSha256:sha(bytes),publishedGitBlobOid:prior.gitBlobOid};
});
assert.equal(sha(fs.readFileSync(path.join(root,'imports.json'))),baseline.files.find(row=>row.path==='imports.json').sha256,'No import amendment');
const sourceNames=new Set(baseline.sourceFiles.map(row=>row.path));
const inherited=baseline.files.map(row=>{
  const file=sourceNames.has(row.path)?'evidence/u074/history/pre-U074-source/'+row.path:row.path;
  assert.equal(sha(fs.readFileSync(path.join(root,...file.split('/')))),row.sha256);
  return{path:file,sha256:row.sha256,originalPath:row.path};
});
const historical=list().filter(file=>file.startsWith('evidence/u074/history/')).map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,...file.split('/'))))}));
const dependencies=baseline.dependencies.map(row=>{
  const local=fs.readFileSync(path.join(candidate,...row.path.split('/'))),live=fs.readFileSync(path.join(repo,...row.path.split('/')));
  assert.equal(sha(local),row.currentRawSha256);assert.equal(sha(live),row.currentRawSha256);
  return row;
});
for(const row of baseline.liveFiles)assert.equal(sha(fs.readFileSync(path.join(repo,'capability','C011',...row.path.split('/')))),row.sha256,'All original7005 live bytes remain unchanged');
const old=verifyPublished();assert.deepEqual(old.integrity,[]);assert.deepEqual(old.decisions,[]);
fs.writeFileSync(target,JSON.stringify({schema:'U074-source-freeze/1',frozenAtUtc:new Date().toISOString(),files,production,dependencies,inherited,historical,
  liveFiles:baseline.liveFiles,consumerSources:JSON.parse(fs.readFileSync(path.join(root,'evidence','u073','current','source-freeze.json'))).consumerSources,
  publication:baseline.commit,publicationFiles:7005,productionEdits:0,importEdits:0,originalChronologyCertified:false,
  historicalRole:'Prior7005 exact publication role is independently verified; every current physical file receives the new seal, no blanket exception',
  parser:require('./u074-parser.cjs').identity},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,production:production.length,inherited:inherited.length,historical:historical.length,sha256:sha(fs.readFileSync(target))}));
