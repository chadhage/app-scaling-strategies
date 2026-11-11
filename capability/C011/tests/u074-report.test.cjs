'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{gunzipSync}=require('node:zlib'),{test}=require('node:test');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,...file.split('/')));
const report=JSON.parse(read('evidence/u074/current/final-report.json')),freeze=JSON.parse(read('evidence/u074/current/source-freeze.json'));
const text=report.captureNames.map(name=>{const record=JSON.parse(read('evidence/u074/current/records/'+name+'.json'));return gunzipSync(read(record.transcripts.stdout.path)).toString();}).join('\n');
const {audit}=require('./u074-audit.cjs');
test('U074 independent complete parser domain and every valid actual execution close with natural reached assertions or own paired proof',()=>{
  assert.deepEqual(audit(report,text,freeze,read),[]);
});
for(const[name,edit,code]of [
 ['omitted statement',r=>{r.statements.shift();},'STATEMENT_DOMAIN_DIFFERS'],
 ['missing current position',r=>{r.entries.pop();},'CURRENT_POSITION_CENSUS_INCOMPLETE'],
 ['fabricated source read',r=>{const e=r.entries.find(e=>e.decision==='killed');e.readFiles.find(row=>row.path===e.file).sha256='0'.repeat(64);},'ACTUAL_CHANGED_SOURCE_READ_MISSING'],
 ['unreached named assertion',r=>{r.entries.find(e=>e.decision==='killed').causallyReached=false;},'NATURAL_REACHED_ASSERTION_REQUIRED'],
 ['fault disguised as kill',r=>{r.entries.find(e=>e.decision==='killed').fault={kind:'module'};},'CURRENT_CLASSIFIER_DIFFERS'],
 ['default equivalent',r=>{r.entries.find(e=>e.decision==='equivalent').pairedProof.domain='tests passed';},'OWN_CURRENT_PAIRED_DOMAIN_REQUIRED']
])test('U074 source-exact closure tamper refuses '+name,()=>{
  const copy=structuredClone(report);edit(copy);assert.ok(audit(copy,text,freeze,read).some(issue=>issue.startsWith(code)));
});
