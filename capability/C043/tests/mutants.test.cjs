'use strict';

// MUTANTS: every guard of the runner, the preset contract, the journal and the server is removed or weakened in a
// PRIVATE, in-memory copy (a --require preload rewrites one file as it loads; nothing on disk changes) and the focused
// tests must fail, by NAME. A control run of the same focused tests on the unmutated code must pass, and the mutation
// must match exactly once, so a vacuous or broken mutant can never look killed. Equivalent mutants are listed, not hidden.
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const preload = path.join(__dirname, 'mutate-preload.cjs');
const INITIAL_A = 'evidence/red/initial-a.snapshot.cjs';
const INITIAL_B = 'evidence/red/initial-b.snapshot.cjs';

const MUTANTS = [
  ['R1 the duration bound is ignored before a step', 'runner.cjs', "if (elapsed > run.preset.bounds.maxDurationMs) return this.#close(key, 'bounded', elapsed);", '', INITIAL_A, 'a bound exceeded is PRESET_BOUND_EXCEEDED'],
  ['R2 the duration bound is off by one', 'runner.cjs', 'if (elapsed > run.preset.bounds.maxDurationMs) return', 'if (elapsed >= run.preset.bounds.maxDurationMs) return', 'tests/runner.test.cjs', 'a step may start exactly at the duration bound', {}, 'the bounds, the run limit and a hostile clock'],
  ['R3 a run that finished late is reported completed', 'runner.cjs', "elapsed > this.#log.runs.get(key).preset.bounds.maxDurationMs ? 'bounded' : 'completed'", "'completed'", INITIAL_A, 'a bound exceeded is PRESET_BOUND_EXCEEDED'],
  ['R4 the runner calls a private copy of the step service', 'runner.cjs', "if (mode === 'plain') return { answer: await this.#engine.submit(spec) };",
    "if (mode === 'plain') return { answer: await (await require('../C042/engine.cjs').openEngine({ io: require('../C042/journal.cjs').createMemoryIo() })).submit(spec) };", INITIAL_A, 'identical at the shared boundary'],
  ['R5 the runner bypasses validation of a preset object', 'runner.cjs', 'const parsed = presets.parsePreset(source);', "const parsed = source && source.steps ? { ok: true, preset: source, sha256: 'x'.repeat(64) } : presets.parsePreset(source);", INITIAL_A, 'an invalid preset is a typed failure'],
  ['R6 the preset keeps going after a refused step', 'runner.cjs', "if (facts.status === 'failed') return this.#close(key, 'stopped', this.#elapsed(live));", '', INITIAL_B, 'stops at the first refused step'],
  ['R7 a key reused with another preset is not a conflict', 'runner.cjs', "if (known.sha256 !== sha256) return this.#answer('run', known, { errorCode: 'IDEMPOTENCY_KEY_CONFLICT' });", '', INITIAL_B, 're-running with the same idempotency key'],
  ['R8 resume starts again at the first step', 'runner.cjs', 'const index = run.done + 1;', "const index = firstMode === 'resume' ? 1 : run.done + 1;", INITIAL_B, 'after a restart the preset is INTERRUPTED'],
  ['R9 resume does not ask the step service what it already knows', 'runner.cjs', "if (mode === 'plain') return { answer: await this.#engine.submit(spec) };", "if (mode !== 'cancel') return { answer: await this.#engine.submit(spec) };", 'tests/runner.test.cjs', 'not executed again on resume'],
  ['R10 a cancelled run is recorded as a success', 'runner.cjs', "if (facts.status === 'cancelled') return this.#log.append({ type: 'cancel', key, elapsedMs: this.#elapsed(live) });", "if (facts.status === 'cancelled') return this.#close(key, 'completed', 0);", INITIAL_B, 'cancellation is explicit'],
  ['P1 maxSteps is ignored', 'preset.cjs', 'if (steps.length > bounds.maxSteps) return', 'if (false) return', INITIAL_A, 'a bound exceeded is PRESET_BOUND_EXCEEDED'],
  ['P2 maxUnits is ignored', 'preset.cjs', 'return units > bounds.maxUnits ? {', 'return false ? {', INITIAL_A, 'a bound exceeded is PRESET_BOUND_EXCEEDED'],
  ['P3 steps are not the output of the C042 validator', 'preset.cjs', 'steps: Object.freeze(value.steps.map((step) => input.validateInput(step).input)),', 'steps: Object.freeze(value.steps),', 'tests/same-steps.test.cjs', 'frozen output of the C042 validator'],
  ['P4 twin step keys are accepted', 'validate.js', "if (typeof key === 'string' && keys.has(key)) add(", 'if (false) add(', INITIAL_A, 'an invalid preset is a typed failure'],
  ['P5 any number of steps is accepted', 'validate.js', "if (steps.length > contract.LIMITS.steps) { add('steps', 'TOO_MANY_STEPS'); return; }", '', INITIAL_A, 'an invalid preset is a typed failure'],
  ['P6 prototype names are only unknown fields', 'validate.js', "for (const key of Object.keys(value)) if (!contract.PRESET_KEYS.includes(key)) add(key, FORBIDDEN.has(key) ? 'FORBIDDEN_FIELD' : 'UNKNOWN_FIELD');",
    "for (const key of Object.keys(value)) if (!contract.PRESET_KEYS.includes(key)) add(key, 'UNKNOWN_FIELD');", 'tests/units.test.cjs', 'validatePresetShape'],
  ['E1 a refusal may claim to be accepted', 'envelope.js', "need(runCode || !value.accepted, 'REFUSAL_NOT_ACCEPTED');", '', 'tests/units.test.cjs', 'envelope validator rejects every forged answer'],
  ['E2 success needs no completed run', 'envelope.js', "need(value.outcome === 'succeeded' && state === 'completed' && value.accepted && steps.length > 0 && stopper === null && value.notRun.length === 0, 'SUCCESS_NEEDS_COMPLETED_RUN');", '', 'tests/units.test.cjs', 'envelope validator rejects every forged answer'],
  ['E3 the page ignores a dishonest HTTP status', 'verify.js', 'if (status !== expectedStatus(value))', 'if (false)', 'tests/units.test.cjs', 'page-side checks bind the HTTP status'],
  ['L1 the journal has no self-check', 'runlog.cjs', "if (h !== selfCheck(content)) return 'content check failed';", '', 'tests/journal.test.cjs', 'EXHAUSTIVE single-byte flips'],
  ['L2 a discarded tail is not reported', 'runlog.cjs', 'discardedTailBytes: state.tornTailBytes,', 'discardedTailBytes: 0,', 'tests/journal.test.cjs', 'EXHAUSTIVE single-byte flips'],
  ['L3 the hash chain is not checked', 'runlog.cjs', "if (record.prev !== previous) return 'broken hash chain';", '', 'tests/journal.test.cjs', 'what the journal cannot detect'],
  ['L4 Windows device names are accepted', 'runlog.cjs', '!WINDOWS_DEVICES.test(name) &&', '', 'tests/server.test.cjs', 'the data name is closed'],
  ['L5 trailing dots and spaces are accepted', 'runlog.cjs', "&& !/[. ]$/.test(name) ?", '&& true ?', 'tests/server.test.cjs', 'the data name is closed'],
  ['S1 maxConnections is removed', 'server.cjs', 'server.maxConnections = limits.connections;', '', 'tests/resources.test.cjs', 'connection cap'],
  ['S2 the socket is not destroyed after the refusal is flushed', 'server.cjs', "if (close) response.once('finish', () => request.socket.destroy());", '', 'tests/resources.test.cjs', 'get-body', { C043_KINDS: 'get-body' }, 'REFUSAL FLOOD'],
  ['S3 the pipeline depth is not limited', 'server.cjs', 'if (depth > limits.pipelineDepth) {', 'if (false) {', 'tests/resources.test.cjs', 'pipelines requests and never reads'],
  ['S4 a silent socket is never closed', 'server.cjs', 'const timer = setTimeout(() => socket.destroy(), limits.firstRequestMs);', 'const timer = setTimeout(() => {}, limits.firstRequestMs);', 'tests/resources.test.cjs', 'never sends a request'],
  ['S5 connectionsCheckingInterval is not set', 'server.cjs', ', connectionsCheckingInterval: limits.checkMs', '', 'tests/resources.test.cjs', 'trickles its headers'],
  ['S6 requestTimeout is not set', 'server.cjs', 'server.requestTimeout = limits.requestMs;', '', 'tests/resources.test.cjs', 'body that trickles'],
  ['S7 headersTimeout is not set', 'server.cjs', 'server.headersTimeout = limits.headersMs;', '', 'tests/resources.test.cjs', 'trickles its headers'],
  ['S8 keepAliveTimeout is not set', 'server.cjs', 'server.keepAliveTimeout = limits.keepAliveMs;', '', 'tests/resources.test.cjs', 'idle keep-alive'],
  ['S9 the header size is not limited', 'server.cjs', 'maxHeaderSize: limits.headerBytes', 'maxHeaderSize: 65536', 'tests/resources.test.cjs', 'headers beyond the size bound'],
  ['S10 the streamed body is not limited', 'server.cjs', 'if (size > limit) {', 'if (false) {', 'tests/resources.test.cjs', 'invalid-preset-400', { C043_KINDS: 'invalid-preset-400' }, 'REFUSAL FLOOD'],
  ['S11 a declared large body is read before it is refused', 'server.cjs', "if (Number(request.headers['content-length'] || 0) > contract.LIMITS.bodyBytes) return refuse('BODY_TOO_LARGE', { action: 'run' });", '', 'tests/server.test.cjs', 'every typed refusal'],
  ['S12 a refusal keeps the connection alive', 'server.cjs', 'const close = status < 200 || status >= 300 || !consumed;', 'const close = !consumed;', 'tests/server.test.cjs', 'every typed refusal'],
  ['S13 closeServer does not halt the runner', 'server.cjs', 'server.runner?.halt();', '', 'tests/units.test.cjs', 'server-produced transcript verifies'],
  ['S14 closeServer does not halt the step service', 'server.cjs', 'server.engine?.halt();', '', 'tests/server.test.cjs', 'closing the server stops the step service'],
];
// Documented equivalent mutant: removing the loop that destroys tracked sockets in closeServer changes nothing on Node 22,
// because server.closeAllConnections() already ends every connection; the loop is defense in depth and is not counted as a guard.

function runNode(args, env, timeoutMs) {
  return new Promise((resolve) => {
    const clean = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C043_MUTANT', 'C043_RED_SUBJECT', 'C043_KINDS', 'C043_FLOOD']) delete clean[key];
    const child = spawn(process.execPath, args, { cwd: root, env: { ...clean, ...env }, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: Buffer.concat(chunks).toString('utf8') }); });
  });
}

const failing = (output) => [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim());
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const focused = (file, pattern) => ['--test-reporter=tap', `--test-name-pattern=${escapeRegExp(pattern)}`, file];
const unique = [...new Map(MUTANTS.map(([, , , , file, expected, env, pattern]) => [`${file}|${pattern ?? expected}|${JSON.stringify(env ?? {})}`, [file, pattern ?? expected, env ?? {}]])).values()];

async function pool(items, size, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const index = next; next += 1; results[index] = await work(items[index], index); }
  }));
  return results;
}

test('MUTANTS: the focused tests pass on the unmutated code (controls)', { timeout: 600000 }, async () => {
  const outcomes = await pool(unique, 3, async ([file, pattern, env]) => ({ file, pattern, ...(await runNode(focused(file, pattern), env, 300000)) }));
  for (const outcome of outcomes) assert.equal(outcome.code, 0, `control failed for ${outcome.file} / ${outcome.pattern}: ${failing(outcome.output).join('; ')}`);
});

test('MUTANTS: every mutation matches exactly once and is killed by a test named for the guard it removes', { timeout: 1200000 }, async () => {
  const survivors = [];
  const report = await pool(MUTANTS, 3, async ([name, file, from, to, testFile, expected, env = {}, pattern = expected]) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) return { name, problem: `the mutation target occurs ${occurrences} times` };
    const mutant = JSON.stringify({ file, from, to });
    const outcome = await runNode(focused(testFile, pattern), { ...env, C043_MUTANT: mutant, C043_MUTANT_OPTIONAL: '1', NODE_OPTIONS: `--require=${preload}` }, 300000);
    const names = failing(outcome.output);
    // A mutant that hangs the suite (killed by the timeout, exit null) is still caught when the named test failed first.
    const killed = outcome.code !== 0 && names.some((item) => item.includes(expected));
    return { name, killed, code: outcome.code, names: names.slice(0, 3) };
  });
  for (const item of report) if (item.problem || !item.killed) survivors.push(`${item.name}: ${item.problem ?? `exit ${item.code}, failing: ${item.names.join(' | ') || 'none'}`}`);
  assert.deepEqual(survivors, [], `${MUTANTS.length - survivors.length} of ${MUTANTS.length} mutants were killed by a named test`);
});
