'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { platform } = require('../lib/azure.cjs');

const context = { resourceGroup: 'ass-demo-123-1-scale', planName: 'the-created-plan', workloadName: 'the-created-workload', subscription: 'the-confirmed-subscription', location: 'centralus' };

test('real capacity operations use Bicep what-if before create and remain bound to this run', async () => {
  const commands = [];
  const adapter = platform(context, { event() {} }, async args => { commands.push(args); });
  for (const capacity of [2, 1]) await adapter.scale(capacity);
  assert.equal(commands.length, 4);
  assert.deepEqual(commands.map(args => args[2]), ['what-if', 'create', 'what-if', 'create']);
  for (const args of commands) {
    assert.ok(args.includes(context.resourceGroup));
    assert.ok(args.includes(context.subscription));
    assert.ok(args.includes('planName=the-created-plan'));
    assert.ok(args.some(value => value.endsWith('scale.bicep')));
  }
  await assert.rejects(adapter.scale(3), /capacity/);
  assert.equal(commands.length, 4);
});

test('native swaps target production once, surface errors, and never retry an ambiguous swap', async () => {
  let calls = 0;
  const adapter = platform(context, { event() {} }, async args => {
    calls++;
    assert.ok(args.includes('--target-slot'));
    assert.ok(args.includes('production'));
    assert.ok(args.includes('green'));
    throw new Error('Ambiguous platform failure');
  });
  await assert.rejects(adapter.swap(), /Ambiguous/);
  assert.equal(calls, 1);
});

test('effective instance names come from platform output, not the desired capacity', async () => {
  const adapter = platform(context, { event() {} }, async args => {
    assert.deepEqual(args.slice(0, 2), ['webapp', 'list-instances']);
    return [{ name: 'actual-worker-a' }, { name: 'actual-worker-b' }];
  });
  assert.deepEqual(await adapter.instances(), ['actual-worker-a', 'actual-worker-b']);
});
