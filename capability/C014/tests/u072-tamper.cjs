'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const a=require('./u072-authority.cjs');
const {checkManifest}=require('./evidence-check.cjs');
const directory=path.join(a.ROOT,'tests','scratch',`u072-transport-tamper-${randomUUID()}`);
const repository=path.join(directory,'repository');
const namespace=path.join(repository,'capability','C014');
const source=a.current('green-suite');
const copy=path.join(namespace,'evidence','u072','captures','current.json');
const manifest=JSON.parse(fs.readFileSync(source));
const controls=[];
function put(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
try{
  for(const entry of manifest.inputs)put(path.join(repository,entry.path),fs.readFileSync(path.join(a.REPO,entry.path)));
  for(const entry of Object.values(manifest.transcripts))put(path.resolve(path.dirname(copy),entry.path),fs.readFileSync(path.resolve(path.dirname(source),entry.path)));
  for(const entry of manifest.dataInputs){
    const target=path.join(namespace,entry.sourceWitness);
    put(target,fs.readFileSync(path.join(a.ROOT,entry.sourceWitness)));
    entry.sourceWitness=path.relative(a.ROOT,target).replace(/\\/g,'/');
  }
  const clean=JSON.stringify(manifest,null,2)+'\n';
  put(copy,clean);
  const original=new Map();
  function remember(root){for(const item of fs.readdirSync(root,{withFileTypes:true})){const file=path.join(root,item.name);if(item.isDirectory())remember(file);else original.set(file,fs.readFileSync(file));}}
  remember(directory);
  const stream=path.resolve(path.dirname(copy),manifest.transcripts.stdout.path);
  const input=path.join(repository,manifest.inputs[0].path);
  const witness=path.join(a.ROOT,manifest.dataInputs[0].sourceWitness);
  const edit=(change)=>{const data=JSON.parse(clean);change(data);put(copy,JSON.stringify(data));};
  const cases=[
    ['public projected stream byte',( )=>{const bytes=fs.readFileSync(stream);bytes[bytes.length-3]^=1;put(stream,bytes);},/stdout PUBLIC_STREAM_GZIP_CHANGED/],
    ['missing public projected stream',()=>fs.rmSync(stream),/stdout ENOENT/],
    ['current executed source byte',()=>fs.appendFileSync(input,'\n// tampered fixture\n'),/source input .+ changed after the capture/],
    ['missing current executed source',()=>fs.rmSync(input),/source input .+ is missing/],
    ['versioned public input byte',()=>fs.appendFileSync(witness,'\n'),/versioned public data witness .+ changed/],
    ['missing versioned public input',()=>fs.rmSync(witness),/versioned public data witness .+ changed/],
    ['public observed exit state',()=>edit((data)=>{data.exitCode=1;}),/qualifying exit state changed/],
    ['a timeout is not successful evidence',()=>edit((data)=>{data.timedOut=true;}),/qualifying exit state changed/],
    ['private original digest role',()=>edit((data)=>{data.origin.manifestSha256='not-a-digest';}),/private-origin digest\/role is missing/],
    ['unrecognized evidence role',()=>edit((data)=>{data.role='anything-is-current';}),/unrecognized public capture role/],
    ['projection cannot become original raw',()=>edit((data)=>{data.transcripts.stdout.role='original raw';}),/PUBLIC_STREAM_ROLE_CHANGED/],
    ['public stream namespace traversal',()=>edit((data)=>{data.transcripts.stdout.path=path.relative(path.dirname(copy),path.resolve(a.ROOT,'..','..','private-outside.gz'));}),/PUBLIC_STREAM_PATH_OUTSIDE_NAMESPACE/]
  ];
  assert.ok(manifest.inputs.length>0&&manifest.dataInputs.length>0,'the fixture exercises actual source and versioned public data requirements');
  for(const [name,tamper,expected]of cases){
    assert.deepEqual(checkManifest(copy,{repository}),[],`${name}: the complete public fixture is green before tampering`);
    tamper();
    const problems=checkManifest(copy,{repository});
    assert.ok(problems.some((problem)=>expected.test(problem)),`${name}: named detection, not a module/environment fault: ${JSON.stringify(problems)}`);
    controls.push({name,detected:true});
    for(const [file,bytes]of original)put(file,bytes);
  }
  const history=a.catalog().manifests.find((entry)=>entry.role==='private historical attempt projection, not source-qualified');
  assert.ok(history,'the omitted private first-attempt documents have an explicit historical public role');
  const historical=JSON.parse(fs.readFileSync(path.join(a.ROOT,history.path)));
  const historicalFile=path.join(directory,'historical.json');
  for(const entry of Object.values(historical.transcripts))entry.path=path.relative(directory,path.resolve(path.dirname(path.join(a.ROOT,history.path)),entry.path));
  put(historicalFile,JSON.stringify(historical));
  assert.deepEqual(a.verifyPublicCapture(historicalFile),[],'historical private-origin digests are not missing public filesystem requirements');
  historical.inputs.push({path:'capability/C014/canon.cjs',crlfToLfSha256:a.sha(a.lf(fs.readFileSync(path.join(a.ROOT,'canon.cjs'))))});
  put(historicalFile,JSON.stringify(historical));
  assert.ok(a.verifyPublicCapture(historicalFile).some((problem)=>/private history was relabeled public source/.test(problem)),'private history cannot be relabeled current public source');
  controls.push({name:'private historical input role',detected:true});
  const retained=a.catalog().retained[0];
  assert.deepEqual(a.verifyRetainedCapture(path.join(a.ROOT,retained.path),retained),[],'retained historical bytes have a specific exact declaration');
  assert.ok(a.verifyRetainedCapture(path.join(a.ROOT,retained.path),{...retained,sourceQualified:true}).some((problem)=>/historical role changed/.test(problem)),'a retained historical capture cannot become a current qualifying source claim');
  controls.push({name:'retained historical source qualification',detected:true});
  console.log(JSON.stringify({schema:'U072-public-transport-tamper-controls/1',controls,passed:controls.length,failed:0},null,2));
}finally{fs.rmSync(directory,{recursive:true,force:true});}
