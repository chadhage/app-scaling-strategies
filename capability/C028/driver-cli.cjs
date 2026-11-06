'use strict';

// Driver CLI: calls a local gRPC fixture and prints the driver's report as one JSON line. It rechecks the current C001
// local-probe consent before it opens any connection and accepts only http://127.0.0.1:<port> origins.
//   node capability\C028\driver-cli.cjs <origin> watch <topic> <count> [--interval-ms N] [--payload-bytes N] [--timeout-ms N] [--cancel-after N]
//   node capability\C028\driver-cli.cjs <origin> chat <text> [<text> ...]
// Exit code: 0 only when the report is ok, 1 for any other outcome, 2 for usage, consent or connection failures.
const fs = require('node:fs');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const { connect } = require('./driver.cjs');
const { METHODS } = require('./service.cjs');

const USAGE = 'usage: driver-cli.cjs <http://127.0.0.1:port> watch <topic> <count> [--interval-ms N] [--payload-bytes N] [--timeout-ms N (default 30000)] [--cancel-after N] | chat <text>...';
const DEFAULT_TIMEOUT_MS = 30000;
const INTEGER = /^(?:0|[1-9][0-9]{0,8})$/;
const FLAGS = Object.freeze({
  '--interval-ms': ['interval_ms', 0], '--payload-bytes': ['payload_bytes', 0], '--timeout-ms': ['timeoutMs', 1], '--cancel-after': ['cancelAfter', 1]
});

class UsageError extends Error {}

function parseWatch(rest) {
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith('--')) {
      positional.push(rest[index]);
      continue;
    }
    if (!Object.hasOwn(FLAGS, rest[index])) throw new UsageError(`unknown option ${rest[index]}`);
    const [key, minimum] = FLAGS[rest[index]];
    const value = rest[index + 1];
    if (Object.hasOwn(options, key) || value === undefined || !INTEGER.test(value) || Number(value) < minimum) {
      throw new UsageError(`${rest[index]} needs one integer of at least ${minimum}`);
    }
    options[key] = Number(value);
    index += 1;
  }
  if (positional.length !== 2 || !INTEGER.test(positional[1])) throw new UsageError('watch needs <topic> <count>');
  return { command: 'watch', topic: positional[0], count: Number(positional[1]), options };
}

function parseArguments(argv) {
  const [origin, command, ...rest] = argv;
  if (command === 'watch') return { origin, ...parseWatch(rest) };
  if (command === 'chat' && rest.length > 0 && !rest.some((item) => item.startsWith('--'))) return { origin, command, notes: rest };
  throw new UsageError(USAGE);
}

function summarize(report) {
  return {
    ok: report.ok, outcome: report.outcome, status: report.status, httpStatus: report.httpStatus, trailersOnly: report.trailersOnly,
    trailers: report.trailers, violations: report.violations, messageCount: report.messageCount, messages: report.messages
  };
}

async function converse(client, parsed) {
  if (parsed.command === 'chat') {
    const call = client.call(METHODS.Chat.path, undefined, { timeoutMs: DEFAULT_TIMEOUT_MS });
    for (const text of parsed.notes) call.write({ text });
    call.end();
    return call.result;
  }
  const { cancelAfter, interval_ms: intervalMs, payload_bytes: payloadBytes, timeoutMs = DEFAULT_TIMEOUT_MS } = parsed.options;
  const call = client.call(METHODS.Watch.path, { topic: parsed.topic, count: parsed.count, interval_ms: intervalMs, payload_bytes: payloadBytes }, { timeoutMs });
  if (cancelAfter !== undefined) {
    for await (const message of call.messages()) {
      if (message.seq >= cancelAfter) call.cancel();
    }
  }
  return call.result;
}

async function runCli(argv, {
  readLedger = () => fs.readFileSync(path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json'), 'utf8'),
  connectTo = connect, log = console.log, error = console.error
} = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (failure) {
    error(failure instanceof UsageError ? failure.message : USAGE);
    return 2;
  }
  let approval;
  try {
    approval = JSON.parse(readLedger()).approvals?.C001;
  } catch {
    error('C001 current consent is unavailable; no connection was made.');
    return 2;
  }
  const permission = await guardOperation('local.probe', approval);
  if (!permission.allowed) {
    error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
    return 2;
  }
  let client;
  try {
    client = await connectTo(parsed.origin);
  } catch (failure) {
    error(`cannot connect: ${failure.code ?? failure.message}`);
    return 2;
  }
  try {
    const report = await converse(client, parsed);
    log(JSON.stringify(summarize(report)));
    return report.ok ? 0 : 1;
  } finally {
    client.close();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = Object.freeze({ parseArguments, summarize, runCli, UsageError });
