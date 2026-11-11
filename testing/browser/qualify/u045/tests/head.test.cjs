'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const current = require('../current.cjs');
const {fixture,rewrite,sha,forms,parentBytes} = require('./build-head.cjs');
const check = (space,extra={}) => current.verifyHead({root:space.root,expectedHeadSha256:space.sha256,...extra});

test('U045 head: every original predecessor and current addition is checked, with an externally pinned exact head', t => {
  const space = fixture(t);
  const result = check(space);
  assert.equal(result.ok,true,result.error);
  assert.deepEqual([result.predecessors,result.currentFiles,result.files],[272,3,275]);
  assert.equal(result.headSha256,space.sha256);
  assert.equal(sha(parentBytes()),current.PARENT_BASELINE_SHA256);
  assert.equal(current.HEAD_FILE,path.join(__dirname,'..','head.json'));
});

test('U045 head: the external digest is mandatory and cannot be self-asserted or silently guessed', t => {
  const space = fixture(t);
  for (const digest of [undefined,null,123,'A'.repeat(64),'0'.repeat(64),'abc']) {
    assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_HEAD_DIGEST');
  }
  fs.appendFileSync(path.join(space.root,'u045','head.json'),' ');
  assert.equal(check(space).code,'U045_HEAD_DIGEST');
});

test('U045 head: malformed JSON, unreadable sources, and missing head are typed failures, never success-shaped fallbacks', t => {
  const space = fixture(t);
  const headFile = path.join(space.root,'u045','head.json');
  fs.writeFileSync(headFile,'{');
  assert.equal(check(space,{expectedHeadSha256:sha('{')}).code,'U045_HEAD_UNAVAILABLE');
  fs.rmSync(headFile);
  assert.equal(check(space).code,'U045_HEAD_UNAVAILABLE');
  assert.equal(current.verifyHead().ok,false);
});

test('U045 head: both schema and original raw parent-baseline bytes anchor the full original epoch', t => {
  const space = fixture(t);
  for (const change of [
    head => {head.schema='another';},
    head => {head.parentBaselineBase64=Buffer.from('{}').toString('base64');},
  ]) {
    const digest = rewrite(space,change);
    assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_PREDECESSOR_ANCHOR');
    fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  }
});

test('U045 head: duplicated, empty, absolute, traversal, stream, and non-string source paths are rejected', t => {
  const space = fixture(t);
  for (const value of ['',42,'..\\escape.cjs','.\\probe.cjs','C:\\escape.cjs','a/b','a\\\\b']) {
    const digest = rewrite(space,head => {head.files[0].path=value;});
    assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_HEAD_PATH',String(value));
    fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  }
  const digest = rewrite(space,head => {head.files.push(head.files[0]);});
  assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_HEAD_PATH');
});

test('U045 head: explicit original predecessor forms, identity and role cannot be omitted or reclassified', t => {
  const space = fixture(t);
  for (const change of [
    file => {file.forms=[];},
    file => {delete file.forms;},
    file => {file.forms=file.forms.filter(form => form.kind !== 'original');},
    file => {file.forms[0].sha256='0'.repeat(64);},
    file => {file.forms[0].bytes+=1;},
    file => {file.role='current';},
  ]) {
    const digest = rewrite(space,head => change(head.files.find(file => file.path === 'adapters.cjs')));
    const code = check(space,{expectedHeadSha256:digest}).code;
    assert.ok(['U045_SOURCE_FORM','U045_PREDECESSOR_FILE'].includes(code),code);
    fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  }
});

test('U045 head: malformed form declarations cannot label raw as source or forged normalizations as observed source', t => {
  const space = fixture(t);
  for (const change of [
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[1].kind='invented';},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[1].bytes=-1;},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[1].bytes=1.5;},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[1].sha256='invalid';},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[1].sha256='0'.repeat(64);},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[2].sha256='0'.repeat(64);},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[1].bytes+=1;},
    head => {head.files.find(file => file.path === 'adapters.cjs').forms[2].bytes+=1;},
    head => {
      const raw=head.files.find(file => file.path.includes('stdout.raw.gz'));
      raw.forms.push({...raw.forms[0],kind:'source-lf'});
    },
  ]) {
    const digest = rewrite(space,change);
    const result=check(space,{expectedHeadSha256:digest});
    assert.equal(result.ok,false);
    assert.ok(['U045_SOURCE_FORM','U045_SOURCE_BYTES'].includes(result.code),result.code);
    fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  }
});

test('U045 head: malformed closed file set and wrong current role are refused', t => {
  const space = fixture(t);
  let digest = rewrite(space,head => {head.files={};});
  assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_HEAD_SHAPE');
  fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  digest = rewrite(space,head => {head.files.find(file => file.path === 'u045\\probe.cjs').role='legacy';});
  assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_CURRENT_SCOPE');
});

test('U045 head: a missing predecessor, altered current bytes, extra files, and out-of-scope additions each fail by their own gate', t => {
  const space = fixture(t);
  let digest = rewrite(space,head => {head.files=head.files.filter(file => file.path !== 'adapters.cjs');});
  assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_PREDECESSOR_MISSING');
  fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  fs.appendFileSync(path.join(space.root,'u045','probe.cjs'),'\n');
  assert.equal(check(space).code,'U045_SOURCE_BYTES');
  fs.writeFileSync(path.join(space.root,'u045','probe.cjs'),"'use strict';\nmodule.exports = 1;\n");
  fs.writeFileSync(path.join(space.root,'unexpected.txt'),'extra');
  assert.equal(check(space).code,'U045_FOOTPRINT');
  fs.rmSync(path.join(space.root,'unexpected.txt'));
  digest = rewrite(space,head => {head.files.push({path:'external.cjs',role:'current',forms:forms('external.cjs',Buffer.from('x'))});});
  assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_CURRENT_SCOPE');
});

test('U045 head: actual stat and recursive footprint reject symlinks, directories and unusual file kinds', t => {
  const space = fixture(t);
  const target = path.join(space.root,'u045','probe.cjs');
  for (const over of [{isFile:() => false,isSymbolicLink:() => false},{isFile:() => true,isSymbolicLink:() => true}]) {
    const fsApi = {...fs,lstatSync(file) {return file === target ? over : fs.lstatSync(file);}};
    assert.equal(check(space,{fsApi}).code,'U045_SOURCE_TYPE');
  }
  for (const kind of ['symbolic','unusual']) {
    const fsApi = {...fs,readdirSync(file,options) {
      const entries = fs.readdirSync(file,options);
      if (file === space.root) entries.push({name:'alien',isSymbolicLink:() => kind === 'symbolic',isDirectory:() => false,isFile:() => false});
      return entries;
    }};
    assert.equal(check(space,{fsApi}).code,'U045_HEAD_UNAVAILABLE');
  }
});

test('U045 head: source-complete LF and CRLF forms are accepted without normalizing any historical raw', t => {
  const space = fixture(t);
  const raw = space.head.files.find(file => file.path.includes('stdout.raw.gz'));
  assert.ok(raw);
  assert.deepEqual(raw.forms.map(form => form.kind),['original']);
  const source = space.head.files.find(file => file.path === 'u045\\probe.cjs');
  assert.deepEqual(source.forms.map(form => form.kind),['original','source-lf','source-crlf']);
  fs.writeFileSync(path.join(space.root,source.path),"'use strict';\r\nmodule.exports = 1;\r\n");
  assert.equal(check(space).ok,true);
});

test('U045 head: the exact own amendment must be canonical, chained to 157, and bind the complete payload', t => {
  const space = fixture(t);
  const file = path.join(space.root,'u045','amendment.jsonl');
  const original = fs.readFileSync(file,'utf8');
  for (const change of [
    value => `${value} `,
    value => value.replace(/"previous":"[0-9a-f]{64}"/,`"previous":"${'0'.repeat(64)}"`),
    value => value.replace('U045-current-amendment/1','unknown'),
    value => value.replace('"cardId":"U045"','"cardId":"another"'),
    value => value.replace('"atUtc":"2026-11-11T13:00:00.000Z"','"atUtc":null'),
    value => value.replace('"atUtc":"2026-11-11T13:00:00.000Z"','"atUtc":"not UTC"'),
    value => value.replace('"atUtc":','"unexpected":0,"atUtc":'),
    value => value.replace(current.PARENT_BASELINE_SHA256,'0'.repeat(64)),
    value => value.replace(/"payloadSha256":"[0-9a-f]{64}"/,`"payloadSha256":"${'0'.repeat(64)}"`),
  ]) {
    const changed = change(original);
    fs.writeFileSync(file,changed);
    const digest = rewrite(space,head => {head.files.find(entry => entry.path === 'u045\\amendment.jsonl').forms=forms('u045\\amendment.jsonl',Buffer.from(changed));});
    assert.equal(check(space,{expectedHeadSha256:digest}).code,'U045_AMENDMENT_CHAIN');
    fs.writeFileSync(file,original);
    fs.writeFileSync(path.join(space.root,'u045','head.json'),space.bytes);
  }
});

test('U045 head: a second-read predecessor race is refused by the actual unchanged chain verifier', t => {
  const space = fixture(t);
  const target = path.join(space.root,'qualified.addendum.jsonl');
  let reads = 0;
  const fsApi = {...fs,readFileSync(file,...args) {
    if (file === target && ++reads > 1) return Buffer.from('not a valid chain\n');
    return fs.readFileSync(file,...args);
  }};
  assert.equal(check(space,{fsApi}).code,'U045_AMENDMENT_CHAIN');
  assert.equal(reads,2);
});
