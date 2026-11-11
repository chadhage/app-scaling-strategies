'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const api=require('./u074-inventory.cjs'),{enumerate}=require('./u074-domain-oracle.cjs'),root=path.resolve(__dirname,'..');
for(const mode of ['lf','crlf'])test('U074 complete actual parser/legacy operator spans are retargeted to explicit '+mode+' source bytes, not a stale producer snapshot',()=>{
  const sources=Object.fromEntries(api.PRODUCTION.map(file=>{
    const lf=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');return[file,mode==='lf'?lf:lf.replace(/\n/g,'\r\n')];
  }));
  const report=api.build(sources);assert.deepEqual(api.verify(report,sources),[]);
  assert.equal(report.statements.length,893);assert.equal(report.conditions.length,541);
  const start=sources['server.cjs'].indexOf('const sockets = new Set();');
  assert.ok(report.definitions.some(row=>row.file==='server.cjs'&&row.start===start&&row.end===start+26&&row.operator==='statement-delete'));
});
test('U074 AST ignores apparent guard text in comments/strings/templates while preserving Unicode byte versus UTF16 offsets',()=>{
  const source='// if(false) throw x;\nconst text="if(true) break;"; const label=`while(false)`;\nconst café=1; if(café>0){throw Error("x");}';
  const actual=api.analyzeFile('unicode.cjs',source),independent=enumerate('unicode.cjs',source);
  assert.deepEqual(actual.statements.map(row=>row.key).sort(),independent.statements.map(row=>row.key).sort());
  const branch=actual.statements.find(row=>row.type==='IfStatement');assert.equal(branch.startByte,Buffer.byteLength(source.slice(0,branch.start)));
  assert.ok(branch.startByte>branch.start);assert.equal(actual.statements.filter(row=>row.type==='IfStatement').length,1);
});
