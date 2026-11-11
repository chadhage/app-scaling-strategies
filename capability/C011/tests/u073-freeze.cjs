'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,list,sha}=require('./u073-seal.cjs');
const candidate=path.resolve(root,'..','..'),repo=process.env.C011_GIT_REPOSITORY;
assert.ok(repo&&path.isAbsolute(repo),'Explicit owning repository is required');
const destination=path.join(root,'evidence','u073','current'),target=path.join(destination,'source-freeze.json');
assert.equal(fs.existsSync(target),false,'The new qualifying freeze is immutable, never repinned');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'evidence','u073','history','published-baseline.json')));
const forms=bytes=>{
  const lf=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  return[...new Set([sha(bytes),sha(lf),sha(Buffer.from(lf.toString('utf8').replace(/\n/g,'\r\n')))])];
};
const files=list().filter(file=>!file.startsWith('evidence/')).map(file=>{
  const bytes=fs.readFileSync(path.join(root,...file.split('/')));return{path:file,bytes:bytes.length,sha256:sha(bytes),acceptedSha256:forms(bytes)};
});
const PRODUCTION=['codes.cjs','config.cjs','contract.js','json.cjs','page.js','server.cjs','store.cjs'];
assert.deepEqual(fs.readdirSync(root).filter(file=>/\.c?js$/.test(file)).sort(),[...PRODUCTION].sort(),'No first-party production exclusion');
fs.mkdirSync(path.join(destination,'subjects'),{recursive:true});
const production=PRODUCTION.map(file=>{
  const bytes=fs.readFileSync(path.join(root,file)),prior=baseline.files.find(entry=>entry.path===file);
  assert.equal(sha(bytes),prior.sha256,'No U073 production change is authorized: '+file);
  const subject='evidence/u073/current/subjects/'+sha(bytes)+'.source.txt';
  fs.writeFileSync(path.join(root,...subject.split('/')),bytes,{flag:'wx'});
  return{path:file,subject,rawSha256:sha(bytes),publishedGitBlobOid:prior.gitBlobOid,changed:false};
});
const originalSources=new Set(baseline.sourceFiles.map(file=>file.path));
const inherited=baseline.files.map(entry=>{
  const file=originalSources.has(entry.path)?'evidence/u073/history/pre-U073-source/'+entry.path:entry.path;
  assert.equal(sha(fs.readFileSync(path.join(root,...file.split('/')))),entry.sha256,'Original publication role remains exact Git bytes');
  return{path:file,sha256:entry.sha256,originalPath:entry.path,gitBlobOid:entry.gitBlobOid};
});
const dependencies=baseline.dependencies.map(entry=>{
  const live=fs.readFileSync(path.join(repo,...entry.path.split('/'))),copied=fs.readFileSync(path.join(candidate,...entry.path.split('/')));
  assert.equal(sha(copied),entry.currentRawSha256,'No copied dependency edit');
  assert.equal(sha(live),entry.currentRawSha256,'Accepted immutable dependency remains current');
  return{...entry,role:'Actual immutable runtime dependency, read-only'};
});
const currentImports=fs.readFileSync(path.join(root,'imports.json'));
assert.equal(sha(currentImports),baseline.files.find(entry=>entry.path==='imports.json').sha256,'No import/pin amendment authorized');
function consumerPaths(directory,prefix=''){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    assert.equal(entry.isSymbolicLink(),false,'No consumer reparse-point adoption');
    if(entry.name==='evidence')return[];
    if(entry.isDirectory())return consumerPaths(path.join(directory,entry.name),prefix+entry.name+'/');
    return /\.(?:cjs|js|json|md|html|css|feature)$/.test(entry.name)?[prefix+entry.name]:[];
  });
}
const consumerSources=consumerPaths(path.join(repo,'capability','C009')).map(file=>{
  const relative='capability/C009/'+file,bytes=fs.readFileSync(path.join(repo,...relative.split('/')));
  return{path:relative,sha256:sha(bytes),bytes:bytes.length,role:'Actual unchanged C009 regression source, not a C011 runtime import amendment'};
}).sort((a,b)=>a.path.localeCompare(b.path));
const liveFiles=baseline.files.map(entry=>{
  const bytes=fs.readFileSync(path.join(repo,'capability','C011',...entry.path.split('/'))),digest=sha(bytes);
  if(digest!==entry.sha256){
    assert.ok(originalSources.has(entry.path),'Historical evidence may not be normalized');
    assert.equal(sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'))),entry.sha256,'Only qualified publication LF source transport');
  }
  return{path:entry.path,sha256:digest,publishedGitSha256:entry.sha256};
});
const red=JSON.parse(fs.readFileSync(path.join(candidate,'private','captures','U073-causal-server-red-01.json')));
const redSources=red.inputs.map(entry=>{
  const relative=entry.path.replaceAll('\\','/').split('/capability/C011/')[1];
  assert.ok(relative,'RED source belongs only to C011');
  const file='evidence/u073/history/red-01-source/'+relative;
  assert.equal(sha(fs.readFileSync(path.join(root,...file.split('/')))),entry.rawSha256,'Actual RED preimage remains exact');
  return{path:file,sha256:entry.rawSha256,originalPath:relative};
});
const history= require('./u073-history.cjs').verifyPublished();
assert.deepEqual(history.integrity,[]);assert.deepEqual(history.decisions,[]);
fs.writeFileSync(target,JSON.stringify({schema:'U073-source-freeze/1',frozenAtUtc:new Date().toISOString(),files,production,dependencies,consumerSources,
  inherited,redSources,liveFiles,publication:baseline.commit,publicationFiles:5745,productionEdits:0,importEdits:0,
  historicalRole:'Prior cbd qualifications are verified only through exact retained Git source; the current filesystem is separately fully enumerated',
  oldClientAssertionVersioned:true,oldFailureStillGenuine:true,originalChronologyCertified:false,gitIndexOrHeadWritten:false,
  sourcePolicy:'Exact raw/LF/CRLF current source representations; historical evidence bytes stay raw exact, never normalized'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sourceFiles:files.length,productionFiles:production.length,productionEdits:0,importEdits:0,
  inheritedPublicationFiles:inherited.length,redPreimages:redSources.length,dependencies:dependencies.length,sourceFreezeSha256:sha(fs.readFileSync(target))}));
