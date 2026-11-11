'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const root=path.resolve(__dirname,'..','..');
const lineage=JSON.parse(fs.readFileSync(path.join(root,'u045','evidence','source-epoch2.json'),'utf8'));
const previousBytes=fs.readFileSync(path.join(root,lineage.previousSourceHeadFile));
const previous=JSON.parse(previousBytes);
test('U045 epoch2 is append-only, preserves the exact prior head, original admission and fixed deadline',()=>{
  assert.equal(lineage.sourceEpoch,2);
  assert.equal(sha(previousBytes),lineage.previousSourceHeadSha256);
  assert.equal(lineage.originalAdmittedAtUtc,'2026-11-11T13:25:18.1656612Z');
  assert.equal(lineage.deadlineUtc,'2026-11-11T17:25:15.7754949Z');
  assert.equal(lineage.deadlineExtended,false);
});
test('U045 epoch2 retains exactly the same production program with explicit LF/CRLF forms, never a normalized raw identity claim',()=>{
  const record=previous.files.find(file=>file.path==='u045\\current.cjs');
  assert.equal(record.forms.find(form=>form.kind==='original').sha256,lineage.productionSourceSha256);
  const actual=fs.readFileSync(path.join(root,'u045','current.cjs'));
  assert.ok(record.forms.some(form=>form.bytes===actual.length&&form.sha256===sha(actual)));
  assert.equal(previous.schema,'U045-current-source-head/1');
});
