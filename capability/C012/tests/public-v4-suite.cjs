'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert.equal(fs.readFileSync(path.resolve(__dirname,'..','.gitattributes'),'utf8').trim(),'* -text','persistent exact own-namespace Git byte policy');
require('./public-v3-suite.cjs');
