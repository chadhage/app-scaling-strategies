'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { experiments, fail, integer, resourceGroup, catalog } = require('./lib/contract.cjs');
const { Evidence } = require('./lib/client.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'demo-output');
const evidenceDirectory = path.join(output, 'evidence');

function configuration(env) {
  const ids = ['AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID'];
  for (const key of ids) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env[key] || '')) throw fail('missing-configuration', `${key} must be explicitly configured.`);
  }
  if (!/^[a-z][a-z0-9]{2,30}$/.test(env.AZURE_LOCATION || '')) throw fail('missing-configuration', 'AZURE_LOCATION must be explicitly approved and configured.');
  if (env.CONFIRM_COST !== 'true') throw fail('cost-not-approved', 'Explicit cost and teardown confirmation is required.');
  const estimate = Number(env.ESTIMATED_COST_USD);
  const allowance = Number(env.MAX_ESTIMATED_COST_USD);
  if (!Number.isFinite(estimate) || estimate <= 0 || !Number.isFinite(allowance) || allowance <= 0 || estimate > allowance) {
    throw fail('cost-not-approved', 'A positive reviewed estimate within the environment allowance is required; this is not a billing cap.');
  }
  const selected = env.EXPERIMENT === 'all-implemented' ? Object.keys(experiments) : [env.EXPERIMENT];
  if (selected.some(id => !Object.hasOwn(experiments, id))) throw fail('unknown-experiment', 'Choose an implemented experiment, not an arbitrary scenario ID.');
  if (estimate * selected.length > allowance) throw fail('cost-not-approved', 'The selected campaign exceeds the environment estimated-spend allowance.');
  const users = integer(env.USERS, 'users', 4, 40);
  if (users % 2) throw fail('invalid-input', 'Use an even number of users for stratified cohorts.');
  return {
    selected, users,
    subscription: env.AZURE_SUBSCRIPTION_ID,
    location: env.AZURE_LOCATION,
    estimatedCostUsdPerExperiment: estimate,
    observationSeconds: integer(env.OBSERVATION_SECONDS, 'observationSeconds', 2, 60),
    journeysPerSecond: integer(env.JOURNEYS_PER_SECOND, 'journeysPerSecond', 1, 5)
  };
}

function contextFor(env, config, experiment) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || '')) throw fail('missing-configuration', 'GitHub repository identity is required.');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw fail('missing-configuration', 'An immutable commit identity is required.');
  return {
    ...config, selected: undefined, experiment,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    resourceGroup: resourceGroup(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, experiment),
    epoch: `${env.GITHUB_RUN_ID}.${env.GITHUB_RUN_ATTEMPT}`, commit: env.GITHUB_SHA,
    expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    requestBudgetMs: 2000, journeyBudgetMs: 600000,
    readinessTimeoutMs: 600000, monitorTimeoutMs: 1800000
  };
}

function writeCatalog() {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const scenarios = catalog(fs.readFileSync(path.join(root, 'README.md'), 'utf8'));
  fs.writeFileSync(path.join(evidenceDirectory, 'coverage.json'), `${JSON.stringify({
    schemaVersion: 1, total: scenarios.length, qualification: 'none-inferred',
    phases: {
      1: 'Bounded native App Service experiments',
      2: 'Container Apps revisions, AKS rollouts, Functions updates, and runtime variants',
      3: 'Stateful n-tier, streaming, data, queue, and ownership experiments',
      4: 'Regional failure domains, soak, correlation, and statistical qualification'
    },
    scenarios
  }, null, 2)}\n`);
}

async function preflight(context, az, evidence) {
  if (await az(['account', 'show', '--query', 'id']) !== context.subscription) throw fail('subscription-mismatch', 'OIDC selected a different subscription.');
  if (await az(['group', 'exists', '--name', context.resourceGroup, '--subscription', context.subscription])) {
    throw fail('resource-group-exists', 'Refusing to reuse a resource group. Each run must be isolated.');
  }
  const locations = await az(['appservice', 'list-locations', '--sku', 'P1V3', '--linux-workers-enabled', '--subscription', context.subscription]);
  if (!locations.some(location => location.name.replace(/\s+/g, '').toLowerCase() === context.location)) throw fail('unsupported-location', 'P1v3 Linux is not listed in the approved region.');
  const runtimes = await az(['webapp', 'list-runtimes', '--os', 'linux']);
  if (!runtimes.some(runtime => runtime.config === 'NODE|24-lts')) throw fail('unsupported-runtime', 'Node.js 24 LTS is not listed for Linux.');
  const scope = `/subscriptions/${context.subscription}/providers/Microsoft.Web/locations/${context.location}`;
  const quotas = await az(['quota', 'list', '--scope', scope]);
  const usages = await az(['quota', 'usage', 'list', '--scope', scope]);
  const limit = quotas.find(quota => quota.name === 'P1v3')?.properties.limit.value;
  const used = usages.find(usage => usage.name === 'P1v3')?.properties.usages.value;
  if (!Number.isFinite(limit) || !Number.isFinite(used) || used < 0 || limit - used < 2) throw fail('capacity-not-verified', 'At least two available P1v3 workers must be verified; unknown quotas do not mean unlimited capacity.');
  evidence.event('preflight', { region: context.location, runtime: 'NODE|24-lts', sku: 'P1v3', maximumWorkers: 2, quotaLimit: limit, quotaUsed: used, estimateSource: 'operator-reviewed-dispatch-input', estimatedCostUsd: context.estimatedCostUsdPerExperiment });
}

async function execute(env) {
  const { az, platform } = require('./lib/azure.cjs');
  const { packageReleases } = require('./package.cjs');
  const { runExperiment } = require('./experiments.cjs');
  const config = configuration(env);
  if (!Object.hasOwn(experiments, env.EXPERIMENT)) throw fail('unknown-experiment', 'Execute exactly one matrix experiment.');
  const context = contextFor(env, config, env.EXPERIMENT);
  const evidence = new Evidence(evidenceDirectory, context);
  writeCatalog();
  fs.writeFileSync(path.join(evidenceDirectory, 'context.json'), `${JSON.stringify(context, null, 2)}\n`);
  const parametersFile = path.join(output, 'private-parameters.json');
  let experimentStarted = false;
  try {
    await preflight(context, az, evidence);
    const credentials = { demoToken: randomBytes(32).toString('hex'), controlToken: randomBytes(32).toString('hex') };
    for (const secret of Object.values(credentials)) console.log(`::add-mask::${secret}`);
    const packages = path.join(output, 'packages');
    packageReleases(packages, context.epoch, context.commit);
    const parameters = {
      resourceGroupName: context.resourceGroup, location: context.location, repository: context.repository,
      runId: context.runId, runAttempt: context.runAttempt, experiment: context.experiment, expiresAt: context.expiresAt,
      ...credentials
    };
    fs.writeFileSync(parametersFile, JSON.stringify({
      $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
      contentVersion: '1.0.0.0',
      parameters: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { value }]))
    }), { mode: 0o600 });
    const args = ['--subscription', context.subscription, '--location', context.location,
      '--name', `ass-${context.runId}-${context.runAttempt}-${context.experiment}`,
      '--template-file', path.join(root, 'infra', 'main.bicep'), '--parameters', `@${parametersFile}`];
    await az(['deployment', 'sub', 'validate', ...args]);
    evidence.event('arm-validation', { passed: true, scope: 'subscription' });
    const preview = await az(['deployment', 'sub', 'what-if', ...args, '--no-pretty-print',
      '--query', '{status:status,changes:changes[].{resourceId:resourceId,changeType:changeType}}']);
    const prefix = `/subscriptions/${context.subscription}/resourcegroups/${context.resourceGroup}`.toLowerCase();
    if (preview.status !== 'Succeeded' || !Array.isArray(preview.changes) || !preview.changes.length ||
      preview.changes.some(change => {
        const id = change.resourceId.toLowerCase();
        return id !== prefix && !id.startsWith(`${prefix}/`) || !['Create', 'NoChange', 'Ignore'].includes(change.changeType);
      })) {
      throw fail('unsafe-what-if', 'What-if did not verify an isolated, non-destructive creation.');
    }
    evidence.event('what-if', preview);
    const deployment = await az(['deployment', 'sub', 'create', ...args, '--query', 'properties.outputs']);
    for (const key of ['workloadName', 'routerName', 'planName', 'blueUrl', 'greenUrl', 'routerUrl']) {
      if (typeof deployment[key]?.value !== 'string') throw fail('missing-deployment-output', `Deployment output ${key} is missing.`);
      context[key] = deployment[key].value;
    }
    fs.writeFileSync(path.join(evidenceDirectory, 'context.json'), `${JSON.stringify(context, null, 2)}\n`);
    evidence.event('lifecycle', { state: 'CREATED', resourceGroup: context.resourceGroup });
    for (const version of ['blue', 'green', 'router']) {
      await az(['webapp', 'deploy', '--subscription', context.subscription, '--resource-group', context.resourceGroup,
        '--name', version === 'router' ? context.routerName : context.workloadName,
        ...(version === 'green' ? ['--slot', 'green'] : []),
        '--src-path', path.join(packages, `${version}.zip`), '--type', 'zip', '--restart', 'true', '--async', 'false', '--timeout', '600000']);
      evidence.event('artifact-deployed', { version, epoch: context.epoch, commit: context.commit });
    }
    experimentStarted = true;
    await runExperiment(context, credentials, evidence, platform(context, evidence));
  } catch (error) {
    if (!experimentStarted) evidence.save('unverified', false, { code: error.code || error.name, message: error.message });
    throw error;
  } finally {
    fs.rmSync(parametersFile, { force: true });
    if (env.GITHUB_STEP_SUMMARY && fs.existsSync(path.join(evidenceDirectory, 'result.json'))) {
      const result = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'result.json'), 'utf8'));
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## ${context.experiment}\n\nOutcome: **${result.outcome}**. Control passed: **${result.controlPassed}**.\n\nTransition journeys: ${JSON.stringify(result.transitionJourneys)}\n\nSee the evidence artifact, including cleanup.json. This is not native qualification or five-nines proof.\n`);
    }
  }
}

async function main(command, env = process.env) {
  if (command === 'catalog') return writeCatalog();
  if (command === 'plan') {
    const config = configuration(env);
    writeCatalog();
    if (!env.GITHUB_OUTPUT) throw fail('missing-configuration', 'GitHub output destination is missing.');
    fs.appendFileSync(env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ experiment: config.selected })}\n`);
    return;
  }
  if (command === 'execute') return execute(env);
  if (command === 'cleanup' || command === 'sweep') return require('./cleanup.cjs').main(command, env);
  throw fail('unknown-command', 'Use catalog, plan, execute, cleanup, or sweep.');
}

if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(JSON.stringify({ code: error.code || error.name, message: error.message, details: error.details }));
  process.exitCode = 1;
});

module.exports = { configuration, contextFor, preflight, main };
