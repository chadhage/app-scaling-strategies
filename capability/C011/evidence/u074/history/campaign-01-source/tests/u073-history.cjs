'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),candidate=path.resolve(root,'..','..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'evidence','u073','history','published-baseline.json')));
const sources=new Set(baseline.sourceFiles.map(file=>file.path));
const read=file=>fs.readFileSync(path.join(root,...(sources.has(file)?'evidence/u073/history/pre-U073-source/'+file:file).split('/')));
function verifyPublished(){
  const {verify}=require('./u068-verify.cjs'),{decide}=require('./u068-decisions.cjs');
  const checked=verify({read,dependency:file=>fs.readFileSync(path.join(candidate,...file.split('/'))),files:()=>baseline.files.map(file=>file.path)});
  return{role:'Retained cbd publication only, NOT current U073 qualification',integrity:checked.problems,
    decisions:checked.problems.length?[]:decide(checked),files:baseline.files.length,originalChronologyCertified:false};
}
module.exports={verifyPublished,read,baseline};
