'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha,inspect}=require('./public-v3-transport.cjs');
const {project}=require('./public-v3-projection.cjs');
const {lf}=require('./integrity.cjs');
const ns=path.resolve(__dirname,'..');
function auditMap(requirePrivate=true){
  const map=JSON.parse(fs.readFileSync(path.join(ns,'evidence','public-v3','transport-map.json')));
  assert.equal(map.originalFiles,4932);assert.equal(map.entries.length,4932);
  const privateRoot=process.env.C012_PREDECESSOR_NAMESPACE;
  const privateAvailable=!!privateRoot&&fs.existsSync(privateRoot);
  if(requirePrivate)assert.ok(privateAvailable,'original private preimages are unavailable; NOT a verified derivation');
  const paths=new Set();let projected=0,privateChecked=0;
  for(const entry of map.entries){
    assert.ok(!paths.has(entry.publicRelativePath));paths.add(entry.publicRelativePath);
    assert.ok(!path.isAbsolute(entry.publicRelativePath)&&!entry.publicRelativePath.split(path.sep).includes('..'));
    const bytes=fs.readFileSync(path.join(ns,entry.publicRelativePath));
    const freshSource=!!process.env.C012_FRESH_KIND&&!entry.originalRelativePath.startsWith('evidence'+path.sep)&&!entry.pathChanged&&!entry.contentChanged;
    if(!freshSource){assert.equal(sha(bytes),entry.publicSha256);assert.equal(bytes.length,entry.publicBytes);}
    assert.deepEqual(inspect(bytes).findings,[],entry.publicRelativePath);
    if(entry.contentChanged){projected++;assert.ok(entry.role.includes('projection'));assert.notEqual(entry.publicSha256,entry.originalPrivateSha256);}
    assert.equal(entry.alteredHistoricalProgramClaimedExecuted,false);
    if(privateAvailable){
      const original=fs.readFileSync(path.join(privateRoot,entry.originalRelativePath));
      assert.equal(sha(original),entry.originalPrivateSha256);
      const regenerated=project(original,entry.originalRelativePath);
      assert.equal(regenerated.kind,entry.projectionKind);assert.equal(sha(regenerated.bytes),entry.publicSha256,'exact declared projection '+entry.originalRelativePath);
      if(freshSource)assert.equal(sha(lf(bytes)),sha(lf(regenerated.bytes)),'explicit fresh source encoding, not changed raw history');
      privateChecked++;
    }
  }
  return {schema:'C012-public-v3-complete-projection-derivation-audit/3',publicFiles:paths.size,projected,
    privatePreimageStatus:privateAvailable?'all-present-checked':'unavailable',privatePreimagesChecked:privateChecked,
    derivationVerified:privateAvailable&&privateChecked===map.entries.length,publicBytesVerified:true,missingPreimageIsSuccess:false};
}
module.exports={auditMap};
