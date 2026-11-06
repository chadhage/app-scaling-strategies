'use strict';
// K-C001 test helper: runs the REAL capability\C001\probe.cjs as a child process with the ledger served from memory by
// fixtures\k-c001-probe-preload.cjs (tests only; never production code). Every child has a hard timeout (SIGKILL) and a test starts
// its children together, because a node start takes about a second on a loaded machine.
// The child keeps NODE_V8_COVERAGE, so Node merges its coverage of the real probe.cjs into the parent's report.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const snapshot = require('../../approved-contract.js');

const probe = resolve(__dirname, '..', '..', 'probe.cjs');
const preload = resolve(__dirname, 'k-c001-probe-preload.cjs');
const ledgerPath = resolve(__dirname, '..', '..', '..', '..', '.docs', 'wiki', 'flow-state.json');
const SECRET = 'k-c001-secret-detail';
const TIMEOUT_MS = 30000;
const FAILED_CLOSED = Object.freeze({
  allowed: false,
  executed: false,
  reasons: [{ code: 'PROBE_FAILURE', message: 'Local probe failed closed.' }]
});

const ledgerOf = (approval) => JSON.stringify({ approvals: { C001: approval } });
const approved = ledgerOf(snapshot.approval);
const codes = (decision) => decision.reasons.map((reason) => reason.code);

function childEnvironment(setup = {}) {
  const env = { ...process.env, K_C001_LEDGER_PATH: setup.ledger || ledgerPath };
  for (const name of ['NODE_TEST_CONTEXT', 'K_C001_LEDGER_TEXT', 'K_C001_LEDGER_ERROR', 'K_C001_FAULT']) delete env[name];
  if (setup.text !== undefined) env.K_C001_LEDGER_TEXT = setup.text;
  if (setup.error) env.K_C001_LEDGER_ERROR = setup.error;
  if (setup.fault) env.K_C001_FAULT = setup.fault;
  return env;
}

function node(args, setup) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--require', preload, ...args], {
      env: childEnvironment(setup), timeout: TIMEOUT_MS, killSignal: 'SIGKILL', windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', fail);
    child.on('close', (status, signal) => {
      if (signal !== null) fail(new Error(`the child was killed by ${signal}: it must finish inside ${TIMEOUT_MS} ms`));
      else done({ status, stdout, stderr });
    });
  });
}

const run = (args, setup) => node([probe, ...args], setup);
const runAll = (cases) => Promise.all(cases.map(([args, setup]) => run(args, setup)));

function decisionOf(result) {
  assert.equal(result.stderr, '', 'a decision is reported on standard output only');
  const decision = JSON.parse(result.stdout);
  assert.equal(result.stdout, `${JSON.stringify(decision, null, 2)}\n`, 'two-space JSON and one newline');
  assert.equal(decision.executed, false);
  assert.equal(decision.nativeExecutionLimit, 0);
  assert.equal(decision.authorizedCloudSpend, 0);
  return decision;
}

module.exports = Object.freeze({
  snapshot, probe, ledgerPath, SECRET, FAILED_CLOSED, ledgerOf, approved, codes, node, run, runAll, decisionOf
});
