'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {sha,lf,pin}=require('./integrity.cjs');
const {auditMap}=require('./public-v3-map.cjs');
const {remaining}=require('./budget.cjs');
const ns=path.resolve(__dirname,'..'),root=path.resolve(ns,'..','..');
test('all4932 actual public artifacts and every changed history projection have exact private/original and public-role bindings',()=>{
  const report=auditMap(true);assert.equal(report.privatePreimagesChecked,4932);assert.equal(report.derivationVerified,true);
});
test('all accepted imported producer bytes and fixed Git-object/tag pins remain readonly exact or declared LF/CRLF representations',()=>{
  for(const row of require('../imports.json').entries){
    const bytes=fs.readFileSync(path.join(root,row.path));assert.equal(pin(bytes,row),true);
    const git=spawnSync('git',['--no-pager','-C',process.env.C012_GIT_REPOSITORY,'show',row.commit+':'+row.path.replaceAll('\\','/')],
      {windowsHide:true,timeout:Math.min(remaining(60000),30000),maxBuffer:8*1024*1024});
    assert.equal(git.error,undefined);assert.equal(git.status,0);assert.equal(sha(git.stdout),row.git);
  }
});
test('retained original acceptance and all operative source programs are distinct from source-history projections',()=>{
  const map=JSON.parse(fs.readFileSync(path.join(ns,'evidence','public-v3','transport-map.json')));
  for(const file of ['fixtures.js','model.js','page.js','index.html']){
    const row=map.entries.find(item=>item.originalRelativePath===file);
    assert.equal(row.contentChanged,false);assert.equal(row.pathChanged,false);
    if(process.env.C012_FRESH_KIND)assert.equal(sha(lf(fs.readFileSync(path.join(ns,file)))),sha(lf(fs.readFileSync(path.join(process.env.C012_PREDECESSOR_NAMESPACE,file)))));
    else assert.equal(sha(fs.readFileSync(path.join(ns,file))),row.originalPrivateSha256);
  }
  const row=map.entries.find(item=>item.originalRelativePath==='evidence\\red\\sources\\capability\\C012\\tests\\acceptance.test.cjs');
  assert.ok(row.publicRelativePath.endsWith('.txt'));
  assert.equal(sha(lf(fs.readFileSync(path.join(ns,'tests','acceptance.test.cjs')))),sha(lf(fs.readFileSync(path.join(ns,row.publicRelativePath)))));
  for(const item of map.entries.filter(item=>item.originalRelativePath.startsWith('evidence\\')&&/\.(?:cjs|js|ps1)$/.test(item.originalRelativePath)))
    assert.ok(item.publicRelativePath.endsWith('.txt'),'history is not executable auto-discovery source');
});
test('new public watchdog is an explicit current program projection, not the old private worker program',()=>{
  const projections=JSON.parse(fs.readFileSync(path.join(ns,'evidence','public-v3','program-projections.json')));
  for(const entry of projections.entries){
    const actual=fs.readFileSync(path.join(ns,entry.publicRelativePath)),original=fs.readFileSync(path.join(ns,entry.originalHistoricalArtifact));
    if(process.env.C012_FRESH_KIND)assert.equal(sha(lf(actual)),sha(lf(fs.readFileSync(path.join(process.env.C012_PUBLIC_CANONICAL_NAMESPACE,entry.publicRelativePath)))));
    else assert.equal(sha(actual),entry.publicSha256);
    assert.equal(sha(original),entry.originalPrivateSha256);
    assert.equal(entry.oldProgramClaimedExecutedAsNew,false);assert.equal(entry.workerOuterDeadlineUnchanged,true);
  }
});
