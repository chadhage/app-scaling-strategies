'use strict';

const { makeCommand, describeCommand, execute } = require('..\\commands.cjs');
const store = require('..\\..\\C015\\store.cjs');

async function work(args) {
  const [action, namespace, runId, expected, variant] = args;
  if (action === 'read' && args.length === 3) return store.restore(namespace, runId);
  if (args.length < 4 || args.length > 5 || !/^[012]$/.test(expected)) throw new Error('Exact bounded worker arguments and integer expected epoch 0, 1 or 2 required.');
  if (action === 'c015-fault') {
    if (!['after-partial-write', 'after-flush', 'after-publish'].includes(variant)) throw new Error('Unknown C015 test fault.');
  } else if (variant !== undefined && !['different-payload', 'extra-field'].includes(variant)) {
    throw new Error('Unknown worker variant; arbitrary data is not accepted.');
  }
  const command = makeCommand(runId, Number(expected));
  if (action === 'mutate-input') {
    const declared = describeCommand(command);
    const pending = execute(namespace, command);
    Object.assign(command, makeCommand('synthetic-run-002', 0));
    return { schemaVersion: 1, kind: 'actual-input-snapshot-test', pid: process.pid,
      declared, callerChangedTo: describeCommand(command), result: await pending };
  }
  if (variant === 'different-payload') command.candidate.envelope.load.requestsPerSecond++;
  if (variant === 'extra-field') command.userData = 'forbidden';
  if (action === 'c015-fault') return store.persist(namespace, command.candidate, { testFault: variant });
  if (!['apply', 'lost-stdout'].includes(action)) throw new Error('Unknown bounded worker action.');
  const result = await execute(namespace, command);
  if (action === 'lost-stdout' && result.outcome === 'positive') {
    process.stderr.write(`${JSON.stringify({
      code: 'CLIENT_ACK_UNOBSERVED', stage: 'after-receipt-before-stdout',
      acknowledged: false, commandId: result.commandId, pid: process.pid,
    })}\n`);
    process.exit(87);
  }
  return result;
}

function run(args) {
  work(args).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({
      code: error.code || 'WORKER_ERROR', message: error.message, acknowledged: false, pid: process.pid,
    })}\n`);
    process.exitCode = 1;
  });
}

if (process.argv[2] === 'concurrent') {
  process.send({ ready: true, pid: process.pid });
  process.once('message', (message) => {
    if (message !== 'go') throw new Error('Unknown start signal.');
    process.disconnect();
    run(process.argv.slice(3));
  });
} else {
  run(process.argv.slice(2));
}
