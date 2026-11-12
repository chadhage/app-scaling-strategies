'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { finished } = require('node:stream/promises');
const { pathToFileURL } = require('node:url');
const { root, verifySelection } = require('./selection.cjs');
const { inventory, sha } = require('./ast.cjs');
const { birth } = require('./process.cjs');
const output = process.env.C047_CAPTURE_DIR;
assert.equal(typeof output, 'string', 'MUTATION_CAPTURE_REQUIRES_EXPLICIT_OWN_OUTPUT');
const selected = verifySelection(), source = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
const domain = inventory(source), stopAt = Date.parse(process.env.C047_WORKER_DEADLINE) - 30000;
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const legacy = process.env.C047_HEAVY_SCRIPT, lockDir = process.env.C047_MUTATION_LOCKS;
assert.ok(legacy && lockDir, 'SANCTIONED_MUTATION_LEASE_PARAMETERS_REQUIRED');
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(domain, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'pristine-server.source.txt'), source, { flag: 'wx' });
const rows = [], leases = [];
let benignPristineFaults = null;
const faultFingerprint = fault => fault.className + ':' + fault.firstLine;
const write = (file, value) => fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function guardLeases() {
  for (const entry of fs.readdirSync(lockDir, { withFileTypes: true })) {
    const file = path.join(lockDir, entry.name);
    if (entry.isFile() && fs.statSync(file).mtimeMs < Date.now() - 45 * 60000) throw new Error('FOREIGN_STALE_LEASE_MUST_NOT_BE_CLEANED:' + entry.name);
  }
  const queue = path.join(lockDir, 'queue');
  if (fs.existsSync(queue)) for (const name of fs.readdirSync(queue)) {
    const pid = Number(name.split('-').at(-1).replace(/\.q$/, ''));
    try { process.kill(pid, 0); } catch { throw new Error('FOREIGN_STALE_TICKET_MUST_NOT_BE_CLEANED:' + name); }
  }
}
function lease(action, owner) {
  if (action === 'Acquire') guardLeases();
  const result = cp.spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', legacy,
    '-Action', action, '-Owner', owner, '-Slots', '4', '-MaxWaitMinutes', '1', '-LockDir', lockDir],
  { encoding: 'utf8', windowsHide: true, timeout: 90000, env: { ...process.env, NODE_V8_COVERAGE: '' } });
  assert.equal(result.error, undefined, 'LEGACY_MUTATION_LEASE_COMPLETES');
  assert.equal(result.status, 0, 'LEGACY_MUTATION_LEASE_SUCCEEDS:' + result.stderr);
  const event = { action, owner, slot: action === 'Acquire' ? Number(result.stdout.trim()) : null, atUtc: new Date().toISOString(),
    synchronousProbePid: result.pid, probeFullyReaped: true, probeFutureKillAuthority: false };
  fs.appendFileSync(path.join(output, 'leases.raw.jsonl'), JSON.stringify(event) + '\n');
  return event;
}
function copySubject(directory, changed) {
  const cap = path.join(directory, 'capability');
  fs.mkdirSync(cap, { recursive: true });
  const originalCap = path.dirname(root);
  for (const card of ['C009', 'C020', 'C022']) fs.cpSync(path.join(originalCap, card), path.join(cap, card), { recursive: true });
  const own = path.join(cap, 'C047'); fs.mkdirSync(own);
  fs.writeFileSync(path.join(own, 'server.cjs'), changed);
  fs.copyFileSync(path.join(root, 'imports.json'), path.join(own, 'imports.json'));
  return own;
}
function classification(exitCode, timedOut, stdout, stderr, newRuntimeExceptions = []) {
  const events = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) { try { events.push(JSON.parse(line)); } catch {} }
  const failures = events.filter(e => e.type === 'test:fail'), assertions = [], faults = [];
  for (const failure of failures) {
    let error = failure.details?.error;
    while (error?.cause) error = error.cause;
    const row = { test: failure.name || null, error };
    if (error?.code === 'ERR_ASSERTION' && typeof failure.name === 'string') assertions.push(row);
    else faults.push(row);
  }
  const cancelled = events.some(e => e.type === 'test:summary' && (e.counts?.cancelled || 0) > 0);
  const runtimeText = /\b(?:ReferenceError|TypeError|SyntaxError|RangeError|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ERR_INVALID_ARG_TYPE|ERR_UNSUPPORTED_ESM_URL_SCHEME)\b/.test(stderr);
  let status;
  if (timedOut) status = 'NON_KILL_TIMEOUT';
  else if (faults.length || runtimeText || cancelled || newRuntimeExceptions.length) status = 'NON_KILL_RUNTIME_OR_MODULE_FAULT';
  else if (exitCode !== 0 && assertions.length) status = 'KILLED_NAMED_SPECIFIED_ASSERTION';
  else if (exitCode === 0 && failures.length === 0) status = 'SURVIVED_UNCLOSED';
  else status = 'NON_KILL_UNCLASSIFIED_FAILURE';
  return { status, namedAssertions: assertions, faults, cancelled, runtimeText, failureCount: failures.length,
    passedTestNames: events.filter(e => e.type === 'test:pass').map(e => e.name) };
}
async function execute(label, changed, definition = null, tests = selected.tests) {
  assert.equal(Date.now() + 12000 < stopAt, true, 'FIXED_DEADLINE_NO_NEW_MUTATION_ADMISSION');
  const directory = path.join(output, 'runs', label);
  fs.mkdirSync(directory, { recursive: true });
  const subject = copySubject(path.join(directory, 'subject'), changed);
  fs.writeFileSync(path.join(directory, 'executed-server.source.txt'), changed, { flag: 'wx' });
  const admission = path.join(directory, 'admission.json'), stdoutFile = path.join(directory, 'stdout.raw'), stderrFile = path.join(directory, 'stderr.raw');
  const faultFile = path.join(directory, 'runtime-exceptions.raw.jsonl');
  const env = { ...process.env, C047_SUBJECT: subject, C047_ADMISSION: admission, C047_FAULT_LOG: faultFile, NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  const args = ['--require', path.join(__dirname, 'admission.cjs'), '--require', path.join(__dirname, 'fault-watch.cjs'), '--test', '--experimental-test-isolation=none', '--test-concurrency=1',
    '--test-timeout=8000', '--test-reporter=' + pathToFileURL(path.join(__dirname, 'events.cjs')).href, ...tests];
  const start = Date.now(), child = cp.spawn(process.execPath, args, { cwd: path.join(directory, 'subject'), env, windowsHide: true });
  const stdout = fs.createWriteStream(stdoutFile, { flags: 'wx' }), stderr = fs.createWriteStream(stderrFile, { flags: 'wx' });
  child.stdout.pipe(stdout); child.stderr.pipe(stderr);
  let code = null, timedOut = false, killEvidence = null, timer;
  const ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', value => { code = value; clearTimeout(timer); resolve(); }); });
  const identity = birth(child.pid);
  assert.equal([31036, 35440].includes(identity.pid), false, 'PROTECTED_PROCESS_NEVER_OWNED');
  write(path.join('runs', label, 'identity-before-work.json'), identity);
  fs.writeFileSync(admission, JSON.stringify({ pid: child.pid, birth: identity, admittedAtUtc: new Date().toISOString() }) + '\n', { flag: 'wx' });
  timer = setTimeout(() => {
    timedOut = true;
    try {
      const current = birth(identity.pid);
      if (current.birthFileTime === identity.birthFileTime && current.birthUtc7 === identity.birthUtc7) {
        killEvidence = { observed: current, action: 'exact-owned-process-kill', atUtc: new Date().toISOString() }; process.kill(identity.pid);
      } else killEvidence = { observed: current, action: 'refused-identity-mismatch' };
    } catch (error) { killEvidence = { action: 'no-kill-without-confirmation', error: error.message }; }
  }, Math.min(10000, Math.max(1, stopAt - Date.now())));
  await ended; await Promise.all([finished(stdout), finished(stderr)]);
  const out = fs.readFileSync(stdoutFile, 'utf8'), err = fs.readFileSync(stderrFile, 'utf8');
  const runtimeExceptions = fs.existsSync(faultFile) ? fs.readFileSync(faultFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const newRuntimeExceptions = benignPristineFaults === null ? [] : runtimeExceptions.filter(fault => !benignPristineFaults.has(faultFingerprint(fault)));
  const result = { label, mutantId: definition?.id || null, sourceSha256: sha(changed), definition, identityBeforeWork: identity,
    startedAtUtc: new Date(start).toISOString(), finishedAtUtc: new Date().toISOString(), durationMs: Date.now() - start, exitCode: code, testedFiles: tests,
    timedOut, killEvidence, ownChildFullyReaped: true, futureKillAuthority: false, stdoutSha256: sha(out), stderrSha256: sha(err),
    runtimeExceptions, newRuntimeExceptions, runtimeExceptionLogSha256: fs.existsSync(faultFile) ? sha(fs.readFileSync(faultFile)) : null,
    ...classification(code, timedOut, out, err, newRuntimeExceptions) };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  fs.rmSync(path.join(directory, 'subject'), { recursive: true });
  fs.appendFileSync(path.join(output, 'chronology.raw.jsonl'), JSON.stringify({ label, mutantId: result.mutantId, status: result.status,
    sourceSha256: result.sourceSha256, resultSha256: sha(fs.readFileSync(path.join(directory, 'result.json'))) }) + '\n');
  return result;
}
async function main() {
  const owner1 = 'worker-C047-' + path.basename(output) + '-slot-1', owner2 = 'worker-C047-' + path.basename(output) + '-slot-2';
  try {
    leases.push(lease('Acquire', owner1)); leases.push(lease('Acquire', owner2));
    const pristine = await execute('pristine-before', source);
    assert.equal(pristine.status, 'SURVIVED_UNCLOSED', 'PRISTINE_CONTROL_MUST_PASS');
    benignPristineFaults = new Set(pristine.runtimeExceptions.map(faultFingerprint));
    const fault = await execute('negative-module-fault-control', 'throw new TypeError("explicit non-kill control");\n');
    assert.equal(fault.status, 'NON_KILL_RUNTIME_OR_MODULE_FAULT', 'RUNTIME_FAULT_CONTROL_MUST_NEVER_COUNT_AS_KILL');
    assert.equal(fault.newRuntimeExceptions.length > 0, true, 'ACTUAL_RUNTIME_EXCEPTION_OBSERVER_CONTROL_MUST_DETECT_THE_FAULT');
    const redPath = process.env.C047_RED_SERVER;
    assert.equal(typeof redPath, 'string', 'ACTUAL_ORIGINAL_PRIVATE_RED_SPECIMEN_REQUIRED');
    const negative = await execute('negative-original-private-red', fs.readFileSync(redPath, 'utf8'), null, selected.tests.filter(file => path.basename(file) === 'acceptance.test.cjs'));
    assert.equal(negative.status, 'KILLED_NAMED_SPECIFIED_ASSERTION', 'ACTUAL_BEHAVIORAL_RED_CONTROL_HAS_NAMED_ASSERTIONS_NOT_FAULTS');
    write('controls.json', { pristine, runtimeFault: fault, originalPrivateRed: negative });
    const eligible = domain.definitions.filter(d => d.compiled && !d.identity);
    let next = 0;
    async function worker(number) {
      while (next < eligible.length && Date.now() + 12000 < stopAt) {
        const definition = eligible[next++], changed = source.slice(0, definition.start) + definition.replacement + source.slice(definition.end);
        assert.equal(sha(changed), definition.mutantSha256, 'EXACT_COMPILED_MUTANT_SOURCE_BINDING');
        const result = await execute('mutant-' + String(definition.id).padStart(4, '0'), changed, definition);
        rows.push({ worker: number, ...result });
        if (rows.length % 50 === 0) console.log(JSON.stringify({ observedMutants: rows.length, eligible: eligible.length }));
      }
    }
    await Promise.all([worker(1), worker(2)]);
    const after = await execute('pristine-after', source);
    assert.equal(after.status, 'SURVIVED_UNCLOSED', 'PRISTINE_AFTER_CONTROL_MUST_PASS');
    assert.equal(sha(fs.readFileSync(path.join(root, 'server.cjs'))), domain.sourceSha256, 'CURRENT_PRODUCTION_SOURCE_UNCHANGED_DURING_CAMPAIGN');
    const unexecuted = eligible.filter(d => !rows.some(row => row.mutantId === d.id)).map(d => d.id);
    const counts = Object.fromEntries([...new Set(rows.map(r => r.status))].map(status => [status, rows.filter(r => r.status === status).length]));
    const unresolved = rows.filter(r => r.status !== 'KILLED_NAMED_SPECIFIED_ASSERTION').map(r => ({ id: r.mutantId, status: r.status,
      sourceSha256: r.sourceSha256, operator: r.definition.operator, line: r.definition.line, start: r.definition.start, end: r.definition.end }));
    const report = { schema: 'C047-actual-complete-domain-mutation-campaign/1', sourceSha256: domain.sourceSha256, fullDomain: domain.counts,
      actualExecuted: rows.length, counts, unexecuted, semanticUnresolved: unresolved, semanticUnresolvedCount: unresolved.length + unexecuted.length,
      namedKilled: rows.filter(r => r.status === 'KILLED_NAMED_SPECIFIED_ASSERTION').length, equivalenceClaimed: 0,
      maxInternalSingleProcessMutationSlots: 2, normalPriority: true, standaloneBurners: 0, heavyNativeOverlap: false, allOwnedChildrenFullyReaped: true };
    write('campaign.json', report);
    console.log(JSON.stringify(report));
  } finally { for (const item of leases.reverse()) lease('Release', item.owner); }
}
main().catch(error => { write('campaign-failure.json', { name: error.name, code: error.code, message: error.message, stack: error.stack, rowsCompleted: rows.length }); console.error(error); process.exitCode = 1; });
