'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const current = require('../current.cjs');
const {fixtureAdapters} = require('./support.cjs');
const cases = [
  ['now',true,[]],
  ['readQualified',false,['QUALIFIED_MAJORS_INVALID']],
  ['candidates',false,['EDGE_NOT_FOUND']],
  ['statFile',false,['EDGE_NOT_FOUND']],
  ['sha256',false,['SHA256_TIMEOUT']],
  ['signature',false,['SIGNATURE_TIMEOUT']],
  ['fileVersion',false,['VERSION_TIMEOUT']],
  ['sha256#2',false,['SHA256_TIMEOUT']],
  ['statFile#2',false,['EDGE_CHANGED_DURING_CHECK']],
];
for (const [target,ok,reasonCodes] of cases) {
  test(`U045 VIRTUAL OUTER BOUND: ${target} settles by virtual scheduler counters`, async t => {
    t.mock.timers.enable({apis:['setTimeout']});
    const [name,nth='1'] = target.split('#');
    const ordinary = fixtureAdapters();
    let adapterCalls = 0;
    let settled = false;
    let answer;
    const adapters = {...ordinary,[name]:(...args) => {
      adapterCalls += 1;
      return adapterCalls >= Number(nth) ? new Promise(() => {}) : ordinary[name](...args);
    }};
    const operation = current.qualifyEdge({timeoutMs:300,adapterFactory:() => adapters});
    operation.then(value => { settled = true; answer = value; });
    if (name === 'now') t.mock.timers.tick(300);
    let ticks = 0;
    for (; ticks < 20 && !settled; ticks += 1) {
      for (let turn = 0; turn < 32; turn += 1) await Promise.resolve();
      t.mock.timers.tick(300);
    }
    for (let turn = 0; turn < 32; turn += 1) await Promise.resolve();
    assert.equal(settled,true,`${target}: the real outer bound must settle under finite virtual ticks`);
    assert.ok(adapterCalls >= Number(nth));
    assert.ok(ticks <= 20);
    assert.equal(answer.ok,ok);
    assert.deepEqual(answer.reasonCodes,reasonCodes);
    if (name === 'now') assert.equal(answer.checkedAtUtc,null,'the clock is the explicit non-security exception');
    await operation;
  });
}
