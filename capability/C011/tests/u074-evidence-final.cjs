'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const verifier=require('./u074-verify.cjs'),{decide}=require('./u074-decisions.cjs'),{scan}=require('./identifier-scan.cjs');
const {sha}=require('./u074-seal.cjs'),bytes=new Map();
const read=file=>{if(!bytes.has(file))bytes.set(file,verifier.defaultReaders.read(file));return bytes.get(file);};
let baseline;const current=()=>baseline||=verifier.verify({read});
test('U074 actual current physical namespace and every11372 historical source/raw role are byte-complete, not an old-source exception',()=>{
  const value=current();assert.deepEqual(value.problems,[]);assert.equal(value.freeze.inherited.length,7005);assert.equal(value.freeze.productionEdits,0);assert.equal(value.freeze.importEdits,0);
});
test('U074 closes only when parser completeness, every actual valid variant, all current/full-source/coverage/native/fresh/consumer gates close together',()=>{
  assert.deepEqual(current().problems,[]);assert.deepEqual(decide(current()),[]);
});
function changed(file,transform){
  const value=transform(read(file)),pins=JSON.parse(read('evidence/u074/current/pins.json'));
  const pin=pins.files.find(row=>row.path===file);assert.ok(pin);pin.sha256=sha(value);pin.acceptedSha256=[sha(value)];
  return verifier.verify({read:path=>path===file?value:path==='evidence/u074/current/pins.json'?Buffer.from(JSON.stringify(pins)):read(path)});
}
for(const file of ['README.md','tests/u074-inventory.cjs','tests/u074-loader.cjs','server.cjs'])
  test('U074 superficial resealing cannot hide current source change: '+file,()=>{
    const value=changed(file,raw=>Buffer.concat([raw,Buffer.from('\n')]));
    assert.ok(value.problems.some(row=>row.kind==='FROZEN_SOURCE_SHA256_DIFFERS'));
  });
for(const file of ['evidence/u073/current/pins.json','evidence/u074/history/pre-U074-source/tests/u073-verify.cjs',
  'evidence/u074/history/red-01-source/tests/u074-inventory.cjs'])
  test('U074 no new seal licenses historical raw/source rewriting: '+file,()=>{
    const value=changed(file,raw=>{const out=Buffer.from(raw);out[0]^=1;return out;});
    assert.ok(value.problems.some(row=>row.kind.startsWith('HISTORICAL_')||row.kind.startsWith('PUBLISHED_HISTORICAL_')));
  });
for(const[name,edit,code]of [
  ['missing statement declaration position',r=>{r.definitions=r.definitions.filter(d=>!(d.file==='server.cjs'&&d.start===15492&&d.end===15518&&d.operator==='statement-delete'));},'COMPLETE_PARSER_DEFINITIONS_DIFFER'],
  ['default equivalent',r=>{const entry=r.entries.find(e=>e.decision==='equivalent');entry.pairedProof=null;},'CURRENT_CLASSIFIER_DIFFERS'],
  ['remaining survivor',r=>{r.entries.find(e=>e.decision==='killed').decision='survived';},'CURRENT_CLASSIFIER_DIFFERS'],
  ['unexecuted variant',r=>{r.entries.pop();},'CURRENT_POSITION_CENSUS_INCOMPLETE'],
  ['source read mismatch',r=>{const entry=r.entries.find(e=>e.decision==='killed');entry.readFiles.find(row=>row.path===entry.file).sha256='0'.repeat(64);},'ACTUAL_CHANGED_SOURCE_READ_MISSING']
])test('U074 current completion refuses '+name+' by a named assertion',()=>{
  const value=changed('evidence/u074/current/final-report.json',raw=>{const report=JSON.parse(raw);edit(report);return Buffer.from(JSON.stringify(report));});
  assert.ok(decide(value).some(issue=>issue.startsWith(code)));
});
test('U074 current exact set refuses an added unlisted file and every proposed byte/decoded stream is privacy-clean',()=>{
  const value=verifier.verify({read,files:()=>[...verifier.defaultReaders.files(),'unlisted-current-file.txt']});
  assert.ok(value.problems.some(row=>row.kind==='EXACT_ADDITION_SET_DIFFERS'));
  const result=scan();assert.equal(result.passed,true,JSON.stringify(result.findings));assert.equal(result.files,verifier.defaultReaders.files().length);
});
