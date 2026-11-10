'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('./u006-u061-authority.cjs');
const root = path.resolve(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, api.BASE_PATH), 'utf8'));
const headPath = 'evidence\\u061\\authority-head-3.json';
const stepPath = 'evidence\\u061\\authority-addendum-3.json';
function fixture() {
  const files = new Map();
  const paths = [api.BASE_PATH, headPath, stepPath, api.HELPER_PATH, api.FIRST_HELPER_PATH,
    'evidence\\u061\\authority-addendum-1.json','evidence\\u061\\authority-head-1.json',
    'evidence\\u061\\authority-addendum-2.json','evidence\\u061\\authority-head-2.json',
    'evidence\\u061\\originals\\355a3028d8c80269134805a5a49d7dd216ebb3e4af64fae35c2229506a540292.helper.snapshot',
    ...base.originals.flatMap((i) => [i.path,i.retained]),
    ...base.captures.flatMap((c) => [c.path,...c.inputs.map((i) => i.retained)])];
  for (const p of paths) files.set(p,fs.readFileSync(path.join(root,p)));
  return { files, read:(p) => { if (!files.has(p)) throw new Error('missing '+p); return files.get(p); } };
}
const edit = (f,p,change) => {
  const value=JSON.parse(f.files.get(p).toString('utf8'));change(value);
  f.files.set(p,Buffer.from(JSON.stringify(value,null,2)+'\n'));
};
const authority = (f) => api.createAuthority(base,f.read);
const pair = (b) => ({rawSha256:api.hash(b),crlfToLfSha256:api.hash(api.canonical(b))});
test('U061-A001: the exact original inventory and current append-only head verify', () => {
  const f=fixture(),result=authority(f).verifyCurrent();
  assert.deepEqual(result.currentVerifiers,[...api.AMENDABLE]);
  assert.equal(result.sequence,3);
  assert.equal(api.loadAuthority(f.read).verifyCurrent().cardId,'U061');
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result.currentVerifiers),true);
});
test('U061-A002: exact LF current verifier and helper representations verify without normalizing other variants', () => {
  const f=fixture();
  for (const p of [...api.AMENDABLE,api.HELPER_PATH])f.files.set(p,api.canonical(f.files.get(p)));
  assert.equal(authority(f).verifyCurrent().sequence,3);
  for(const p of api.AMENDABLE){
    const g=fixture(),raw=api.canonical(g.files.get(p)).toString('latin1').replace(/\n/g,'\r\n');
    g.files.set(p,Buffer.from(raw.replace('\r\n','\n'),'latin1'));
    assert.throws(()=>authority(g).verifyCurrent(),{code:'U061_CURRENT_VERIFIER_CHANGED'});
  }
});
test('U061-A003: a valid later addendum chains exact predecessors and leaves earlier records intact', () => {
  const f=fixture(),first=f.files.get(stepPath),firstHead=f.files.get(headPath);
  const one=JSON.parse(first);
  const two={...one,sequence:4,previous:{path:stepPath,rawSha256:api.hash(first)},amendments:one.amendments.map((step)=>{
    const changed=Buffer.concat([f.files.get(step.path),Buffer.from('\n// approved test-only second representation\n')]);
    f.files.set(step.path,changed);
    return {path:step.path,previous:step.current,current:pair(changed)};
  })};
  const second='evidence\\u061\\authority-addendum-4.json',secondHead='evidence\\u061\\authority-head-4.json';
  f.files.set(second,Buffer.from(JSON.stringify(two,null,2)+'\n'));
  f.files.set(secondHead,Buffer.from(JSON.stringify({...JSON.parse(firstHead),sequence:4,addendumPath:second,addendumSha256:api.hash(f.files.get(second))},null,2)+'\n'));
  assert.equal(authority(f).verifyCurrent(secondHead).sequence,4);
  assert.deepEqual(f.files.get(stepPath),first);
  assert.deepEqual(f.files.get(headPath),firstHead);
  edit(f,second,(v)=>{v.previous.rawSha256='0'.repeat(64);});
  assert.throws(()=>authority(f).verifyCurrent(secondHead),{code:'U061_CHAIN_CHANGED'});
});
for(const [name,change,code] of [
  ['unknown shape',v=>{v.extra=true;},'U061_ADDENDUM_SHAPE'],
  ['wrong item',v=>{v.cardId='U007';},'U061_ADDENDUM_SHAPE'],
  ['wrong sequence',v=>{v.sequence=4;},'U061_ADDENDUM_SHAPE'],
  ['wrong base',v=>{v.base.rawSha256='0'.repeat(64);},'U061_ADDENDUM_SHAPE'],
  ['wrong predecessor',v=>{v.previous={path:stepPath,rawSha256:'0'.repeat(64)};},'U061_CHAIN_CHANGED'],
  ['unknown helper',v=>{v.helper.path='tree.cjs';},'U061_HELPER_ENTRY'],
  ['missing amendment',v=>{v.amendments.pop();},'U061_AMENDMENTS_COUNT'],
  ['unapproved file',v=>{v.amendments[0].path='tree.cjs';},'U061_AMENDMENT_PATH'],
  ['duplicate file',v=>{v.amendments[1].path=v.amendments[0].path;},'U061_AMENDMENT_PATH'],
  ['changed predecessor',v=>{v.amendments[0].previous.rawSha256='0'.repeat(64);},'U061_PREDECESSOR_CHANGED'],
  ['no-op',v=>{v.amendments[0].current=v.amendments[0].previous;},'U061_AMENDMENT_NOOP'],
]) {
  test('U061-A004: '+name+' is refused by name',()=>{
    const f=fixture();edit(f,stepPath,change);
    assert.throws(()=>authority(f).verifyCurrent(),{code});
  });
}
for(const [name,change,code] of [
  ['extra field',v=>{v.extra=true;},'U061_HEAD_SHAPE'],
  ['wrong item',v=>{v.cardId='other';},'U061_HEAD_SHAPE'],
  ['wrong sequence',v=>{v.sequence=4;},'U061_HEAD_SHAPE'],
  ['unbounded sequence',v=>{v.sequence=33;},'U061_HEAD_SHAPE'],
  ['wrong base',v=>{v.baseSha256='0'.repeat(64);},'U061_HEAD_SHAPE'],
  ['changed head digest',v=>{v.addendumSha256='0'.repeat(64);},'U061_HEAD_CHANGED'],
  ['changed head path',v=>{v.addendumPath='evidence\\u061\\authority-addendum-4.json';},'U061_HEAD_CHANGED'],
]) {
  test('U061-A005: head '+name+' is refused by name',()=>{
    const f=fixture();edit(f,headPath,change);
    assert.throws(()=>authority(f).verifyCurrent(),{code});
  });
}
test('U061-A006: base and original-manifest/retained-source bytes cannot be rewritten',()=>{
  for(const p of [api.BASE_PATH,base.captures[0].path,base.captures[0].inputs[0].retained,base.originals[0].retained]){
    const f=fixture(),b=Buffer.from(f.files.get(p));b[Math.floor(b.length/2)]^=1;f.files.set(p,b);
    const code=p===api.BASE_PATH?'U061_BASE_CHANGED':p===base.captures[0].path?'U061_MANIFEST_CHANGED':p===base.originals[0].retained?'U061_ORIGINAL_CHANGED':'U061_RETAINED_RAW_CHANGED';
    assert.throws(()=>authority(f),{code});
  }
});
test('U061-A007: changed helper/current verifiers and missing authority records fail explicitly',()=>{
  for(const p of [api.HELPER_PATH,...api.AMENDABLE]){
    const f=fixture(),b=Buffer.from(f.files.get(p));b[Math.floor(b.length/2)]^=1;f.files.set(p,b);
    assert.throws(()=>authority(f).verifyCurrent(),{code:p===api.HELPER_PATH?'U061_HELPER_CHANGED':'U061_CURRENT_VERIFIER_CHANGED'});
  }
  for(const p of [headPath,stepPath,api.HELPER_PATH]){
    const f=fixture();f.files.delete(p);
    assert.throws(()=>authority(f).verifyCurrent(),{code:'U061_SOURCE_MISSING'});
  }
  const f=fixture();f.files.set(headPath,Buffer.from('{'));
  assert.throws(()=>authority(f).verifyCurrent(),{code:'U061_AUTHORITY_JSON'});
  assert.throws(()=>authority(f).verifyCurrent('outside\\head.json'),{code:'U061_HEAD_PATH'});
});
test('U061-A008: every byte of the head is bound by closed shape or exact addendum identity',()=>{
  const original=fixture().files.get(headPath);
  for(let i=0;i<original.length;i++){
    const f=fixture(),b=Buffer.from(original);b[i]^=1;f.files.set(headPath,b);
    assert.throws(()=>authority(f).verifyCurrent(),undefined,'head byte '+i);
  }
});
test('U061-A009: the U006-owned current helper checks every unchanged behavioral raw/LF vector',()=>{
  const f=fixture(),current=authority(f);
  for(const capture of base.captures)for(const input of capture.inputs){
    const raw=f.files.get(input.retained),lf=api.canonical(raw);
    assert.equal(current.verifyStable(capture.path,input.path,raw).ok,true);
    assert.equal(current.verifyStable(capture.path,input.path,lf).ok,true);
    const changed=Buffer.from(lf);changed[Math.floor(changed.length/2)]^=1;
    assert.equal(current.verifyStable(capture.path,input.path,changed).ok,false);
    assert.equal(current.verifyStable(capture.path,'unrecorded.cjs',raw).ok,false);
  }
});
