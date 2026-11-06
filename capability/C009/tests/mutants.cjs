'use strict';

// Test tooling, not production code: mutation check of the refusal path (review F1b and its siblings). Every mutant is ONE change to
// ONE production line, applied to a SCRATCH COPY of the namespace; the named test files must fail on it (exit code 1 and at least one
// named failing test). Every guard line of the refusal path is here: the mark, the Connection: close header, the read stop and its
// fail-closed branch, the lanes (serialization, drop after a mark, depth, release on finish and on close), the check at the top of the
// handler and before the commit, the listeners for what Node answers itself, the per-subject audit ring.
// Usage: node capability\C009\tests\mutants.cjs <scratch directory outside the repository> [mutant id ...]   (one mutant at a time)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repository = path.resolve(__dirname, '..', '..', '..');
const [scratch, ...wanted] = process.argv.slice(2);
if (!scratch || !path.isAbsolute(scratch) || path.resolve(scratch).startsWith(repository)) throw new Error('Usage: node mutants.cjs <absolute scratch directory outside the repository> [ids]');

const PIPE = ['pipeline-refusal', 'refusal-close'];
const MUTANTS = [
  ['M01-no-Connection-close', 'http-io.cjs', "...(refusal && { Connection: 'close' }), ", '', PIPE],
  ['M02-refusal-does-not-mark-the-socket', 'http-io.cjs', 'if (refusal) markFinished(socket);', '', ['pipeline-refusal']],
  ['M03-refusal-does-not-stop-reading', 'http-io.cjs', 'if (refusal) stopReading(socket);', '', ['refusal-flood']],
  ['M04-socket-from-response-not-request', 'http-io.cjs', 'const socket = response.req.socket;', 'const socket = response.socket;', ['lanes', 'pipeline-refusal']],
  ['M05-only-5xx-is-final', 'http-io.cjs', 'const refusal = status >= 400;', 'const refusal = status >= 500;', PIPE],
  ['M06-readStop-never-called', 'http-io.cjs', 'if (canStopReading(socket)) socket._handle.readStop(); else socket.destroy();', 'if (canStopReading(socket)) { /* off */ } else socket.destroy();', ['refusal-flood', 'lanes']],
  ['M07-unstoppable-socket-is-kept', 'http-io.cjs', 'else socket.destroy();\n}\n\nfunction endConnection', ';\n}\n\nfunction endConnection', ['lanes']],
  ['M08-canStopReading-always-true', 'http-io.cjs', "typeof owner?._handle?.readStop === 'function'", 'true', ['lanes', 'read-stop']],
  ['M09-lane-keeps-requests-behind-a-mark', 'http-io.cjs', 'if (socket.destroyed || finished.has(socket)) {\n      lane.waiting.length = 0;', 'if (socket.destroyed) {\n      lane.waiting.length = 0;', ['pipeline-refusal', 'lanes']],
  ['M10-admit-ignores-a-mark', 'http-io.cjs', 'function admit(request, response, task) {\n    const { socket } = request;\n    if (socket.destroyed || finished.has(socket)) return;', 'function admit(request, response, task) {\n    const { socket } = request;\n    if (socket.destroyed) return;', ['lanes'], 'EQUIVALENT: a redundant early return. pump() drops a request on a marked socket before any effect and before any listener is attached, so no test can tell; it is kept as the top-of-handler check the design note asks for'],
  ['M11-lane-never-busy', 'http-io.cjs', 'lane.busy = true;', 'lane.busy = false;', ['lanes', 'pipeline-refusal']],
  ['M12-no-depth-bound', 'http-io.cjs', 'if (lane.waiting.length + (lane.busy ? 1 : 0) >= depth) {', 'if (false) {', ['lanes', 'connections']],
  ['M13-no-release-on-close', 'http-io.cjs', "response.once('close', release);", '', ['lanes']],
  ['M14-no-release-on-finish', 'http-io.cjs', "response.once('finish', release);", '', ['lanes']],
  ['M15-release-twice', 'http-io.cjs', 'if (released) return;', '', ['lanes']],
  ['M16-refuse-never-answers-at-once', 'http-io.cjs', 'if (stalled || (!lane.busy && lane.waiting.length === 0)) {', 'if (!lane.busy && lane.waiting.length === 0) {', ['lanes', 'timeouts']],
  ['M17-refuse-ignores-a-mark', 'http-io.cjs', 'admit.refuse = (socket, code) => {\n    if (socket.destroyed || finished.has(socket)) return;', 'admit.refuse = (socket, code) => {\n    if (socket.destroyed) return;', ['lanes']],
  ['M18-refused-socket-not-destroyed-after-flush', 'http-io.cjs', "socket.once('finish', () => socket.destroy());", '', ['lanes', 'node-own']],
  ['M19-header-overflow-is-malformed', 'http-io.cjs', "HPE_HEADER_OVERFLOW: 'HEADERS_TOO_LARGE'", "HPE_HEADER_OVERFLOW: 'REQUEST_MALFORMED'", ['lanes', 'refusal-close']],
  ['M20-continue-for-everyone', 'http-io.cjs', 'if (wantsContinue(response.req)) response.writeContinue();', 'response.writeContinue();', ['node-own', 'lanes']],
  ['M21-continue-for-http-1-0', 'http-io.cjs', "request.httpVersion === '1.1' && ", '', ['node-own', 'lanes']],
  ['S01-no-checkContinue-listener', 'server.cjs', "server.on('checkContinue', (request, response) => admit(request, response, route));", '', ['node-own']],
  ['S02-no-checkExpectation-listener', 'server.cjs', "server.on('checkExpectation',", "server.on('nothing',", PIPE],
  ['S03-no-clientError-listener', 'server.cjs', "server.on('clientError',", "server.on('nothing',", PIPE],
  ['S04-no-connect-listener', 'server.cjs', "server.on('connect',", "server.on('nothing',", ['node-own']],
  ['S05-node-answers-a-missing-Host-itself', 'server.cjs', 'checkMs, requireHostHeader: false }', 'checkMs }', ['node-own']],
  ['M22-a-stalled-request-waits-behind-itself', 'http-io.cjs', 'const stalled = lane.waiting.length === 0 && lane.current?.complete === false;', 'const stalled = false;', ['lanes', 'node-own', 'timeouts']],
  ['M23-a-queued-request-that-failed-to-parse-still-runs', 'http-io.cjs', 'if (lane.waiting.at(-1)?.request?.complete === false) lane.waiting.pop();', '', ['lanes']],
  ['S07-no-depth-bound-in-the-server', 'server.cjs', 'createLanes({ depth: pipelined })', 'createLanes({ depth: 100000 })', ['connections']],
  ['S08-no-fail-closed-on-the-first-connection', 'server.cjs', 'if (broken === null && !canStopReading(socket)) failClosed();', '', ['read-stop']],
  ['S09-a-broken-app-still-serves', 'server.cjs', 'if (broken !== null) {\n      socket.destroy();', 'if (false) {\n      socket.destroy();', ['read-stop']],
  ['S10-no-startup-self-check', 'server.cjs', 'if (canStopReading(server)) return;', 'return;', ['read-stop']],
  ['S11-checking-interval-default', 'server.cjs', '{ connectionsCheckingInterval: checkMs, ', '{ ', ['timeouts']],
  ['S12-request-timeout-removed', 'server.cjs', 'server.requestTimeout = headerMs;', '', ['timeouts']],
  ['C01-no-check-after-the-body-await', 'commands.cjs', 'if (isFinished(request.socket)) return undefined;\n    if (body.tooLarge)', 'if (body.tooLarge)', ['guards']],
  ['C02-no-check-before-the-commit', 'commands.cjs', 'if (isFinished(request.socket)) return undefined;\n        const actor', 'const actor', ['guards']],
  ['C03-body-invited-before-the-checks', 'commands.cjs', 'out.proceed();', '', ['node-own']],
  ['L01-shared-audit-ring', 'ledger.cjs', 'rings.set(stored.subject, [...(rings.get(stored.subject) || []), stored]', "rings.set('shared', [...(rings.get('shared') || []), stored]", ['audit-ring']],
  ['L02-no-owner-quota', 'ledger.cjs', "if (ownedBy(draft, context.actor.subject) > ownerLimit) throw new CommandError(409, 'OWNER_QUOTA_FULL');", '', ['quota']],
  ['L03-anonymous-ring-merged', 'ledger.cjs', 'if (stored.subject === null) anonymous', 'if (false) anonymous', ['quota']]
];

function copyBase(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'capability'), { recursive: true });
  for (const name of ['C009', 'C001']) {
    fs.cpSync(path.join(repository, 'capability', name), path.join(dir, 'capability', name), { recursive: true, filter: (source) => !/[\\/]evidence([\\/]|$)/.test(source) });
  }
  fs.mkdirSync(path.join(dir, '.docs', 'wiki'), { recursive: true });
  fs.copyFileSync(path.join(repository, '.docs', 'wiki', 'flow-state.json'), path.join(dir, '.docs', 'wiki', 'flow-state.json'));
}

function mutate([id, file, find, replace]) {
  const dir = path.join(scratch, id);
  copyBase(dir);
  const target = path.join(dir, 'capability', 'C009', file);
  const text = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  const count = text.split(find).length - 1;
  if (count !== 1) throw new Error(`${id}: the pattern was found ${count} times in ${file}`);
  fs.writeFileSync(target, text.replace(find, () => replace));
  return dir;
}

// The matrix and table files hold hundreds of cells and a failing cell costs a settle time, so a mutant runs the cells below (a synchronous
// refusal behind a GET, an asynchronous one first on its connection, the three Node-own ones) and every test of the small files.
const MATRIX = new Set(['pipeline-refusal', 'pipeline-process']);
const ROWS = 'ROLE_FORBIDDEN|BODY_INVALID_JSON|EXPECTATION_FAILED|REQUEST_MALFORMED|HEADERS_TOO_LARGE';
const CELLS = `^(${ROWS}) \\[(G R M7|R M7)\\] HTTP/1\\.1`;
const TABLE = `^(${ROWS}) \\([0-9]+\\) ends`;

function runOnce(dir, names, { pattern, cells } = {}) {
  return new Promise((resolve) => {
    const tests = names.map((name) => path.join('capability', 'C009', 'tests', `${name}.test.cjs`));
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C009_SUBJECT_DIR', 'C009_MATRIX_ONLY']) delete env[key];
    if (cells) env.C009_MATRIX_ONLY = cells;
    const filter = pattern ? [`--test-name-pattern=${pattern}`] : [];
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000', ...filter, ...tests], { cwd: dir, env, windowsHide: true });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', () => {});
    const hard = setTimeout(() => child.kill('SIGKILL'), 400000);
    child.on('close', (code) => {
      clearTimeout(hard);
      const named = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1]).filter((name) => !/\.test\.cjs$/.test(name));
      resolve({ code, named });
    });
  });
}

async function run(dir, names) {
  const groups = [
    [names.filter((name) => !MATRIX.has(name) && name !== 'refusal-close'), {}],
    [names.filter((name) => name === 'refusal-close'), { pattern: TABLE }],
    [names.filter((name) => MATRIX.has(name)), { cells: CELLS }]
  ].filter(([files]) => files.length > 0);
  const results = [];
  for (const [files, options] of groups) results.push(await runOnce(dir, files, options));
  return { code: results.some((result) => result.code !== 0) ? 1 : 0, named: results.flatMap((result) => result.named) };
}

(async () => {
  fs.mkdirSync(scratch, { recursive: true });
  const chosen = wanted.length ? MUTANTS.filter(([id]) => wanted.includes(id)) : MUTANTS;
  const results = [];
  for (const mutant of chosen) {
    const dir = mutate(mutant);
    const { code, named } = await run(dir, mutant[4]);
    fs.rmSync(dir, { recursive: true, force: true });
    const killed = code !== 0 && named.length > 0;
    const equivalent = !killed && typeof mutant[5] === 'string';
    results.push({ id: mutant[0], killed, equivalent, failing: named.slice(0, 2).map((name) => name.slice(0, 110)) });
    console.log(`${killed ? 'KILLED  ' : equivalent ? 'EQUIVALENT' : 'SURVIVED'} ${mutant[0]} by ${named.length} test(s), first: ${JSON.stringify(named.slice(0, 1)).slice(0, 150)}${equivalent ? ` (${mutant[5]})` : ''}`);
  }
  const survived = results.filter((result) => !result.killed && !result.equivalent);
  const equivalent = results.filter((result) => result.equivalent);
  console.log(JSON.stringify({ mutants: results.length, killed: results.filter((result) => result.killed).length, equivalent: equivalent.map((result) => result.id), survived: survived.map((result) => result.id) }));
  process.exitCode = survived.length === 0 ? 0 : 1;
})();
