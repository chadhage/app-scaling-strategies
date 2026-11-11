'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {inventory,enumerate} = require('./inventory.cjs');
const {sha} = require('./parser.cjs');
const {load,run,currentFile} = require('./semantic-probes.cjs');
const source = fs.readFileSync(currentFile,'utf8');
const sites = new Map(enumerate('current.cjs',source).map(site => [site.key,site]));
const runner = definition => [
  'node','testing\\browser\\qualify\\u045\\tests\\scoped-pairs.cjs',definition.key,definition.sourceSha256,
];
function instrument(definition,side) {
  const node=sites.get(definition.key).node,changed=side === 'mutant';
  const text=changed ? source.slice(0,definition.start)+definition.replacement+source.slice(definition.end) : source;
  let start=definition.start,end=changed ? start+definition.replacement.length : definition.end;
  let value=text.slice(start,end);
  if(definition.kind === 'statement') {
    if(node.type === 'VariableDeclaration') {
      const init=node.declarations.find(entry => entry.init)?.init;
      if(!init) return null;
      start=init.start;end=changed ? start+'undefined'.length : init.end;value=text.slice(start,end);
    } else if(['IfStatement','ForStatement'].includes(node.type)) {
      if(!node.test) return null;
      start=node.test.start;end=changed ? start+'false'.length : node.test.end;value=text.slice(start,end);
    } else if(['ForOfStatement','ForInStatement'].includes(node.type)) {
      start=node.right.start;end=changed ? start+2 : node.right.end;value=text.slice(start,end);
    } else if(node.type === 'ReturnStatement') {
      const original=node.argument ? source.slice(node.argument.start,node.argument.end) : 'undefined';
      const altered=node.argument ? 'undefined' : 'null';
      return text.slice(0,start)+`return __u045Observe(${JSON.stringify(definition.key)},(${changed ? altered : original}));`+text.slice(end);
    } else return null;
  } else if(definition.kind === 'module' && node.type === 'ExpressionStatement') return null;
  return text.slice(0,start)+`__u045Observe(${JSON.stringify(definition.key)},(${value}))`+text.slice(end);
}
async function observe(text,only) {
  let loaded;
  try {loaded=load(text);} catch(error) {return {status:'NON_KILL_SCOPE_SYNTAX',error:error.message};}
  if(loaded.fault) return {status:'NON_KILL_SCOPE_MODULE_FAULT',error:loaded.fault.message};
  if(loaded.state.observations.length) return {status:'SCOPED_OBSERVED',observation:loaded.state.observations[0]};
  return run(loaded,{only});
}
function forOfBindingPair(definition) {
  const site=sites.get(definition.key),node=site.node;
  if(definition.kind !== 'statement' || node.type !== 'VariableDeclaration' || site.parentType !== 'ForOfStatement'
      || node.declarations.length !== 1 || node.declarations[0].init || node.declarations[0].id.type !== 'Identifier') return null;
  const name=node.declarations[0].id.name;
  const wrap=declaration => `(()=>{const seen=[];for(${declaration} of [{tag:"first"},{tag:"second"}]){seen.push(()=>${name}.tag);}return seen.map(read=>read());})()`;
  const pristine=wrap(definition.original),mutant=wrap(definition.replacement);
  const before=JSON.parse(JSON.stringify(new vm.Script(pristine).runInNewContext({}, {timeout:1000})));
  const after=JSON.parse(JSON.stringify(new vm.Script(mutant).runInNewContext({}, {timeout:1000})));
  assert.deepEqual(before,['first','second'],'the actual const for-of declaration binds each synthetic iteration');
  assert.deepEqual(after,['second','second'],'the actual var replacement shares the loop binding in this explicit scope');
  return {
    status:'RUNNABLE_SCOPED_PAIR',scope:'Exact actual for-of declaration in an explicit two-item closure-observation scaffold; not a claim that the public caller uses closures or that the whole mutant is killed/equivalent',
    probe:`U045 scoped per-iteration binding ${name}`,sourceSha256:definition.sourceSha256,
    pristineScope:pristine,mutantScope:mutant,pristineSourceSha256:sha(pristine),mutantSourceSha256:sha(mutant),
    originalObservation:before,mutantObservation:after,observedRelation:'different-in-this-executed-scope',runner:runner(definition),
  };
}
async function scopedPair(definition) {
  if(definition.sourceSha256 !== sha(source) || sha(fs.readFileSync(currentFile)) !== sha(source)) {
    return {status:'NON_KILL_SCOPE_SOURCE_IDENTITY',reason:'The actual current source no longer matches the recorded exact epoch'};
  }
  const loop=forOfBindingPair(definition);
  if(loop) return loop;
  const pristine=instrument(definition,'original'),mutant=instrument(definition,'mutant');
  if(!pristine || !mutant) return {status:'NO_RUNNABLE_SCOPED_PAIR',reason:'No unsupported statement scope is silently inferred'};
  const before=await observe(pristine);
  if(before.status !== 'SCOPED_OBSERVED') return {status:'NON_KILL_SCOPE_UNEXECUTED',pristine:before};
  const after=await observe(mutant,before.observation.probe === 'module-initialization' ? undefined : before.observation.probe);
  if(after.status !== 'SCOPED_OBSERVED' || after.observation.probe !== before.observation.probe) {
    return {status:'NON_KILL_SCOPE_UNEXECUTED',pristine:before,mutant:after};
  }
  return {
    status:'RUNNABLE_SCOPED_PAIR',scope:'Only the recorded exact declared initializer/expression/return/control under the recorded probe; no global equivalence or whole-mutant kill claim',
    probe:before.observation.probe,sourceSha256:definition.sourceSha256,
    pristineSourceSha256:sha(pristine),mutantSourceSha256:sha(mutant),
    originalObservation:before.observation.value,mutantObservation:after.observation.value,
    observedRelation:JSON.stringify(before.observation.value) === JSON.stringify(after.observation.value) ? 'equal-in-this-executed-scope' : 'different-in-this-executed-scope',
    runner:runner(definition),
  };
}
module.exports = {scopedPair,instrument,forOfBindingPair};
if(require.main === module) {
  const [key,expected] = process.argv.slice(2);
  const definition=inventory().sites.find(site => site.key === key || site.id === key);
  if(!definition || expected !== sha(source)) throw new Error('Supply one actual current AST site key and its exact recorded source SHA-256');
  scopedPair(definition).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if(result.status !== 'RUNNABLE_SCOPED_PAIR') process.exitCode=1;
  },error => {process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
}
