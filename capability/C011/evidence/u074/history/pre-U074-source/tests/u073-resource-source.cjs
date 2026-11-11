'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {sha,list,root:namespace}=require('./u073-seal.cjs');
const candidate=path.resolve(namespace,'..','..');
function verify(snapshot){
  const freeze=JSON.parse(fs.readFileSync(path.join(namespace,'evidence','u073','current','source-freeze.json')));
  assert.equal(sha(fs.readFileSync(path.join(namespace,'evidence','u073','current','source-freeze.json'))),snapshot.sourceFreezeSha256);
  assert.deepEqual(list().filter(file=>!file.startsWith('evidence/')).sort(),freeze.files.map(file=>file.path).sort());
  for(const entry of freeze.files)assert.equal(sha(fs.readFileSync(path.join(namespace,...entry.path.split('/')))),entry.sha256,'Final current source remains exact: '+entry.path);
  for(const entry of freeze.dependencies){
    assert.equal(sha(fs.readFileSync(path.join(candidate,...entry.path.split('/')))),entry.currentRawSha256,'Immutable copied dependency: '+entry.path);
    assert.equal(sha(fs.readFileSync(path.join(snapshot.repo,...entry.path.split('/')))),entry.currentRawSha256,'Current accepted live dependency: '+entry.path);
  }
  for(const entry of freeze.liveFiles)assert.equal(sha(fs.readFileSync(path.join(snapshot.repo,'capability','C011',...entry.path.split('/')))),entry.sha256,'Live C011 remains read-only');
  return true;
}
function make(repo,file){
  assert.ok(path.isAbsolute(repo)&&path.isAbsolute(file));
  const freezePath=path.join(namespace,'evidence','u073','current','source-freeze.json'),freeze=JSON.parse(fs.readFileSync(freezePath)),modules={};
  for(const entry of freeze.files.filter(file=>/\.(?:cjs|js|json)$/.test(file.path)))modules[path.join(namespace,...entry.path.split('/'))]=entry.sha256;
  for(const entry of freeze.dependencies)modules[path.join(candidate,...entry.path.split('/'))]=entry.currentRawSha256;
  const snapshot={schema:'U073-current-resource-bindings/1',namespace,repo,modules,sourceFreezeSha256:sha(fs.readFileSync(freezePath))};
  verify(snapshot);fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});return snapshot;
}
module.exports={sha,verify,make};
