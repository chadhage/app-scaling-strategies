'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const MODULE='internal/deps/acorn/acorn/dist/acorn',VERSION='8.16.0',HASH='e10ec115cb48101e961e2bb8352fa3dd3cb6422375ebdaab7b64f5e9548d380d';
const source=process.binding('natives')[MODULE],sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(process.version,'v22.23.4','Unknown parser runtime is NONPASS, never an install/fallback');
assert.equal(typeof source,'string');assert.equal(sha(source),HASH,'Actual immutable bundled parser source');
const box={module:{exports:{}}};box.exports=box.module.exports;
vm.runInNewContext(source,box,{filename:MODULE});assert.equal(box.module.exports.version,VERSION);
const identity=Object.freeze({module:MODULE,version:VERSION,sourceSha256:HASH,executedUnmodifiedSourceSha256:sha(source),
  sourceBytes:Buffer.byteLength(source),nodeRuntime:process.version,installation:false,sharedToolingWritten:false});
function parse(file,text){
  try{return box.module.exports.parse(text,{ecmaVersion:'latest',sourceType:'script',locations:true});}
  catch(cause){throw Object.assign(new Error('U074_PARSE_FAILURE: '+file,{cause}),{code:'U074_PARSE_FAILURE',file});}
}
module.exports={parse,identity,sha};
