'use strict';
const zlib=require('node:zlib');
const {sha,scrub,inspect}=require('./public-v3-transport.cjs');
function projectRecord(original){
  let bytes=original,wasGzip=false;
  while(bytes[0]===31&&bytes[1]===139){bytes=zlib.gunzipSync(bytes);wasGzip=true;}
  const body=Buffer.from(scrub(bytes.toString('utf8')));
  const value={schema:'C012-explicit-current-execution-public-projection/3',originalPrivateSha256:sha(original),originalPrivateBytes:original.length,
    decodedOriginalSha256:sha(bytes),originalGzip:wasGzip,role:'actual current execution record projected for public transport; NOT original raw',
    projectedBodyEncoding:'base64',projectedBodySha256:sha(body),projectedBody:body.toString('base64'),notOriginalRaw:true};
  const encoded=zlib.gzipSync(Buffer.from(JSON.stringify(value)));
  if(inspect(encoded).findings.length)throw Error('projection still contains private identifier');
  return encoded;
}
function readRecord(encoded){
  const value=JSON.parse(zlib.gunzipSync(encoded));if(!value.notOriginalRaw||value.schema!=='C012-explicit-current-execution-public-projection/3')throw Error('explicit current projection required');
  const body=Buffer.from(value.projectedBody,'base64');if(sha(body)!==value.projectedBodySha256)throw Error('projection payload changed');
  return {meta:value,body};
}
module.exports={projectRecord,readRecord};
