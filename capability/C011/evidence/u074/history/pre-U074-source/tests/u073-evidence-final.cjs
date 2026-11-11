'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {verify,defaultReaders,sha,parse}=require('./u073-verify.cjs');
const {decide}=require('./u073-decisions.cjs'),{scan}=require('./identifier-scan.cjs');
const bytes=new Map(),dependencies=new Map(),cached=(table,read,file)=>{if(!table.has(file))table.set(file,read(file));return table.get(file);};
const readers={read:file=>cached(bytes,defaultReaders.read,file),dependency:file=>cached(dependencies,defaultReaders.dependency,file),files:defaultReaders.files};
let baseline;
const current=()=>baseline||=verify(readers);
test('U073 current filesystem has an exact addition set; all5745 published historical roles and111 RED preimages remain exact',()=>{
  const checked=current();assert.deepEqual(checked.problems,[]);
  assert.equal(checked.freeze.inherited.length,5745);assert.equal(checked.freeze.redSources.length,111);
  assert.equal(checked.freeze.production.length,7);assert.equal(checked.freeze.productionEdits,0);assert.equal(checked.freeze.importEdits,0);
  assert.ok(checked.records.size>=16);
  for(const name of ['coverage','browser','resource64','load80','fresh-lf','fresh-crlf','source-git','consumer','provenance'])assert.ok(checked.data.has(name));
});
test('U073 closes only with current causal RED/GREEN, all functional/assertion/coverage/mutation/native/resource/load/fresh/source gates',()=>{
  const checked=current();assert.deepEqual(checked.problems,[]);assert.deepEqual(decide(checked),[]);
});
function tamper(file,transform,reseal=true){
  const changed=transform(readers.read(file)),pins=parse(readers.read('evidence/u073/current/pins.json'));
  if(reseal){const pin=pins.files.find(entry=>entry.path===file);assert.ok(pin);pin.sha256=sha(changed);pin.acceptedSha256=[sha(changed)];}
  return verify({...readers,read:relative=>relative===file?changed
    :reseal&&relative==='evidence/u073/current/pins.json'?Buffer.from(JSON.stringify(pins)):readers.read(relative)});
}
for(const file of ['README.md','store.cjs','tests/u073-flood-oracle.cjs']){
  test('U073 superficial current resealing cannot hide a frozen source edit: '+file,()=>{
    const checked=tamper(file,value=>Buffer.concat([value,Buffer.from('\n')]));
    assert.ok(checked.problems.some(problem=>problem.kind==='FROZEN_SOURCE_SHA256_DIFFERS'));
  });
}
test('U073 a capture summary cannot outvote its immutable actual transcript',()=>{
  const checked=tamper('evidence/u073/current/records/U073-final-core.json',value=>{
    const record=parse(value);record.summary.pass++;return Buffer.from(JSON.stringify(record));
  });
  assert.ok(checked.problems.some(problem=>problem.kind==='CAPTURE_SUMMARY_DIFFERS'));
});
test('U073 corrupted public stream after superficial resealing is not evidence',()=>{
  const checked=tamper('evidence/u073/current/streams/U073-final-core.stdout.projection.txt.gz',value=>{
    const changed=Buffer.from(value);changed[0]^=1;return changed;
  });
  assert.ok(checked.problems.some(problem=>problem.kind==='CAPTURE_UNREADABLE'));
});
for(const file of ['evidence/current/pins.json','evidence/final/pins.json','evidence/red/raw/red-01-behavior.stdout.raw.gz',
  'evidence/u073/history/pre-U073-source/tests/flood.test.cjs','evidence/u073/history/red-01-source/tests/u073-flood-oracle.cjs']){
  test('U073 new seal never grants a historical-byte rewrite: '+file,()=>{
    const checked=tamper(file,value=>{const changed=Buffer.from(value);changed[0]^=1;return changed;});
    assert.ok(checked.problems.some(problem=>problem.kind.startsWith('HISTORICAL_')||problem.kind.startsWith('PUBLISHED_HISTORICAL_')));
  });
}
test('U073 default equivalence cannot replace specific runnable current paired proof',()=>{
  const checked=tamper('evidence/u073/current/mutation-report.json',value=>{
    const report=parse(value);report.entries.find(entry=>entry.decision==='equivalent').equivalence.fact='default tests passed';
    return Buffer.from(JSON.stringify(report));
  });
  assert.ok(decide(checked).some(problem=>problem.startsWith('SPECIFIC_CURRENT_PAIRED_PROOF_REQUIRED')));
});
test('U073 required module-initialization/export positions cannot become exclusions',()=>{
  const checked=tamper('evidence/u073/current/mutation-report.json',value=>{
    const report=parse(value);report.entries.find(entry=>entry.initializationContract).decision='invalid-module';
    return Buffer.from(JSON.stringify(report));
  });
  assert.ok(decide(checked).some(problem=>problem.startsWith('VALID_INITIALIZATION_POSITION_UNCLOSED')));
});
test('U073 every actual failed resource or loaded repetition blocks completion, never averaged or cherry-picked',()=>{
  const checked=current(),data=new Map(checked.data),resource=structuredClone(data.get('resource64'));
  resource.groups[0].leaves[0].summary.fail=1;data.set('resource64',resource);
  assert.ok(decide({...checked,data}).some(problem=>problem.startsWith('RESOURCE_LEAF_NONPASS:')));
  data.set('resource64',checked.data.get('resource64'));
  const load=structuredClone(data.get('load80'));load.runs[0].summary.fail=1;data.set('load80',load);
  assert.ok(decide({...checked,data}).some(problem=>problem.startsWith('LOAD_RUN_NONPASS:')));
});
test('U073 an unloaded production file and an unclosed owned native profile are independently nonpasses',()=>{
  const checked=current(),data=new Map(checked.data),coverage=structuredClone(data.get('coverage'));
  coverage.files.find(row=>row.file==='store.cjs').loaded=false;data.set('coverage',coverage);
  assert.ok(decide({...checked,data}).includes('COVERAGE_BELOW_85:store.cjs'));
  data.set('coverage',checked.data.get('coverage'));
  const browser=structuredClone(data.get('browser'));browser.observations[0].cleanup.clean=false;data.set('browser',browser);
  assert.ok(decide({...checked,data}).includes('BROWSER_OWN_CLEANUP_UNPROVEN'));
});
test('U073 the original genuine client-count failure remains historical and no old core chronology is certified',()=>{
  const checked=current(),transition=parse(readers.read('evidence/u073/history/wrong-client-predicate-transition.json'));
  assert.equal(transition.oldFailureRemainsGenuine,true);assert.equal(transition.editedAssertionClaimedUnchangedGreen,false);
  assert.equal(checked.freeze.originalChronologyCertified,false);
  assert.equal(checked.data.get('provenance').originalChronologyCertified,false);
});
test('U073 exact current filesystem refuses an unlisted addition and every proposed byte/decoded stream passes identifier scanning',()=>{
  const checked=verify({...readers,files:()=>[...readers.files(),'unlisted-public-file.txt']});
  assert.ok(checked.problems.some(problem=>problem.kind==='EXACT_ADDITION_SET_DIFFERS'));
  const result=scan();assert.equal(result.passed,true,JSON.stringify(result.findings));
  assert.equal(result.files,readers.files().length);
  assert.equal(result.decodedStreams,readers.files().filter(file=>file.endsWith('.gz')).length);
});
