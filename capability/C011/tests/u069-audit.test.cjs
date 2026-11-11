'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {test}=require('node:test');
const {root}=require('./u069-loader.cjs');
const {audit}=require('./u069-audit.cjs');
const read=file=>fs.readFileSync(path.join(root,...file.split('/')));
const report=JSON.parse(read('evidence/u073/current/mutation-report.json'));
const freeze=JSON.parse(read('evidence/u073/current/source-freeze.json'));
const capture=JSON.parse(read('evidence/u073/current/records/U073-final-mutations.json'));
const text=gunzipSync(read(capture.transcripts.stdout.path)).toString('utf8')
  +gunzipSync(read(capture.transcripts.stderr.path)).toString('utf8');
test('U069 every final regenerated position has exact read/executed bytes and a real named assertion, explicit paired proof, or non-kill invalid witness',()=>{
  assert.deepEqual(audit(report,text,freeze),[]);
});
for(const [name,change,kind] of [
  ['fabricated named kill',r=>{r.entries.find(e=>e.decision==='killed').namedFailures=['a nonexistent assertion'];},'NATURAL_NAMED_ASSERTION_REQUIRED'],
  ['default equivalence',r=>{r.entries.find(e=>e.decision==='equivalent').equivalence.fact='default tests passed';},'SPECIFIC_CURRENT_PAIRED_PROOF_REQUIRED'],
  ['module fault credited as a kill',r=>{const e=r.entries.find(e=>e.id===245);e.moduleFault={phase:'missing-dependency'};},'NATURAL_NAMED_ASSERTION_REQUIRED'],
  ['changed executed bytes',r=>{const e=r.entries.find(e=>e.file==='store.cjs');e.executedFiles.find(f=>f.path==='store.cjs').sha256='0'.repeat(64);},'ACTUAL_COUNTERFACTUAL_EXECUTION_DIFFERS'],
  ['changed current position',r=>{r.definitions[0].mutantSha256='0'.repeat(64);},'RETARGETED_DEFINITIONS_DIFFER'],
  ['remaining survivor',r=>{r.survived=1;},'CURRENT_SURVIVED'],
  ['unexecuted position',r=>{r.notExecuted=1;},'CURRENT_NOTEXECUTED']
])test('U069 current completion tamper refuses '+name,()=>{
  const changed=structuredClone(report);change(changed);
  assert.ok(audit(changed,text,freeze).some(problem=>problem.startsWith(kind)));
});
