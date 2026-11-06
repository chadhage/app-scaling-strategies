'use strict';

// Test tooling, not production code: MUTATION check. Every guard line of the service, the page, the journey rules and every
// rule group of the checker is mutated away in a private copy (never in the repository) and a NAMED failing test is required.
// Usage: node tests\mutate.cjs --scratch <dir outside the repository> --out <report.json>   (the report is written with flag wx)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const scratch = argument('--scratch');
const out = argument('--out');
if (!scratch || !out || path.resolve(scratch).startsWith(repository)) throw new Error('--scratch must be a folder outside the repository and --out a new report file');

const SERVER = ['server', 'pipelining'];
const RES = ['resources', 'flood', 'pipelining'];
const mutants = [
  ['server', 'server.cjs', "|| request.headers.host !== host", '', SERVER, 'the Host check'],
  ['server', 'server.cjs', "if (request.headers.origin && request.headers.origin !== origin) return refuse('CROSS_ORIGIN_DENIED');", '', SERVER, 'the Origin check'],
  ['server', 'server.cjs', "request.url.length > 2048", 'false', SERVER, 'the URL length limit'],
  ['server', 'server.cjs', "|| url.hash) return refuse('INVALID_URL')", ") return refuse('INVALID_URL')", SERVER, 'the fragment refusal'],
  ['server', 'server.cjs', "if (url.search) { refuse('INVALID_QUERY'); return false; }", '', SERVER, 'the query refusal'],
  ['server', 'server.cjs', "if (method === 'GET' && hasBody) { refuse('UNEXPECTED_BODY'); return false; }", '', SERVER, 'the unexpected body on GET'],
  ['server', 'server.cjs', "if (request.method !== method) { refuse('METHOD_NOT_ALLOWED', {}, { Allow: method }); return false; }", '', SERVER, 'the method check'],
  ['server', 'server.cjs', "if (contract.KEY_PATTERN.test(value)) return true;", 'return true;', SERVER, 'the key format check'],
  ['server', 'server.cjs', "if (!JSON_TYPE.test(request.headers['content-type'] ?? '')) return refuse('UNSUPPORTED_MEDIA_TYPE', { action: 'submit' });", '', SERVER, 'the media type check'],
  ['server', 'server.cjs', "if (Number(request.headers['content-length'] || 0) > contract.LIMITS.bodyBytes) return refuse('BODY_TOO_LARGE', { action: 'submit' });", '', SERVER, 'the declared body size check'],
  ['server', 'server.cjs', "...(refusing ? { Connection: 'close' } : {})", '', SERVER, 'Connection: close after a refusal'],
  // The published list also held 'ONLY the socket destroy after the flush': with Node's own destroySoon after a Connection: close answer no suite can tell it apart; the generator lists it as an equivalent mutant with its reason.
  ['resources', 'server.cjs', "if (size > limit) {", 'if (false) {', RES, 'the streaming body limit'],
  ['resources', 'server.cjs', "if (lane.queue.length >= limits.pipelineDepth) {", 'if (false) {', RES, 'the pipeline depth limit'],
  ['resources', 'server.cjs', "server.maxConnections = limits.connections;", '', RES, 'the connection cap'],
  ['resources', 'server.cjs', "const timer = setTimeout(() => socket.destroy(), limits.firstRequestMs);", 'const timer = setTimeout(() => {}, limits.firstRequestMs);', RES, 'the first-request timeout'],
  ['resources', 'server.cjs', "http.createServer({ maxHeaderSize: limits.headerBytes, connectionsCheckingInterval: limits.checkMs, requireHostHeader: false }", 'http.createServer({ maxHeaderSize: limits.headerBytes, requireHostHeader: false }', RES, 'connectionsCheckingInterval (the effective timeout bound)'],
  ['resources', 'server.cjs', "for (const socket of sockets.get(server) ?? []) socket.destroy();", '', RES, 'closeServer destroying every tracked socket'],
  ['server', 'server.cjs', "|| RESERVED.test(dataName) || dataName.endsWith('.')", '', SERVER, 'the Windows device-name guard'],
  ['page', 'page.js', "    if (state.busy) return undefined;\n    clearErrors();", '    clearErrors();', ['tamper'], 'ignoring a submit while busy'],
  ['page', 'page.js', "    showResult(blank('pending', 'Result: working'));\n    $('result-heading').focus();", "    showResult(blank('pending', 'Result: working'));", ['tamper'], 'moving the focus to the result heading when a request starts'],
  ['page', 'page.js', "    showResult(view);\n    setBusy(false);", "    showResult(view);", ['tamper'], 'clearing aria-busy after the answer'],
  ['page', 'page.js', "    announce(view.announcement, 'result');\n  }", '  }', ['flow'], 'announcing the result'],
  ['page', 'page.js', "    $(FIELDS.find((field) => first.has(field))).focus();", '', ['page'], 'focusing the first invalid field'],
  ['page', 'page.js', "      $(field).setAttribute('aria-describedby', `${field}-help ${field}-error`);", '', ['page'], 'aria-describedby on an invalid field'],
  ['page', 'page.js', "    if (state.lessonId === lesson.id) return;", '', ['page'], 'choosing the same lesson again is not a change'],
  ['page', 'page.js', "    radio.setAttribute('tabindex', position === index ? '0' : '-1');", '', ['page'], 'the roving tabindex'],
  ['journey', 'journey.js', "if (body.recovery.reason !== (code ? contract.ERRORS[code].message : contract.STATE_REASONS[state])) return rejectAnswer('REASON_TAMPERED');", '', ['tamper'], 'the reason check (server prose)'],
  ['journey', 'journey.js', "if (JSON.stringify(body.recovery.allowed) !== JSON.stringify(actions)) return rejectAnswer('RECOVERY_TAMPERED');", '', ['tamper'], 'the offered-actions check'],
  ['journey', 'journey.js', "if ((Number.isInteger(status) && status >= 200 && status < 300) !== body.accepted) return rejectAnswer('STATUS_CONTRADICTS_ENVELOPE');", '', ['tamper'], 'the status-versus-envelope check'],
  ['journey', 'journey.js', "if (code && contract.ERRORS[code].outcome !== body.outcome) return rejectAnswer('OUTCOME_CONTRADICTS_CODE');", '', ['tamper'], 'the outcome-versus-code check'],
  ['journey', 'journey.js', "if (code && !body.accepted && status !== contract.ERRORS[code].status) return rejectAnswer('STATUS_CONTRADICTS_CODE');", '', ['tamper'], 'the status-versus-code check'],
  ...['documentRules', 'headingRules', 'landmarkRules', 'idRules', 'nameRules', 'tabRules', 'reachRules', 'liveRules', 'statusRules', 'errorRules', 'focusRules'].map((rule) => ['checker', 'a11y-check.js', 'for (const rule of RULES) rule(context);', `for (const rule of RULES) if (rule !== ${rule}) rule(context);`, ['checker', 'checker-reach'], `the checker rule group ${rule}`]),
  ['checker', 'a11y-check.js', "if (next === current && order.length > 1) {", 'if (false) {', ['checker'], 'the keyboard-trap detection'],
];

function listFiles(directory, filter) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? (filter(full) ? listFiles(full, filter) : []) : [full];
  });
}

function buildTree(target) {
  fs.rmSync(target, { recursive: true, force: true });
  const copy = (relative, filter = () => true) => {
    for (const file of fs.statSync(path.join(repository, relative)).isDirectory() ? listFiles(path.join(repository, relative), filter) : [path.join(repository, relative)]) {
      const destination = path.join(target, path.relative(repository, file));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(file, destination);
    }
  };
  copy('capability/C059', (directory) => !/[\\/](evidence|scratch|data)$/.test(directory));
  for (const name of ['contract.js', 'engine.cjs', 'input.cjs', 'journal.cjs', 'result.cjs']) copy(`capability/C042/${name}`);
  for (const name of ['accepted-catalog.js', 'host-policy.js', 'lesson-host.js', 'serve.cjs']) copy(`capability/C041/${name}`);
  for (const lesson of ['S001', 'S003']) copy(`learning/${lesson}`, (directory) => !/[\\/](evidence|tests|node_modules)$/.test(directory));
}

function runTests(tree, suites) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
    env.C059_MATRIX = 'quick';
    const files = suites.map((suite) => path.join('capability', 'C059', 'tests', `${suite}.test.cjs`));
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=90000', ...files], { cwd: tree, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 240000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, text: Buffer.concat(chunks).toString('utf8') }); });
  });
}

async function worker(name, queue, results) {
  const tree = path.join(scratch, name);
  buildTree(tree);
  while (queue.length) {
    const [group, file, from, to, suites, label] = queue.shift();
    const target = path.join(tree, 'capability', 'C059', file);
    const original = fs.readFileSync(target, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const find = from.replace(/\n/g, eol);
    const occurrences = original.split(find).length - 1;
    if (occurrences !== 1) { results.push({ group, file, label, error: `the mutated text occurs ${occurrences} times` }); continue; }
    fs.writeFileSync(target, original.replace(find, () => to.replace(/\n/g, eol)));
    let run = await runTests(tree, suites);
    // A test process that dies without naming a failing test (the machine is shared) is not a result: run again.
    for (let attempt = 0; attempt < 2 && run.code !== 0 && !/^\s*not ok \d+ - (?!capability[\\/])/m.test(run.text); attempt += 1) run = await runTests(tree, suites);
    fs.writeFileSync(target, original);
    const named = [...run.text.matchAll(/^\s*not ok \d+ - (?!capability[\\/])(.+)$/gm)].map((match) => match[1].trim());
    results.push({ group, file, label, from, to, suites, exitCode: run.code, killed: run.code !== 0 && named.length > 0, failingTests: [...new Set(named)].slice(0, 6), failingCount: new Set(named).size });
    console.log(`${run.code !== 0 && named.length > 0 ? 'KILLED  ' : 'SURVIVED'} ${file}: ${label} (${named.length} named failures)`);
  }
}

async function main() {
  const queue = [...mutants];
  const results = [];
  await Promise.all([worker('mut-a', queue, results), worker('mut-b', queue, results)]);
  results.sort((a, b) => `${a.file}${a.label}`.localeCompare(`${b.file}${b.label}`));
  const report = { schema: 'C059-mutation/1', total: mutants.length, killed: results.filter((item) => item.killed).length, survivors: results.filter((item) => !item.killed).map((item) => `${item.file}: ${item.label}`), results };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`${report.killed} of ${report.total} mutants killed by a named failing test`);
  fs.rmSync(path.join(scratch, 'mut-a'), { recursive: true, force: true });
  fs.rmSync(path.join(scratch, 'mut-b'), { recursive: true, force: true });
  if (report.killed !== report.total) process.exitCode = 1;
}

main();
