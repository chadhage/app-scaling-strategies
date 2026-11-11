'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{test}=require('node:test');
const api=require('./u074-inventory.cjs'),{enumerate}=require('./u074-domain-oracle.cjs');
const FILES=['codes.cjs','config.cjs','contract.js','json.cjs','page.js','server.cjs','store.cjs'];
const sources=Object.fromEntries(FILES.map(file=>[file,fs.readFileSync(path.join(__dirname,'..',file),'utf8')]));
const expected=FILES.map(file=>enumerate(file,sources[file])),statements=expected.flatMap(x=>x.statements),conditions=expected.flatMap(x=>x.conditions);
const report=()=>api.build(sources),sha=text=>crypto.createHash('sha256').update(text).digest('hex');
test('U074 complete actual seven-file statement domain is parser-derived, including every declaration/throw/break/module return',()=>{
  const r=report();assert.ok(r.parser,'Actual pinned parser authority is required');assert.equal(r.parser.version,'8.16.0');
  assert.deepEqual(r.statements.map(x=>x.key).sort(),statements.map(x=>x.key).sort());
  assert.equal(r.statements.length,893);
});
test('U074 every actual decision and every constituent single condition has an independent complete AST span',()=>{
  assert.deepEqual(report().conditions.map(x=>x.key).sort(),conditions.map(x=>x.key).sort());
  assert.ok(conditions.length>0);
});
test('U074 each statement has its OWN exact deletion variant, never mere overlapping regex coverage',()=>{
  const r=report();
  for(const statement of statements)assert.ok(r.definitions.some(d=>d.inventoryKeys?.includes(statement.key)&&d.operator==='statement-delete'
    &&d.file===statement.file&&d.start===statement.start&&d.end===statement.end),statement.key);
});
test('U074 each condition has both actual forced outcomes and explicit negation source bindings',()=>{
  const r=report();
  for(const condition of conditions)for(const operator of ['condition-true','condition-false','condition-negate'])
    assert.ok(r.definitions.some(d=>d.inventoryKeys?.includes(condition.key)&&d.operator===operator),condition.key+'/'+operator);
});
test('U074 every definition records actual original and changed bytes and actual JavaScript compile eligibility',()=>{
  const r=report();assert.ok(r.parser);
  for(const d of r.definitions){
    const original=sources[d.file],changed=original.slice(0,d.start)+d.replacement+original.slice(d.end);
    assert.equal(d.sourceSha256,sha(original));assert.equal(d.mutantSha256,sha(changed));
    let compiled=true;try{new vm.Script(changed);}catch{compiled=false;}
    assert.equal(d.compiled,compiled);assert.equal(d.identity,d.sourceSha256===d.mutantSha256);
  }
});
test('U074 fixture includes all statement roles without a declaration, throw, break, continue, function or Object/module exclusion',()=>{
  const text=`var v=0; let x=1; const k={}; function f(a){'use strict';if(a&&x)return a;else throw Error('x');}
class C{}; debugger; label:for(let i=0;i<2;i++){if(i)continue label;break;} for(const q of [1]){v+=q;}
for(const p in k){v++;} while(v<1){v++;} do {v--;}while(v>1); switch(x){case 1:v=2;break;default:v=3;}
try{f(x);}catch(e){v=4;}finally{v=5;} module.exports={f,k};`;
  const oracle=enumerate('fixture.cjs',text),actual=api.analyzeFile('fixture.cjs',text);
  assert.deepEqual(actual.statements.map(x=>x.key).sort(),oracle.statements.map(x=>x.key).sort());
  assert.deepEqual(actual.conditions.map(x=>x.key).sort(),oracle.conditions.map(x=>x.key).sort());
});
for(const [name,damage,code]of [
  ['missing own declaration variant',r=>{r.definitions=r.definitions.filter(d=>!(d.file==='server.cjs'&&d.start===15492&&d.end===15518&&d.operator==='statement-delete'));},'STATEMENT_BINDING_MISSING'],
  ['deleted domain row',r=>{r.statements.shift();},'STATEMENT_DOMAIN_DIFFERS'],
  ['duplicate domain row',r=>{r.statements.push(r.statements[0]);},'STATEMENT_DOMAIN_DIFFERS'],
  ['missing condition outcome',r=>{r.definitions=r.definitions.filter(d=>d.operator!=='condition-false');},'CONDITION_BINDING_MISSING'],
  ['source hash tamper',r=>{r.definitions[0].sourceSha256='0'.repeat(64);},'DEFINITION_SOURCE_DIFFERS'],
  ['range tamper',r=>{r.definitions[0].end++;},'DEFINITION_TRANSFORM_DIFFERS']
])test('U074 independent completion refuses '+name+' by name',()=>{
  const r=structuredClone(report());damage(r);assert.ok(api.verify(r,sources).some(issue=>issue.startsWith(code)),code);
});
test('U074 parser syntax failure is an explicit NON-kill input failure, never an omitted domain',()=>{
  assert.throws(()=>api.analyzeFile('invalid.cjs','const ='),error=>error.code==='U074_PARSE_FAILURE');
});
