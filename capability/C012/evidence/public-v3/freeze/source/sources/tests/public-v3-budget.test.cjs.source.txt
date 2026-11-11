'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {policy,WORKER_DEADLINE}=require('./budget.cjs');
test('ordinary public verification after the original worker deadline has a new local failure watchdog, never worker or cloud authority',()=>{
  const later=Date.parse(WORKER_DEADLINE)+86400000;
  const ordinary=policy({now:later,localMs:120000});
  assert.ok(ordinary.end>later);assert.equal(ordinary.privateWorker,false);
  assert.equal(ordinary.workerAuthority,false);assert.equal(ordinary.cloudAuthority,false);assert.equal(ordinary.expenditureAuthority,false);
  const worker=policy({now:later,localMs:120000,privateWorker:true});
  assert.equal(worker.end,Date.parse(WORKER_DEADLINE));assert.ok(worker.end<later);assert.equal(worker.workerDeadlineExtended,false);
});
