'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha}=require('./public-v3-transport.cjs');
const ns=path.resolve(__dirname,'..'),root=path.resolve(ns,'..','..'),map=JSON.parse(fs.readFileSync(path.join(ns,'evidence','public-v3','transport-map.json')));
function reuse(){
  const predecessor=process.env.C012_PREDECESSOR_NAMESPACE;assert.ok(predecessor,'explicit original-private reference is required, not a missing-preimage fallback');
  const old=path.join(process.env.C012_PRIVATE_ROOT,'c','capability','C012'),records=[];
  for(const phase of ['resource64-final','browser-final']){
    const manifestFile=path.join(old,'evidence',phase,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
    assert.equal(manifest.exit,0);assert.equal(manifest.error,null);assert.equal(manifest.signal,null);
    const inputs=manifest.inputs.map(input=>{
      let actual,publicPath=input.path;
      if(input.path.startsWith('capability\\C012\\')){
        const relative=input.path.slice('capability\\C012\\'.length),entry=map.entries.find(row=>row.originalRelativePath===relative);
        assert.ok(entry,'complete predecessor mapping '+relative);
        assert.equal(entry.contentChanged,false,'an actually loaded/snapshotted control cannot be called exact after redaction');
        publicPath=entry.publicRelativePath;actual=fs.readFileSync(path.join(ns,publicPath));
      }else actual=fs.readFileSync(path.join(root,input.path));
      assert.equal(sha(actual),input.sha256,'exact historical program/data/control binding '+input.path);
      return{originalInput:input.path,publicArtifact:publicPath,sha256:input.sha256,byteExact:true};
    });
    records.push({phase,originalPrivateManifestSha256:sha(fs.readFileSync(manifestFile)),inputs,
      role:'HISTORICAL original-c actual observation with exact program/UI/data/producer/control bytes; public log projections are not original raw',
      newCampaignRun:false,cleanupAuthorityReused:false});
  }
  return{schema:'C012-public-v3-exact-historical-loaded-source-binding/3',records,newNativeCampaigns:0,newResourceCampaigns:0,productionChanged:false,
    resource:{total:64,concurrency:8},native:{qualifiedMajor:157,sessions:2},projectedLogsClaimedOriginal:false};
}
module.exports={reuse};
if(require.main===module){const output=process.env.C012_PUBLIC_REUSE_OUTPUT;assert.ok(output);const report=reuse();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({historicalPhases:report.records.length,exactInputs:report.records.map(row=>row.inputs.length),newNativeCampaigns:0}));}
