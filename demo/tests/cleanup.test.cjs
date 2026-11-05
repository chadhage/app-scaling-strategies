'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertOwned, cleanupGroup } = require('../cleanup.cjs');

const context = {
  subscription: '11111111-1111-1111-1111-111111111111', repository: 'owner/repo',
  runId: '123', runAttempt: '1', experiment: 'blue-green'
};
const group = {
  name: 'ass-demo-123-1-blue-green',
  id: `/subscriptions/${context.subscription}/resourceGroups/ass-demo-123-1-blue-green`,
  tags: { purpose: 'app-scaling-strategies-demo', repository: context.repository, runId: '123', runAttempt: '1', experiment: 'blue-green', expiresAt: '2026-11-06T00:00:00Z' }
};
const deployment = {
  name: 'ass-123-1-blue-green', state: 'Running', group: group.name, repository: context.repository,
  runId: context.runId, attempt: context.runAttempt, experiment: context.experiment
};

test('teardown requires exact name, subscription, repository, run, attempt, experiment, and expiry tags', () => {
  assert.doesNotThrow(() => assertOwned(group, context));
  for (const changed of [
    { ...group, name: 'production' }, { ...group, id: '/subscriptions/other/resourceGroups/ass-demo-123-1-blue-green' },
    ...['purpose', 'repository', 'runId', 'runAttempt', 'experiment', 'expiresAt'].map(key => ({ ...group, tags: { ...group.tags, [key]: 'other' } }))
  ]) assert.throws(() => assertOwned(changed, context), /Refusing deletion/);
});

test('already absent groups are verified without a delete request', async () => {
  const commands = [];
  const result = await cleanupGroup(context, { az: async args => { commands.push(args); return args[2] === 'list' ? [] : false; }, log() {} });
  assert.equal(result.verifiedDeleted, true);
  assert.equal(result.outcome, 'confirmed-absent');
  assert.ok(!commands.some(args => args[1] === 'delete'));
});

test('teardown cancels only this run deployment, deletes only its group, and verifies absence', async () => {
  const commands = [];
  let deleted = false;
  const result = await cleanupGroup(context, {
    az: async args => {
      commands.push(args);
      if (args[0] === 'group' && args[1] === 'exists') return !deleted;
      if (args[0] === 'group' && args[1] === 'show') return group;
      if (args[0] === 'deployment' && args[2] === 'list') return [deployment];
      if (args[0] === 'deployment' && args[2] === 'show') return 'Canceled';
      if (args[0] === 'group' && args[1] === 'delete') deleted = true;
      return null;
    },
    log() {}
  });
  assert.equal(result.verifiedDeleted, true);
  assert.equal(result.outcome, 'deleted-and-verified');
  assert.ok(commands.some(args => args[2] === 'cancel' && args.includes('ass-123-1-blue-green')));
  const deletion = commands.find(args => args[0] === 'group' && args[1] === 'delete');
  assert.ok(deletion.includes(group.name));
  assert.ok(deletion.includes('--no-wait'));
  assert.equal(commands.filter(args => args[1] === 'exists').length, 3);
});

test('ownership mismatch prevents even a deployment cancellation or group deletion', async () => {
  const commands = [];
  await assert.rejects(cleanupGroup(context, {
    az: async args => {
      commands.push(args);
      return args[1] === 'exists' ? true : { ...group, tags: { ...group.tags, repository: 'someone/else' } };
    }, log() {}
  }), /Refusing deletion/);
  assert.equal(commands.length, 2);
});

test('cleanup failures remain failures and cancellation warnings never suppress deletion', async () => {
  const records = [];
  await assert.rejects(cleanupGroup(context, {
    az: async args => {
      if (args[0] === 'group' && args[1] === 'exists') return true;
      if (args[0] === 'group' && args[1] === 'show') return group;
      if (args[2] === 'list') return [deployment];
      throw Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    }, log: value => records.push(JSON.parse(value))
  }), /Permission denied/);
  assert.ok(records.some(record => record.event === 'cleanup-cancel-failed'));
  assert.equal(records.at(-1).verifiedDeleted, false);
});

test('cancellation before resource-group creation stops the deployment and removes a late-created group', async () => {
  let exists = false;
  let deleted = false;
  const result = await cleanupGroup(context, {
    az: async args => {
      if (args[0] === 'group' && args[1] === 'exists') return exists;
      if (args[0] === 'group' && args[1] === 'show') return group;
      if (args[2] === 'list') return [deployment];
      if (args[2] === 'cancel') exists = true;
      if (args[2] === 'show') return 'Canceled';
      if (args[0] === 'group' && args[1] === 'delete') { exists = false; deleted = true; }
      return null;
    }, log() {}
  });
  assert.equal(deleted, true);
  assert.equal(result.verifiedDeleted, true);
});

test('absent groups do not authorize cancellation of unrelated deployment metadata', async () => {
  const commands = [];
  await assert.rejects(cleanupGroup(context, {
    az: async args => {
      commands.push(args);
      return args[2] === 'list' ? [{ ...deployment, repository: 'someone/else' }] : false;
    }, log() {}
  }), /mismatched ownership/);
  assert.ok(!commands.some(args => args[2] === 'cancel' || args[1] === 'delete'));
});
