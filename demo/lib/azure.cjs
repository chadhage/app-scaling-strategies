'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { fail, integer } = require('./contract.cjs');
const execute = promisify(execFile);

async function az(args) {
  if (process.platform === 'win32') throw fail('runner-os', 'Native orchestration runs on the Linux GitHub Actions runner. Local unit tests remain cross-platform.');
  try {
    const { stdout } = await execute('az', [...args, '--only-show-errors', '--output', 'json'], {
      timeout: 900000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
    });
    return stdout.trim() ? JSON.parse(stdout) : null;
  } catch (error) {
    // Arguments can refer to secure parameter files; never echo the command.
    const failure = fail('azure-command-failed', `Azure CLI operation ${args.slice(0, 3).join(' ')} failed (exit ${error.code ?? 'unknown'}). Inspect the deployment operation in Azure.`, 502);
    failure.details = (error.stderr || error.message).trim().slice(0, 3000);
    failure.cause = error;
    throw failure;
  }
}

function platform(context, evidence, invoke = az) {
  const subscription = ['--subscription', context.subscription];
  return {
    async swap() {
      evidence.event('native-swap-started', { target: 'production', source: 'green', retries: 0 });
      await invoke(['webapp', 'deployment', 'slot', 'swap', '--resource-group', context.resourceGroup,
        '--name', context.workloadName, '--slot', 'green', '--target-slot', 'production', ...subscription]);
      evidence.event('native-swap-command-completed', { effectiveIdentityStillRequiresVerification: true });
    },
    async scale(capacity) {
      integer(capacity, 'capacity', 1, 2);
      const args = ['--resource-group', context.resourceGroup, '--template-file', path.resolve(__dirname, '..', '..', 'infra', 'scale.bicep'),
        '--parameters', `planName=${context.planName}`, `capacity=${capacity}`, `location=${context.location}`, ...subscription];
      await invoke(['deployment', 'group', 'what-if', ...args, '--no-pretty-print']);
      await invoke(['deployment', 'group', 'create', '--name', `capacity-${capacity}`, ...args]);
    },
    async instances() {
      const instances = await invoke(['webapp', 'list-instances', '--resource-group', context.resourceGroup, '--name', context.workloadName, ...subscription]);
      return instances.map(instance => instance.name);
    }
  };
}

module.exports = { az, platform };
