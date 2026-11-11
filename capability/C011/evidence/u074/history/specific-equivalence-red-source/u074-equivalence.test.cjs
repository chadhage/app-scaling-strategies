'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {createLoader,root}=require('./u074-loader.cjs'),{build,PRODUCTION}=require('./u074-inventory.cjs'),api=require('./u074-equivalence.cjs');
const sources=Object.fromEntries(PRODUCTION.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const report=build(sources);
for(const[file,fragment,replacement]of [
 ['codes.cjs',"'use strict';",';'],
 ['config.cjs','{ return fail(null); }','{}'],['config.cjs','return fail(null);',';'],
 ['contract.js','return null;',';'],
 ['page.js','{ body = null; }','{}'],['page.js','body = null;',';'],
 ['json.cjs','if (thrown !== stop) throw thrown;',';'],['json.cjs','throw thrown;',';'],
 ['server.cjs','checked.field === undefined','false'],['server.cjs','result.opIndex === undefined','false'],
 ['server.cjs','server.closeAllConnections();',';']
])test('U074 current specific equivalence has actual source-exact paired proof for '+file+' '+fragment,async()=>{
  const definition=report.definitions.find(d=>d.file===file&&sources[file].slice(d.start,d.end)===fragment&&d.replacement===replacement);
  assert.ok(definition&&definition.compiled);
  const fact=api.identify(definition,sources[file]);assert.ok(fact,'No default equivalence, but this precise structural fact requires its own current proof');
  const proof=await api.prove(fact,definition,createLoader(definition));
  assert.ok(proof.domain.length>30);assert.ok(proof.cases>0);assert.equal(proof.assertedPairs,proof.cases);
  assert.equal(proof.pristineSourceSha256,definition.sourceSha256);assert.equal(proof.counterfactualSha256,definition.mutantSha256);
});
