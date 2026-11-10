'use strict';
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('./u006-u061-authority.cjs');
const root=path.resolve(__dirname,'..');
test('U061-R005: caller mutation cannot replace a recorded raw/canonical provenance pair',()=>{
  const base=JSON.parse(fs.readFileSync(path.join(root,api.BASE_PATH),'utf8'));
  const authority=api.createAuthority(base,p=>fs.readFileSync(path.join(root,p)));
  const capture=base.captures[0],input=capture.inputs[0],forged=Buffer.from('not an original retained input');
  input.rawSha256=api.hash(forged);input.crlfToLfSha256=api.hash(forged);
  assert.equal(authority.verifyStable(capture.path,input.path,forged).ok,false,
    'validated original provenance must be snapshotted, not shared with mutable caller input');
});
