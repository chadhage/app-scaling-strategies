'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {verify,defaultReaders,sha,parse}=require('./u068-verify.cjs');
const {decide}=require('./u068-decisions.cjs');
const {scan}=require('./identifier-scan.cjs');
const bytes=new Map(),dependencies=new Map();
const cached=(table,read,file)=>{if(!table.has(file))table.set(file,read(file));return table.get(file);};
const readers={
  read:file=>cached(bytes,defaultReaders.read,file),
  dependency:file=>cached(dependencies,defaultReaders.dependency,file),
  files:defaultReaders.files
};
let baseline;
const current=()=>baseline||=verify(readers);
test('U068/U069 the exact current addition, all original historical bytes, every source/dependency pin and every decoded projection verify',()=>{
  const checked=current();assert.deepEqual(checked.problems,[]);
  assert.ok(checked.records.size>=16);assert.ok(checked.data.size>=8);
  assert.ok(checked.freeze.historical.length>59);
});
test('U068 and U069 close together only when every current functional/TDD/assertion/coverage/counterfactual/native/load/source/fresh gate is green',()=>{
  const checked=current();assert.deepEqual(checked.problems,[]);assert.deepEqual(decide(checked),[]);
});
function tamper(file,transform,reseal=true){
  const changed=transform(readers.read(file)),pins=parse(readers.read('evidence/joint/pins.json'));
  if(reseal){
    const pin=pins.files.find(entry=>entry.path===file);assert.ok(pin);
    pin.sha256=sha(changed);pin.acceptedSha256=[sha(changed)];
  }
  return verify({...readers,read:relative=>relative===file?changed
    :reseal&&relative==='evidence/joint/pins.json'?Buffer.from(JSON.stringify(pins)):readers.read(relative)});
}
for(const [file,kind] of [
  ['README.md','FROZEN_SOURCE_SHA256_DIFFERS'],
  ['store.cjs','CAPTURE_INPUT_SHA256_DIFFERS'],
  ['tests/u068-history.test.cjs','CAPTURE_INPUT_SHA256_DIFFERS']
])test('current tamper is named after superficial resealing: '+file,()=>{
  const checked=tamper(file,value=>Buffer.concat([value,Buffer.from('\n')]));
  assert.ok(checked.problems.some(problem=>problem.kind===kind),JSON.stringify(checked.problems.slice(0,5)));
});
test('a current summary cannot claim more passes than its immutable actual transcript',()=>{
  const checked=tamper('evidence/joint/records/u068-final-core.json',value=>{
    const record=parse(value);record.summary.pass++;return Buffer.from(JSON.stringify(record));
  });
  assert.ok(checked.problems.some(problem=>problem.kind==='CAPTURE_SUMMARY_DIFFERS'));
});
test('a current public stream cannot be changed and superficially resealed',()=>{
  const checked=tamper('evidence/joint/streams/u068-final-core.stdout.projection.txt.gz',value=>{
    const changed=Buffer.from(value);changed[0]^=1;return changed;
  });
  assert.ok(checked.problems.some(problem=>problem.kind==='CAPTURE_UNREADABLE'));
});
for(const file of ['evidence/final/pins.json','evidence/final/source-freeze.json',
  'evidence/red/raw/red-01-behavior.stdout.raw.gz','evidence/u068/history/predecessor-sources/store.cjs']){
  test('old evidence/source is exact historical material, never rewritten by a new seal: '+file,()=>{
    const checked=tamper(file,value=>{const changed=Buffer.from(value);changed[0]^=1;return changed;});
    assert.ok(checked.problems.some(problem=>problem.kind.startsWith('HISTORICAL_')));
  });
}
test('changed private-original input projection is not mistaken for original input bytes',()=>{
  const record=current().records.get('u069-retained-completion-red');
  const input=record.inputs.find(entry=>entry.subject.scope==='private-original-projection');
  assert.ok(input);
  const checked=tamper(input.subject.path,value=>Buffer.concat([value,Buffer.from(' ')]));
  assert.ok(checked.problems.some(problem=>problem.kind==='PRIVATE_INPUT_PROJECTION_DIFFERS'));
});
test('a fabricated current equivalence remains a real completion failure after superficial resealing',()=>{
  const checked=tamper('evidence/u069/current-report.json',value=>{
    const report=parse(value);report.entries.find(entry=>entry.decision==='equivalent').equivalence.fact='default tests passed';
    return Buffer.from(JSON.stringify(report));
  });
  assert.ok(decide(checked).some(problem=>problem.startsWith('SPECIFIC_CURRENT_PAIRED_PROOF_REQUIRED')));
});
test('a failed loaded repetition and an unloaded production file cannot be averaged away',()=>{
  const checked=current();assert.deepEqual(checked.problems,[]);
  const data=new Map(checked.data),loop=structuredClone(data.get('loop'));
  loop.runs[0].summary.fail=1;data.set('loop',loop);
  assert.ok(decide({...checked,data}).some(problem=>problem.startsWith('LOAD_REPETITION_FAILED:')));
  data.set('loop',checked.data.get('loop'));
  const coverage=structuredClone(data.get('coverage'));coverage.files.find(row=>row.file==='store.cjs').loaded=false;data.set('coverage',coverage);
  assert.ok(decide({...checked,data}).includes('COVERAGE_BELOW_85:store.cjs'));
});
test('the exact proposed file set rejects an unlisted addition and every public byte/decoded stream passes privacy scanning',()=>{
  const checked=verify({...readers,files:()=>[...readers.files(),'unlisted-public-file.txt']});
  assert.ok(checked.problems.some(problem=>problem.kind==='EXACT_ADDITION_SET_DIFFERS'));
  const result=scan();assert.equal(result.passed,true,JSON.stringify(result.findings));
  assert.ok(result.files>59);assert.ok(result.decodedStreams>2);
});
