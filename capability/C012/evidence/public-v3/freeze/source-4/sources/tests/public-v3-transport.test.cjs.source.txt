'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {scan,inspect,envelope,unwrap}=require('./public-v3-transport.cjs');
test('actual proposed public namespace has no local profile identifier or secret in any file or expanded gzip/projection body',()=>{
  const root=process.env.C012_TRANSPORT_TARGET||require('node:path').resolve(__dirname,'..');
  const actual=scan(root);
  assert.equal(actual.findings.length,0,'PUBLIC_TRANSPORT_REFUSAL: '+actual.findings.map(row=>row.path).join(', '));
});
test('transport controls inspect nested compressed bodies and labelled projection payloads without treating missing preimages as success',()=>{
  const privateText=['Z:','Users','synthetic-private-principal','project'].join('\\');
  const raw=Buffer.from(privateText),gzip=zlib.gzipSync(zlib.gzipSync(raw));
  assert.ok(inspect(raw).findings.length>0);assert.ok(inspect(gzip).findings.length>0);
  const publicBytes=envelope(raw,'synthetic privacy control, not an actual original execution');
  assert.deepEqual(inspect(publicBytes).findings,[]);
  assert.equal(unwrap(publicBytes).meta.notOriginalRaw,true);
});
