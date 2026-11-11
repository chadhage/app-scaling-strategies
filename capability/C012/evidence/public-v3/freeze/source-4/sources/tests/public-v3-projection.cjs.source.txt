'use strict';
const zlib=require('node:zlib');
const {sha,scrub}=require('./public-v3-transport.cjs');
function project(bytes,relative,depth=0){
  if(depth>8)throw Error('opaque nesting limit');
  if(bytes[0]===31&&bytes[1]===139){
    const body=zlib.gunzipSync(bytes),next=project(body,relative.replace(/\.gz$/i,''),depth+1);
    if(!next.changed)return {bytes,changed:false,kind:'byte-exact'};
    return {bytes:zlib.gzipSync(Buffer.from(JSON.stringify({schema:'C012-public-history-projection/3',
      originalPrivateSha256:sha(bytes),originalDecodedSha256:sha(body),role:'historical private gzip data; transformed projection, not original raw',
      projectionKind:next.kind,projectedBodySha256:sha(next.bytes),projectedBodyEncoding:'base64',projectedBody:next.bytes.toString('base64')}))),
      changed:true,kind:'explicit-gzip-projection-envelope'};
  }
  if(/\.patch$/i.test(relative))return{bytes:Buffer.from(JSON.stringify({schema:'C012-public-history-projection/3',originalPrivateSha256:sha(bytes),originalBytes:bytes.length,
    role:'historical private composite patch; private originals remain outside public transport',
    projectionKind:'lossy-composite-patch-metadata',payloadPublished:false,notOriginalRaw:true,
    reason:'Composite encoded payload can contain private paths. Individual current and historical source derivatives have separate complete mappings.'},null,2)+'\n'),
    changed:true,kind:'lossy-composite-patch-metadata'};
  const text=bytes.toString('utf8'),clean=scrub(text);
  return clean===text?{bytes,changed:false,kind:'byte-exact'}:{bytes:Buffer.from(clean),changed:true,kind:'profile-root-placeholder-text-projection'};
}
module.exports={project};
