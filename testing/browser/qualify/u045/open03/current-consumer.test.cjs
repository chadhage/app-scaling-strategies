'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'..','..'),current=require('../current.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('CURRENT03 AUTHORITY: external current anchor validates all272 and the complete actual addition footprint',()=>{
  assert.match(process.env.U045_EXPECTED_CURRENT_HEAD||'',/^[0-9a-f]{64}$/,'External anchor is mandatory; never self-derived');
  const result=current.verifyHead({expectedHeadSha256:process.env.U045_EXPECTED_CURRENT_HEAD});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.predecessors,272);
  const head=JSON.parse(fs.readFileSync(path.join(root,'u045','head.json')));
  assert.equal(result.files,head.files.length+1);
});
test('CURRENT03 AUTHORITY: frozen exact-version consumer bytes retain explicit historical source forms',()=>{
  const head=JSON.parse(fs.readFileSync(path.join(root,'u045','head.json')));
  const record=head.files.find(file=>file.path==='tests\\evidence.test.cjs');
  assert.equal(record.role,'predecessor');
  const bytes=fs.readFileSync(path.join(root,record.path));
  assert.ok(record.forms.some(form=>form.bytes===bytes.length&&form.sha256===sha(bytes)));
  assert.ok(head.files.some(file=>file.path==='u045\\open03\\U045.feature'));
  assert.ok(head.files.some(file=>file.path==='u045\\open03\\reuse.json'));
});
