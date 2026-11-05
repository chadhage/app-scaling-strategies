'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { az: azure } = require('./lib/azure.cjs');
const { fail, resourceGroup } = require('./lib/contract.cjs');
const { poll } = require('./lib/client.cjs');

function assertOwned(group, context) {
  const expected = resourceGroup(context.runId, context.runAttempt, context.experiment);
  const tags = group.tags || {};
  const id = `/subscriptions/${context.subscription}/resourceGroups/${expected}`;
  if (group.name !== expected || typeof group.id !== 'string' || group.id.toLowerCase() !== id.toLowerCase() ||
    tags.purpose !== 'app-scaling-strategies-demo' || tags.repository !== context.repository ||
    tags.runId !== context.runId || tags.runAttempt !== context.runAttempt || tags.experiment !== context.experiment ||
    !Number.isFinite(Date.parse(tags.expiresAt))) {
    throw fail('cleanup-ownership-mismatch', 'Refusing deletion: resource-group identity or ownership tags do not match this exact demonstration.');
  }
}

async function cleanupGroup(context, { az = azure, log = console.log, timeoutMs = 900000 } = {}) {
  const groupName = resourceGroup(context.runId, context.runAttempt, context.experiment);
  const scope = ['--subscription', context.subscription];
  const record = { resourceGroup: groupName, subscription: context.subscription, startedAt: new Date().toISOString(), verifiedDeleted: false, warnings: [] };
  const note = (event, details) => log(JSON.stringify({ event, ...details }));
  try {
    const existed = await az(['group', 'exists', '--name', groupName, ...scope]);
    if (existed) assertOwned(await az(['group', 'show', '--name', groupName, ...scope]), context);
    const deploymentName = `ass-${context.runId}-${context.runAttempt}-${context.experiment}`;
    const deployments = await az(['deployment', 'sub', 'list', ...scope, '--query',
      `[?name=='${deploymentName}'].{name:name,state:properties.provisioningState,group:properties.parameters.resourceGroupName.value,repository:properties.parameters.repository.value,runId:properties.parameters.runId.value,attempt:properties.parameters.runAttempt.value,experiment:properties.parameters.experiment.value}`]);
    const terminal = ['Succeeded', 'Failed', 'Canceled'];
    const unsettled = [];
    for (const deployment of deployments) {
      if (deployment.name !== deploymentName || deployment.group !== groupName || deployment.repository !== context.repository ||
        deployment.runId !== context.runId || deployment.attempt !== context.runAttempt || deployment.experiment !== context.experiment) {
        throw fail('cleanup-deployment-mismatch', 'Refusing cancellation or deletion of deployment metadata with mismatched ownership parameters.');
      }
      if (terminal.includes(deployment.state)) continue;
      try {
        await az(['deployment', 'sub', 'cancel', '--name', deployment.name, ...scope]);
        await poll(async () => terminal.includes(await az(['deployment', 'sub', 'show', '--name', deployment.name, ...scope, '--query', 'properties.provisioningState'])),
          'subscription deployment stopped creating resources', {
            timeoutMs: Math.min(timeoutMs, 120000), intervalMs: 2000,
            onFailure: error => note('deployment-cancellation-not-verified', { code: error.code, message: error.message })
          });
        note('deployment-cancelled-before-cleanup', { name: deployment.name });
      } catch (error) {
        unsettled.push(deployment.name);
        record.warnings.push({ operation: 'cancel-deployment', code: error.code || error.name, message: error.message });
        note('cleanup-cancel-failed', record.warnings.at(-1));
      }
    }
    const exists = await az(['group', 'exists', '--name', groupName, ...scope]);
    if (exists) {
      assertOwned(await az(['group', 'show', '--name', groupName, ...scope]), context);
      note('deleting-owned-demo-group', { resourceGroup: groupName });
      await az(['group', 'delete', '--name', groupName, '--yes', '--no-wait', ...scope]);
      await poll(async () => !await az(['group', 'exists', '--name', groupName, ...scope]),
        `resource group ${groupName} is deleted`, {
          timeoutMs, intervalMs: 5000,
          onFailure: error => note('cleanup-not-yet-verified', { code: error.code, message: error.message })
        });
    }
    for (const name of unsettled) {
      if (!terminal.includes(await az(['deployment', 'sub', 'show', '--name', name, ...scope, '--query', 'properties.provisioningState']))) {
        throw fail('cleanup-active-deployment', 'Resource-group absence is not sufficient while its deployment can still create resources.');
      }
    }
    record.verifiedDeleted = true;
    record.outcome = exists || existed ? 'deleted-and-verified' : 'confirmed-absent';
    for (const deployment of deployments) {
      try { await az(['deployment', 'sub', 'delete', '--name', deployment.name, ...scope]); }
      catch (error) {
        record.warnings.push({ operation: 'delete-deployment-metadata', code: error.code || error.name, message: error.message });
        note('deployment-metadata-cleanup-failed', record.warnings.at(-1));
      }
    }
    return record;
  } catch (error) {
    record.error = { code: error.code || error.name, message: error.message };
    error.cleanupRecord = record;
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    note('cleanup-result', record);
  }
}

async function main(command, env, az = azure) {
  if (!/^[0-9a-f-]{36}$/i.test(env.AZURE_SUBSCRIPTION_ID || '') || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '')) {
    throw fail('missing-cleanup-context', 'Explicit subscription and repository are required for teardown.');
  }
  if (await az(['account', 'show', '--query', 'id']) !== env.AZURE_SUBSCRIPTION_ID) throw fail('subscription-mismatch', 'Cleanup identity selected another subscription.');
  const directory = path.resolve(__dirname, '..', 'demo-output', 'evidence');
  fs.mkdirSync(directory, { recursive: true });
  const records = [];
  try {
    if (command === 'cleanup') {
      records.push(await cleanupGroup({
        subscription: env.AZURE_SUBSCRIPTION_ID, repository: env.GITHUB_REPOSITORY,
        runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, experiment: env.EXPERIMENT
      }, { az }));
    } else {
      const groups = await az(['group', 'list', '--subscription', env.AZURE_SUBSCRIPTION_ID, '--tag', 'purpose=app-scaling-strategies-demo']);
      const expired = groups.filter(group => group.tags?.repository === env.GITHUB_REPOSITORY &&
        Number.isFinite(Date.parse(group.tags.expiresAt)) && Date.parse(group.tags.expiresAt) <= Date.now());
      if (expired.length > 10) throw fail('cleanup-batch-too-large', 'More than ten expired demo groups require operator review.');
      for (const group of expired) {
        const context = {
          subscription: env.AZURE_SUBSCRIPTION_ID, repository: env.GITHUB_REPOSITORY,
          runId: group.tags.runId, runAttempt: group.tags.runAttempt, experiment: group.tags.experiment
        };
        assertOwned(group, context);
        records.push(await cleanupGroup(context, { az }));
      }
    }
    const invalidExpiry = command === 'sweep' && (await az(['group', 'list', '--subscription', env.AZURE_SUBSCRIPTION_ID, '--tag', 'purpose=app-scaling-strategies-demo']))
      .some(group => group.tags?.repository === env.GITHUB_REPOSITORY && !Number.isFinite(Date.parse(group.tags.expiresAt)));
    if (invalidExpiry) throw fail('invalid-expiry', 'An owned demonstration group has an invalid expiry. It was not deleted; operator review is required.');
  } catch (error) {
    records.push(error.cleanupRecord || { verifiedDeleted: false, error: { code: error.code || error.name, message: error.message } });
    throw error;
  } finally {
    fs.writeFileSync(path.join(directory, 'cleanup.json'), `${JSON.stringify({ records }, null, 2)}\n`);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `\n## Teardown\n\n${records.map(record => `${record.resourceGroup || 'Cleanup error'}: ${record.verifiedDeleted ? 'absence verified' : 'NOT verified'}`).join('\n\n')}\n`);
  }
}

module.exports = { assertOwned, cleanupGroup, main };
