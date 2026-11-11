'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const {load,run,probes,currentFile} = require('./semantic-probes.cjs');
const source = fs.readFileSync(currentFile,'utf8');

test('U045 semantic oracle executes every named pristine public and module contract before mutation',async () => {
  const result=await run(load(source));
  assert.equal(result.status,'SURVIVOR',JSON.stringify(result));
  assert.deepEqual(result.passed,probes.map(probe => probe.name));
  assert.ok(probes.length >= 60);
});

test('U045 mutation accounting never calls syntax, module, operation, identity or an unchanged survivor a kill',async () => {
  assert.throws(() => load(`${source}\nconst =`),error => error.name === 'SyntaxError');
  const moduleFault=await run(load(source.replace("require('node:fs')","require('missing-u045-module')")));
  assert.equal(moduleFault.status,'NON_KILL_MODULE_FAULT');
  const unchanged=await run(load(source));
  assert.equal(unchanged.status,'SURVIVOR');
  const commentOnly=await run(load(`${source}\n// an executed semantic survivor is not default equivalence\n`));
  assert.equal(commentOnly.status,'SURVIVOR');
  const operationFault=await run(load(source.replace('legacy.resolveTimeouts(options, options.env || process.env)','undefined')));
  assert.equal(operationFault.status,'NON_KILL_OPERATION_FAULT');
});

test('U045 mutation accounting records real named constant and export assertion kills separately from module faults',async () => {
  for(const changed of [
    source.replace('const APPEND_ATTEMPTS = 3;','const APPEND_ATTEMPTS = 2;'),
    source.replace('module.exports = {APPEND_ATTEMPTS,PARENT_BASELINE_SHA256,HEAD_FILE,USAGE,qualifyEdge,appendFromReport,verifyHead,main};','module.exports = {};'),
  ]) {
    const result=await run(load(changed));
    assert.equal(result.status,'KILLED',JSON.stringify(result));
    assert.match(result.killer,/^U045 causal module contract:/);
    assert.equal(result.error.code,'ERR_ASSERTION');
  }
});

test('U045 mutation oracle refuses an escaped real-default adapter path as NON-kill before any native signature work',async () => {
  const loaded=load(source.replace('if (!bounds.ok) return legacy.qualifyEdge(options);','if (bounds.ok) return legacy.qualifyEdge(options);'));
  const result=await run(loaded);
  assert.equal(result.status,'NON_KILL_OPERATION_FAULT');
  assert.equal(result.error.code,'U045_NONKILL_OPERATION_FAULT');
  assert.match(result.error.message,/complete injected-adapter boundary/);
  assert.equal(loaded.state.defaultAdapterCalls.length,0);
});

test('U045 scoped initializer observation executes the actual declared require before stopping, not a module fault renamed a kill',async () => {
  const original=load(source.replace("require('node:fs')",'__u045Observe("fs-import",require("node:fs"))'));
  const changed=load(source.replace("require('node:fs')",'__u045Observe("fs-import",undefined)'));
  assert.equal(original.fault,null);
  assert.equal(changed.fault,null);
  assert.equal(original.state.observations[0].value.type,'object');
  assert.equal(changed.state.observations[0].value.type,'undefined');
  assert.equal(original.state.observations[0].probe,'module-initialization');
});
