'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const PROFILE=/[a-z]:[\\/]+users[\\/]+[^\\/\s"'<>[\]{}]+/gi;
const SECRET=/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{24,}|AccountKey=[A-Za-z0-9+/=]{24,})/g;
function scrub(text){return text.replace(PROFILE,'<PRIVATE_PROFILE>').replace(SECRET,'<PRIVATE_SECRET_REDACTED>');}
function inspect(bytes,depth=0){
  if(depth>10)throw Error('bounded projection/gzip nesting');
  let gzipBodies=0;
  if(bytes[0]===31&&bytes[1]===139){const next=inspect(zlib.gunzipSync(bytes),depth+1);return{...next,gzipBodies:next.gzipBodies+1};}
  const text=bytes.toString('utf8'),findings=[];
  if(PROFILE.test(text))findings.push('absolute-user-profile');PROFILE.lastIndex=0;
  if(SECRET.test(text))findings.push('secret-pattern');SECRET.lastIndex=0;
  let value;try{value=JSON.parse(text);}catch{}
  if(value?.projectedBodyEncoding==='base64'){
    const body=Buffer.from(value.projectedBody,'base64');
    assert.equal(sha(body),value.projectedBodySha256,'actual projection payload hash');
    const next=inspect(body,depth+1);findings.push(...next.findings);gzipBodies+=next.gzipBodies;
  }
  return {findings,gzipBodies};
}
function scan(directory){
  const findings=[],files=[];let gzipBodies=0;
  function walk(folder,prefix=''){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name),relative=path.join(prefix,entry.name);
    if(fs.lstatSync(file).isSymbolicLink())throw Error('public transport refuses aliases');
    if(entry.isDirectory())walk(file,relative);
    else{const bytes=fs.readFileSync(file),checked=inspect(bytes);gzipBodies+=checked.gzipBodies;files.push({path:relative,sha256:sha(bytes),bytes:bytes.length});if(checked.findings.length)findings.push({path:relative,kinds:[...new Set(checked.findings)],sha256:sha(bytes)});}
  }}
  walk(directory);return{files,gzipBodies,findings,pass:findings.length===0};
}
function envelope(bytes,role){
  let body=bytes;
  if(bytes[0]===31&&bytes[1]===139){
    const decoded=zlib.gunzipSync(bytes);
    body=Buffer.from(JSON.stringify({schema:'C012-public-current-inner-projection/3',originalPrivateSha256:sha(bytes),
      originalDecodedSha256:sha(decoded),role,projectedBodyEncoding:'base64',projectedBodySha256:sha(Buffer.from(scrub(decoded.toString('utf8')))),
      projectedBody:Buffer.from(scrub(decoded.toString('utf8'))).toString('base64')}));
  }else body=Buffer.from(scrub(bytes.toString('utf8')));
  const value={schema:'C012-public-current-execution-projection/3',originalPrivateSha256:sha(bytes),originalPrivateBytes:bytes.length,
    role,notOriginalRaw:true,projectedBodyEncoding:'base64',projectedBodySha256:sha(body),projectedBody:body.toString('base64')};
  return zlib.gzipSync(Buffer.from(JSON.stringify(value)));
}
function unwrap(bytes){
  if(bytes[0]===31&&bytes[1]===139)bytes=zlib.gunzipSync(bytes);
  const value=JSON.parse(bytes.toString('utf8'));
  assert.ok(value.notOriginalRaw&&value.projectedBodyEncoding==='base64');
  const body=Buffer.from(value.projectedBody,'base64');assert.equal(sha(body),value.projectedBodySha256);
  return {meta:value,body};
}
module.exports={sha,scrub,inspect,scan,envelope,unwrap};
if(require.main===module){
  const root=process.env.C012_TRANSPORT_TARGET;assert.ok(root&&path.isAbsolute(root));
  const report=scan(root),output=process.env.C012_TRANSPORT_OUTPUT;
  if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({files:report.files.length,gzipBodies:report.gzipBodies,identifierArtifacts:report.findings.length,pass:report.pass}));
  if(!report.pass)process.exitCode=1;
}
