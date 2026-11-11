'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {remaining,environment}=require('./budget.cjs');
const {sha}=require('./public-v3-transport.cjs');
const {copyTree,physical}=require('./source.cjs');
const ns=path.resolve(__dirname,'..'),output=process.env.C012_GIT_TRANSPORT_OUTPUT;
assert.ok(output&&path.isAbsolute(output));fs.mkdirSync(output,{recursive:false});
const work=path.join(process.env.C012_PRIVATE_ROOT,'git-transport-c4');fs.mkdirSync(work);const own=physical(work);
function git(args,cwd=work){
  const result=spawnSync('git',['--no-pager','-c','core.autocrlf=true',...args],{cwd,env:environment(),windowsHide:true,
    timeout:Math.min(remaining(60000),300000),maxBuffer:32*1024*1024});
  if(result.status!==0||result.error||result.signal)throw Error('private Git fixture failure: '+String(result.stderr));
  return result.stdout;
}
const oid=bytes=>crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
let report;
try{
  git(['init','--quiet']);
  const target=path.join(work,'capability','C012');fs.mkdirSync(target,{recursive:true});
  const original=fs.readFileSync(path.join(ns,'model.js'));fs.writeFileSync(path.join(target,'model.js'),original,{flag:'wx'});
  const raw=git(['hash-object','--no-filters','capability\\C012\\model.js']).toString().trim();
  const red=git(['hash-object','--path=capability/C012/model.js','capability\\C012\\model.js']).toString().trim();
  assert.notEqual(red,raw,'actual no-policy ordinary Git transport RED must change CRLF bytes');
  fs.rmSync(path.join(work,'capability'),{recursive:true,force:false});fs.mkdirSync(path.join(work,'capability'));
  copyTree(ns,target);
  const green=git(['hash-object','--path=capability/C012/model.js','capability\\C012\\model.js']).toString().trim();
  assert.equal(green,raw,'persistent own namespace policy preserves ordinary filtered source');
  git(['add','--','capability\\C012']);
  const staged=git(['ls-files','--stage','-z']).toString('utf8').split('\0').filter(Boolean);
  const rows=staged.map(line=>{
    const match=/^(\d+) ([0-9a-f]{40}) 0\t(.+)$/.exec(line);assert.ok(match);
    const relative=match[3],source=fs.readFileSync(path.join(work,...relative.split('/')));
    assert.equal(match[2],oid(source),'every ordinary-index blob is raw exact: '+relative);
    return{path:relative,bytes:source.length,sha256:sha(source),gitOid:match[2]};
  });
  const checkout=path.join(work,'checkout');fs.mkdirSync(checkout);
  git(['checkout-index','--all','--prefix='+checkout+path.sep]);
  for(const row of rows)assert.equal(sha(fs.readFileSync(path.join(checkout,...row.path.split('/')))),row.sha256,'real checkout exact: '+row.path);
  report={schema:'C012-real-own-policy-Git-filter-and-checkout-transport/4',coreAutocrlf:true,
    red:{rawOid:raw,ordinaryNoPolicyOid:red,changed:raw!==red},green:{ordinaryPolicyOid:green,rawEqual:green===raw},
    allOrdinaryIndexBlobsRawExact:true,allRealCheckoutBytesExact:true,files:rows,
    privateFixtureOnly:true,sharedIndexWritten:false,globalConfigChanged:false,applied:false,published:false,newHeadQualification:false,pass:true};
}finally{
  assert.deepEqual(physical(work),own);fs.rmSync(work,{recursive:true,force:false});
  if(report)fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({...report,fixtureRemoved:true},null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({files:report.files.length,realRed:true,realFilteredGreen:true,realCheckoutExact:true,privateFixtureOnly:true,published:false}));
