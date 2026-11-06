'use strict';

// Test tooling, not production code: the U040 mutation run. It copies the production files and the U040 suites into a scratch folder
// OUTSIDE the repository, applies ONE mutant to the copy of server.cjs at a time (each guard line of the fix), runs the U040 suites
// and records which named tests failed. A mutant is killed when at least one test fails; the unmutated control must pass.
// Usage: node capability\C026\tests\u040-mutants.cjs <empty-scratch-dir> <out.json> [mutant-id ...]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const PRODUCTION = ['server.cjs', 'framing.cjs', 'stream.cjs', 'conversation.cjs', 'page.js', 'index.html', 'styles.css'];
const SUITES = ['u040-pipelining.test.cjs', 'u040-node-own.test.cjs'];
const HELPERS = ['u040-support.cjs', 'u040-fixtures.cjs', 'u040-child.cjs', 'support.cjs'];
const IMPORTS = ['contract-guard.js', 'approved-contract.js'];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const MARK = '\n      closing.add(request.socket);\n';
const MUTANTS = Object.freeze([
  { id: 'M01', name: 'the mark inside fail() is removed', from: MARK, to: '\n' },
  { id: 'M02', name: 'the mark uses response.socket instead of request.socket', from: MARK, to: '\n      closing.add(response.socket);\n' },
  { id: 'M03', name: 'the check at the top of the request handler is removed', from: '    if (closing.has(request.socket)) return;\n', to: '' },
  { id: 'M04', name: 'the check in the upgrade listener is removed', from: '    if (closing.has(socket)) return;\n', to: '' },
  { id: 'M05', name: 'the upgrade listener destroys the socket instead of dropping the upgrade', from: 'if (closing.has(socket)) return;', to: 'if (closing.has(socket)) { socket.destroy(); return; }' },
  { id: 'M06', name: 'the request handler destroys the socket instead of dropping the request', from: 'if (closing.has(request.socket)) return;', to: 'if (closing.has(request.socket)) { request.socket.destroy(); return; }' },
  { id: 'M07', name: 'the checkContinue listener is removed', from: "  server.on('checkContinue', (request, response) => handle(request, response));\n", to: '' },
  { id: 'M08', name: 'the checkExpectation listener is removed', from: "  server.on('checkExpectation', (request, response) => handle(request, response, true));\n", to: '' },
  { id: 'M09', name: 'the clientError listener is removed', from: "  server.on('clientError', (error, socket) => {\n    // A socket that is gone, or that already carried an answer, gets none: a second answer would corrupt the first.\n    if (!socket.writable || socket.bytesWritten > 0) { socket.destroy(); return; }\n    refuseSocket(socket, ...(CLIENT_ERRORS.get(error.code) ?? MALFORMED_REQUEST));\n  });\n", to: '' },
  { id: 'M10', name: 'requireHostHeader: false is removed (Node answers a request without Host itself)', from: 'http.createServer({ requireHostHeader: false }, ', to: 'http.createServer(' },
  { id: 'M11', name: 'the transcript route no longer marks its connection at dispatch', from: '\n        closing.add(request.socket);\n        transcript()', to: '\n        transcript()' },
  { id: 'M12', name: 'the successful transcript answer no longer closes the connection', from: "send(200, value, undefined, { Connection: 'close' })", to: 'send(200, value)' },
  { id: 'M13', name: 'the unknown Expect refusal (417) is removed from the handler', from: "      if (expectationFailed) return fail(417, 'EXPECTATION_FAILED', 'This fixture supports no Expect header.');\n", to: '' },
  { id: 'M14', name: 'clientError no longer checks that the socket is writable', from: 'if (!socket.writable || socket.bytesWritten > 0) {', to: 'if (socket.bytesWritten > 0) {' },
  { id: 'M15', name: 'clientError no longer checks that the socket was already answered', from: 'if (!socket.writable || socket.bytesWritten > 0) {', to: 'if (!socket.writable) {' },
  { id: 'M16', name: 'the 431 mapping of a header overflow is removed', from: "  ['HPE_HEADER_OVERFLOW', [431, 'HEADERS_TOO_LARGE', 'The request head is larger than this fixture accepts.']],\n", to: '' },
  { id: 'M17', name: 'the 408 mapping of a request timeout is removed', from: "accepts.']],\n  ['ERR_HTTP_REQUEST_TIMEOUT', [408, 'REQUEST_TIMEOUT', 'The request was not completed in time.']]\n]);", to: "accepts.']]\n]);" },
  { id: 'M18', name: 'the default parse-error refusal is a 500', from: "Object.freeze([400, 'MALFORMED_REQUEST',", to: "Object.freeze([500, 'MALFORMED_REQUEST'," },
  { id: 'M19', name: 'a refusal no longer says Connection: close', from: "undefined, { Connection: 'close', ...extra });", to: 'undefined, { ...extra });' },
  { id: 'M20', name: 'the parse-error answer destroys the socket at once instead of after the flush', from: '  socket.destroySoon();\n}', to: '  socket.destroy();\n}' },
  { id: 'M21', name: 'one module-wide closing flag instead of a per-connection mark (run on the two-instance tests only: it makes every later exchange wait for its bound)', only: 'two live instances', from: 'const closing = new WeakSet();', to: 'let flagged = false;\nconst closing = { add() { flagged = true; }, has() { return flagged; } };' }
]);

function applyMutant(source, mutant) {
  const count = source.split(mutant.from).length - 1;
  if (count !== 1) throw new Error(`${mutant.id}: the fragment matches ${count} times, expected exactly one`);
  return source.replace(mutant.from, () => mutant.to);
}

function stage(directory, serverSource) {
  const namespace = path.join(directory, 'capability', 'C026');
  fs.mkdirSync(path.join(namespace, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'capability', 'C001'), { recursive: true });
  for (const name of PRODUCTION) fs.copyFileSync(path.join(root, name), path.join(namespace, name));
  for (const name of [...SUITES, ...HELPERS]) fs.copyFileSync(path.join(__dirname, name), path.join(namespace, 'tests', name));
  for (const name of IMPORTS) fs.copyFileSync(path.join(repository, 'capability', 'C001', name), path.join(directory, 'capability', 'C001', name));
  if (serverSource !== null) fs.writeFileSync(path.join(namespace, 'server.cjs'), serverSource.replace(/\n/g, '\r\n'));
}

function runSuites(directory, only = null) {
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  const files = SUITES.map((name) => path.join('capability', 'C026', 'tests', name));
  const started = Date.now();
  const filter = only === null ? [] : [`--test-name-pattern=${only}`];
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...filter, ...files], {
    cwd: directory, env, encoding: 'utf8', windowsHide: true, timeout: 420000, maxBuffer: 64 * 1024 * 1024
  });
  const text = (run.stdout ?? '').replace(/\r\n/g, '\n');
  const number = (key) => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1] ?? NaN);
  return {
    exit: run.status, timedOut: Boolean(run.error && run.error.code === 'ETIMEDOUT'), elapsedMs: Date.now() - started,
    tests: number('tests'), pass: number('pass'), fail: number('fail'),
    failedTests: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
    assertionErrors: (text.match(/name: 'AssertionError'/g) ?? []).length,
    otherErrors: (text.match(/name: '(?:TypeError|ReferenceError|SyntaxError|RangeError)'/g) ?? []).length
  };
}

function main(argv) {
  const [scratch, out, ...wanted] = argv;
  if (!scratch || !out) throw new Error('usage: node u040-mutants.cjs <empty-scratch-dir> <out.json> [mutant-id ...]');
  if (fs.existsSync(scratch) && fs.readdirSync(scratch).length > 0) throw new Error('the scratch directory must be empty');
  const original = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const selected = wanted.length > 0 ? MUTANTS.filter((mutant) => wanted.includes(mutant.id)) : MUTANTS;
  const results = [];
  const control = path.join(scratch, 'control');
  stage(control, null);
  results.push({ id: 'control', name: 'unmutated copy', ...runSuites(control) });
  for (const mutant of selected) {
    const directory = path.join(scratch, mutant.id);
    stage(directory, applyMutant(original, mutant));
    const outcome = runSuites(directory, mutant.only ?? null);
    results.push({ id: mutant.id, name: mutant.name, ...(mutant.only ? { only: mutant.only } : {}), from: mutant.from, to: mutant.to, killed: outcome.fail > 0 || outcome.exit !== 0, ...outcome });
    fs.rmSync(directory, { recursive: true, force: true });
  }
  fs.rmSync(control, { recursive: true, force: true });
  const mutants = results.filter((entry) => entry.id !== 'control');
  const report = {
    schemaVersion: 1, tool: 'capability/C026/tests/u040-mutants.cjs', nodeRuntime: process.version,
    serverSha256: sha(fs.readFileSync(path.join(root, 'server.cjs'))), controlPassed: results[0].exit === 0 && results[0].fail === 0,
    killed: mutants.filter((entry) => entry.killed).length, survived: mutants.filter((entry) => !entry.killed).map((entry) => entry.id), total: mutants.length, results
  };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`U040 mutants: ${report.killed} of ${report.total} killed, survivors ${JSON.stringify(report.survived)}, control passed ${report.controlPassed}`);
  if (!report.controlPassed || report.survived.length > 0) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));
module.exports = Object.freeze({ MUTANTS, applyMutant });
