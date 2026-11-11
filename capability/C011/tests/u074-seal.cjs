'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),target='evidence/u074/current/pins.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function list(directory=root,prefix=''){
  return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    if(entry.isSymbolicLink())throw new Error('REPARSE_POINT');
    return entry.isDirectory()?list(path.join(directory,entry.name),prefix+entry.name+'/'):[prefix+entry.name];
  });
}
function pin(file){
  const bytes=fs.readFileSync(path.join(root,...file.split('/'))),acceptedSha256=[sha(bytes)];
  if(!file.startsWith('evidence/')&&/\.(?:cjs|js|json|md|html|css|feature)$/.test(file)){
    const lf=Buffer.from(bytes.toString().replace(/\r\n/g,'\n'));
    acceptedSha256.push(sha(lf),sha(Buffer.from(lf.toString().replace(/\n/g,'\r\n'))));
  }
  return{path:file,bytes:bytes.length,sha256:sha(bytes),acceptedSha256:[...new Set(acceptedSha256)]};
}
module.exports={root,target,sha,list,pin};
if(require.main===module){
  if(fs.existsSync(path.join(root,...target.split('/'))))throw new Error('Final current physical seal is immutable');
  const rows=list().map(pin);fs.mkdirSync(path.join(root,'evidence','u074','current'),{recursive:true});
  fs.writeFileSync(path.join(root,...target.split('/')),JSON.stringify({schema:'U074-current-seal/1',files:rows,
    policy:'Every actual current physical namespace byte; only current non-evidence source has exact raw/LF/CRLF representations. No source/hash/exact-set exclusion.'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({sealed:rows.length,target}));
}
