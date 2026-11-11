'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),candidate=path.resolve(root,'..','..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'evidence','u074','history','published-baseline.json')));
const sources=new Set(baseline.sourceFiles.map(row=>row.path));
const read=file=>fs.readFileSync(path.join(root,...(sources.has(file)?'evidence/u074/history/pre-U074-source/'+file:file).split('/')));
function verifyPublished(){
  const checked=require('./u073-verify.cjs').verify({read,dependency:file=>fs.readFileSync(path.join(candidate,...file.split('/'))),
    files:()=>baseline.files.map(row=>row.path)});
  return{role:'Exact11372 published7005 historical source/evidence only, not current parser-completeness certification',
    files:baseline.files.length,integrity:checked.problems,decisions:checked.problems.length?[]:require('./u073-decisions.cjs').decide(checked)};
}
module.exports={read,verifyPublished,baseline};
