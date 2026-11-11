'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const name = 'internal/deps/acorn/acorn/dist/acorn';
const source = process.binding('natives')[name];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(process.version,'v22.23.4');
assert.equal(sha(source),'e10ec115cb48101e961e2bb8352fa3dd3cb6422375ebdaab7b64f5e9548d380d');
const box = {module:{exports:{}}};
box.exports = box.module.exports;
vm.runInNewContext(source,box,{filename:name});
assert.equal(box.module.exports.version,'8.16.0');
const identity = {
  module:name,version:box.module.exports.version,sourceSha256:sha(source),
  sourceBytes:Buffer.byteLength(source),nodeRuntime:process.version,installed:false,
  priorArt:'capability\\C011\\tests\\u074-parser.cjs; independently executed U045 use, not inherited proof',
};
const parse = text => box.module.exports.parse(text,{ecmaVersion:'latest',sourceType:'script',locations:true});
module.exports = {parse,identity,sha};
