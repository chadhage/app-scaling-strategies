'use strict';
const fs=require('node:fs'),path=require('node:path');
const {list,physical}=require('./source.cjs');
const {sha}=require('./public-v3-transport.cjs');
const {remaining}=require('./budget.cjs');
remaining(60000);
const ns=path.resolve(__dirname,'..'),root=path.resolve(ns,'..','..'),name=process.env.C012_PUBLIC_FREEZE_NAME||'source';
if(!/^source(?:-[0-9]+)?$/.test(name))throw Error('closed freeze epoch');
const out=path.join(ns,'evidence','public-v3','freeze',name);
fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out,{recursive:false});
const sources=list(ns).map(row=>({...row,artifact:path.join('sources',row.path+'.source.txt'),role:'exact current source snapshot, not an auto-discovery test'}));
for(const row of sources){const file=path.join(out,row.artifact);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(ns,row.path),file,fs.constants.COPYFILE_EXCL);}
for(const row of require('../imports.json').entries){const file=path.join(out,'imports',row.path+'.source.txt');fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(root,row.path),file,fs.constants.COPYFILE_EXCL);}
const report={schema:'C012-public-v3-actual-current-source-freeze/3',createdAtUtc:new Date().toISOString(),sources,
  sourceSetSha256:sha(JSON.stringify(sources)),runtime:physical(process.env.C012_RUNTIME),productionProgramsByteExact:true,
  originalDeadlineUtc:'2026-11-11T23:06:54.4385459Z',noPublicationAuthority:true};
fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sources:sources.length,sourceSetSha256:report.sourceSetSha256,freeze:path.relative(ns,path.join(out,'freeze.json'))}));
