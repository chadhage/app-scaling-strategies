'use strict';

// --requalify: run the isolated helper suites (isolated.test.cjs, loopback.test.cjs) on the installed Edge, one
// node --test process per suite with a hard timeout, and record the counts together with the Edge version and
// SHA-256 seen before and after the run. A suite passes only when every test passed (none skipped, todo or cancelled)
// and it printed the "Real Chromium <version>" line of the Edge under test. A change of Edge during the run, a failing
// or silent suite or a timeout fails closed.
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { qualifyEdge } = require('./qualify.cjs');
const { runShell, withoutKeys } = require('./adapters.cjs');

const BROWSER_DIR = path.resolve(__dirname, '..');
const SUITES = ['isolated.test.cjs', 'loopback.test.cjs'];
const SUITE_TIMEOUT_MS = 600000;
const SLOT_TIMEOUT_MS = 26 * 60 * 1000;
const MAX_OUTPUT = 16 * 1024 * 1024;
const COUNTERS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const SUMMARY_COUNTERS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];

// A summary that lacks a counter proves nothing about that counter (suites is informational).
const summaryComplete = (counts) => SUMMARY_COUNTERS.every((name) => counts[name] !== null);

// A nested node --test that inherits these exits 0 even when its tests fail (lesson L-0002). spawn() copies
// process.env.NODE_V8_COVERAGE into any child environment that has no OWN key of that name (lesson L-0140), so deleting the
// key is not enough: it stays, empty, and the nested run writes no coverage into the caller's directory.
function childEnvironment(env = process.env) {
  return { ...withoutKeys(env, /^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i), NODE_V8_COVERAGE: '' };
}

function parseTap(output) {
  const counts = {};
  for (const name of COUNTERS) {
    const match = new RegExp(`^# ${name} (\\d+)\\s*$`, 'm').exec(output);
    counts[name] = match ? Number(match[1]) : null;
  }
  const failedTests = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()).slice(0, 20);
  return { counts, failedTests };
}

// Every test must have passed: node exits 0 for skipped and todo tests and counts an empty file as one passing test, so the
// verdict never rests on the exit code alone. Each guard is listed on purpose, although tests = pass + fail + cancelled +
// skipped + todo makes some of them redundant today.
function countsPassed(facts) {
  return !facts.timedOut && facts.spawnError === null && facts.exitCode === 0 && facts.summaryFound
    && facts.pass > 0 && facts.pass === facts.tests
    && facts.fail === 0 && facts.cancelled === 0 && facts.skipped === 0 && facts.todo === 0;
}

function endProcessTree(child) {
  if (process.platform === 'win32') {
    childProcess.spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
  }
  child.kill('SIGKILL');
}

function runSuite(file, options = {}) {
  const cwd = options.cwd || BROWSER_DIR;
  const timeoutMs = options.timeoutMs || SUITE_TIMEOUT_MS;
  const args = ['--test', '--test-concurrency=1', '--test-reporter=tap', file];
  const started = Date.now();
  return new Promise((resolve) => {
    const out = [];
    const err = [];
    let size = 0;
    let timedOut = false;
    let spawnError = null;
    let child;
    const finish = (status, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out);
      const text = stdout.toString('utf8');
      const { counts, failedTests } = parseTap(text);
      const summaryFound = summaryComplete(counts);
      const testsPassed = countsPassed({ timedOut, spawnError, exitCode: status, summaryFound, ...counts });
      // Positive evidence that a browser ran: the diagnostic line "Real Chromium <version>" of the isolated helper suites.
      const browserVersionsSeen = [...new Set([...text.matchAll(/^\s*# Real Chromium (\d+(?:\.\d+)+)/gm)].map((match) => match[1]))];
      resolve({
        file,
        command: ['node.exe', ...args],
        startedAtUtc: new Date(started).toISOString(),
        elapsedMs: Date.now() - started,
        timeoutMs,
        timedOut,
        spawnError,
        exitCode: status,
        signal,
        ...counts,
        summaryFound,
        failedTests,
        browserVersionsSeen,
        testsPassed,
        passed: testsPassed && browserVersionsSeen.length > 0,
        stdoutBytes: stdout.length,
        stdoutSha256: crypto.createHash('sha256').update(stdout).digest('hex'),
        stderrTail: Buffer.concat(err).toString('utf8').slice(-400),
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      endProcessTree(child);
    }, timeoutMs);
    try {
      child = childProcess.spawn(options.nodePath || process.execPath, args, {
        cwd, env: childEnvironment(options.env), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
    } catch (error) {
      spawnError = error.message;
      finish(null, null);
      return;
    }
    const keep = (target) => (chunk) => {
      size += chunk.length;
      if (size <= MAX_OUTPUT) target.push(chunk);
    };
    child.stdout.on('data', keep(out));
    child.stderr.on('data', keep(err));
    child.on('error', (error) => { spawnError = error.message; });
    child.on('close', (status, signal) => finish(status, signal));
  });
}

// Optional heavy-slot hook: any PowerShell script that takes -Action Acquire|Release and -Owner <name>.
// It runs under PowerShell 7 (pwsh): Windows PowerShell 5.1 refuses local scripts under its default Restricted policy.
function createSlot({ script, owner, shell, buildArgs, timeoutMs, env }) {
  const exe = shell || 'pwsh.exe';
  const argsFor = buildArgs || ((action) => ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, '-Action', action, '-Owner', owner]);
  const call = (action) => runShell({ shell: exe, args: argsFor(action), env: env || process.env, timeoutMs: timeoutMs || SLOT_TIMEOUT_MS });
  return {
    async acquire() { return (await call('Acquire')).trim(); },
    async release() { await call('Release'); },
  };
}

function summarize(suites) {
  const totals = Object.fromEntries(COUNTERS.map((name) => [name, suites.reduce((sum, suite) => sum + (suite[name] || 0), 0)]));
  return { totals, allSuitesPassed: suites.length > 0 && suites.every((suite) => suite.passed) };
}

function describeSuite(suite) {
  const problems = [];
  if (suite.spawnError !== null) problems.push(`could not start: ${suite.spawnError}`);
  if (suite.timedOut) problems.push('timed out');
  if (!suite.summaryFound) problems.push('no TAP summary');
  else if (suite.tests === 0) problems.push('no test ran');
  for (const [name, label] of [['fail', 'failed'], ['cancelled', 'cancelled'], ['skipped', 'skipped'], ['todo', 'todo']]) {
    if (suite[name] > 0) problems.push(`${suite[name]} ${label}`);
  }
  if (problems.length === 0) problems.push(suite.exitCode === 0 ? 'the counts do not add up' : `exit code ${suite.exitCode}`);
  return `${suite.file} passed ${suite.pass ?? 0} of ${suite.tests ?? 0} tests (${problems.join(', ')})`;
}

async function requalifyEdge(options = {}) {
  const qualify = options.qualify || qualifyEdge;
  const before = await qualify(options.qualifyOptions);
  const report = { ...before, requalification: { ran: false } };
  // A new major is exactly what a requalification is for; every other failure means the binary must not be launched.
  const blockers = before.reasonCodes.filter((code) => code !== 'MAJOR_NOT_QUALIFIED');
  if (blockers.length > 0) {
    report.requalification.skipped = `the binary is not launchable under the qualification rules: ${blockers.join(', ')}`;
    return report;
  }
  const slot = options.slot;
  const slotNumber = slot ? await slot.acquire() : null;
  const suites = [];
  try {
    for (const file of options.suites || SUITES) {
      suites.push(await runSuite(file, { cwd: options.cwd, timeoutMs: options.suiteTimeoutMs, nodePath: options.nodePath, env: options.env }));
    }
  } finally {
    if (slot) await slot.release();
  }
  const after = await qualify(options.qualifyOptions);
  const changed = after.path !== before.path || after.version !== before.version || after.sha256 !== before.sha256;
  const { totals, allSuitesPassed } = summarize(suites);
  const seen = [...new Set(suites.flatMap((suite) => suite.browserVersionsSeen))];
  const mismatched = seen.filter((version) => version !== before.version);
  const failedSuites = suites.filter((suite) => !suite.testsPassed);
  const silentSuites = suites.filter((suite) => suite.browserVersionsSeen.length === 0);
  const passed = allSuitesPassed && !changed && mismatched.length === 0;
  const extra = [];
  if (suites.length === 0) extra.push(['REQUALIFICATION_FAILED', 'no suite was run']);
  else if (failedSuites.length > 0) extra.push(['REQUALIFICATION_FAILED', failedSuites.map(describeSuite).join('; ')]);
  if (silentSuites.length > 0) {
    extra.push(['BROWSER_VERSION_MISSING', `${silentSuites.map((suite) => suite.file).join(', ')} printed no "Real Chromium <version>" line, so the run did not show that a browser ran`]);
  }
  if (changed) extra.push(['EDGE_CHANGED_DURING_REQUALIFICATION', `before ${before.version} ${before.sha256}, after ${after.version} ${after.sha256}`]);
  if (mismatched.length > 0) extra.push(['BROWSER_VERSION_MISMATCH', `the suites ran Chromium ${mismatched.join(', ')} but the qualified msedge.exe is ${before.version}`]);
  report.requalification = {
    ran: true,
    passed,
    candidateMajor: before.major,
    heavySlot: slotNumber,
    node: process.version,
    suites,
    totals,
    browserVersionsSeen: seen,
    edgeAfter: { path: after.path, version: after.version, sha256: after.sha256, ok: after.ok },
    edgeChangedDuringRun: changed,
  };
  report.reasonCodes = [...before.reasonCodes, ...extra.map(([code]) => code)];
  report.reasons = [...before.reasons, ...extra.map(([code, message]) => `${code}: ${message}`)];
  report.ok = before.ok && passed;
  return report;
}

module.exports = {
  BROWSER_DIR, SUITES, childEnvironment, parseTap, summaryComplete, countsPassed, describeSuite, endProcessTree, runSuite, createSlot, summarize, requalifyEdge,
};
