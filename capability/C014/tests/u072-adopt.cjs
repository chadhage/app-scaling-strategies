'use strict';
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const a=require('./u072-authority.cjs');
const {ROOT,REPO,AREA,CATALOG,sha,lf}=a;
const [name,kind]=process.argv.slice(2);
assert.ok(/^[a-z0-9-]+$/.test(name)&&kind);
const directory=path.join(process.env.U072_PRIVATE_ROOT,'captures',name);
const bytes=fs.readFileSync(path.join(directory,`${name}.json`));
const original=JSON.parse(bytes);
assert.equal(original.exitCode,original.expectedExitCode);
assert.equal(original.timedOut,false);
const user=/[\\/]Users[\\/]([^\\/]+)/i.exec(REPO)?.[1];
const ids=JSON.parse(process.env.C014_PRIVATE_IDENTIFIERS||'[]');
function project(text){
  for(const [root,replacement]of [[REPO,'<PUBLIC-CANDIDATE>'],[process.env.C014_GIT_ANCHOR,'<REPO>']]){
    if(!root)continue;
    text=text.split(root.replace(/\\/g,'\\\\')).join(replacement).split(root).join(replacement).split(root.replace(/\\/g,'/')).join(replacement);
  }
  text=text.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/g,'<HOME>');
  for(const entry of [...ids,{id:'local-user',value:user},{id:'execution-prefix',value:/execution-\d+-([a-f0-9]+)/i.exec(REPO)?.[1]}]){
    if(entry.value)text=text.replace(new RegExp(entry.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),`<LOCAL:${entry.id}>`);
  }
  return text;
}
const data={schemaVersion:1,schema:'C014-public-capture-projection/1',name,role:'new source-complete execution',
  origin:{manifestSha256:sha(bytes),role:'immutable private original command capture, not public raw'},
  exitCode:original.exitCode,expectedExitCode:original.expectedExitCode,timedOut:original.timedOut,summary:original.summary,
  commandProjection:original.command.map((arg)=>project(arg)),inputs:[],dataInputs:[],transcripts:{}};
for(const input of original.inputs){
  const current=path.join(REPO,input.path);
  if(input.path.replace(/\\/g,'/')!=='capability/C014/evidence/u072/catalog.json'&&fs.existsSync(current)&&sha(lf(fs.readFileSync(current)))===input.crlfToLfSha256){
    data.inputs.push(input);continue;
  }
  const actual=fs.readFileSync(path.join(directory,'inputs',input.path));
  assert.equal(sha(lf(actual)),input.crlfToLfSha256);
  assert.ok(actual.toString('utf8')===project(actual.toString('utf8')),'an executed source witness must be clean without rewriting it');
  const ext=path.extname(input.path)||'.bin';
  const witness=path.join(AREA,'data-inputs',`${sha(actual)}${ext}`);
  fs.mkdirSync(path.dirname(witness),{recursive:true});
  if(!fs.existsSync(witness))fs.writeFileSync(witness,actual,{flag:'wx'});
  data.dataInputs.push({...input,role:'exact public versioned source/data witness',sourceWitness:path.relative(ROOT,witness).replace(/\\/g,'/')});
}
const target=path.join(AREA,'captures',`${name}.json`);
for(const label of ['stdout','stderr']){
  const gzip=fs.readFileSync(path.join(directory,original.transcripts[label].path));
  const raw=zlib.gunzipSync(gzip);
  assert.equal(sha(raw),original.transcripts[label].sha256);
  const projected=Buffer.from(project(raw.toString('utf8')));
  const compressed=zlib.gzipSync(projected,{level:9});
  const output=path.join(AREA,'streams',`${name}.${label}.projection.gz`);
  fs.writeFileSync(output,compressed,{flag:'wx'});
  data.transcripts[label]={role:'path-projected UTF-8 stream, not original raw',path:path.relative(path.dirname(target),output).replace(/\\/g,'/'),
    bytes:projected.length,sha256:sha(projected),gzipSha256:sha(compressed),
    origin:{role:'immutable private original',bytes:raw.length,sha256:sha(raw),gzipSha256:sha(gzip),privateReference:`U072/${name}/${label}`}};
}
fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const catalog=a.catalog();
catalog.manifests.push({path:path.relative(ROOT,target).replace(/\\/g,'/'),role:data.role,originManifestSha256:sha(bytes)});
catalog.current[kind]=path.relative(ROOT,target).replace(/\\/g,'/');
fs.writeFileSync(CATALOG,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({name,kind,exit:data.exitCode,publicSourceInputs:data.inputs.length,versionedPublicWitnesses:data.dataInputs.length}));
