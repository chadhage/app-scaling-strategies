'use strict';

// Test tooling, not production code (U040 fix 2): the systematic mutation run over EVERY line of server.cjs that this fix changes.
// It diffs server.cjs against the byte-exact copy of the bytes that fix 2 replaced (evidence\u040-2\superseded\server.cjs.txt), takes every
// added or changed line, generates mutants for each of them (the named mutants first, then every statement deletion, every single
// condition, comparison, arithmetic, boolean, literal and call swap the line offers), stages a scratch tree OUTSIDE the repository
// per worker, applies ONE mutant at a time to that tree's server.cjs, runs the fix-2 suites there, and records which named tests failed.
// A mutant is killed when a test fails; a run that hits its hard bound is UNDECIDED, never killed; a mutant that does not parse is skipped
// and counted apart. The unmutated control must pass. Survivors are listed, and EQUIVALENT names the ones that no test can tell apart.
// Usage: node capability\C026\tests\u040-mutants-2.cjs <empty-scratch-dir> <out.json> [workers 1..2] [only-id,...]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const BASE = path.join(root, 'evidence', 'u040-2', 'superseded', 'server.cjs.txt');
const PRODUCTION = ['server.cjs', 'framing.cjs', 'stream.cjs', 'conversation.cjs', 'page.js', 'index.html', 'styles.css'];
const SUITES = ['u040-expect.test.cjs', 'u040-budget.test.cjs', 'u040-flood.test.cjs'];
const HELPERS = ['u040-support.cjs', 'u040-target.cjs', 'u040-flood-child.cjs', 'u040-flood-support.cjs', 'support.cjs'];
const IMPORTS = ['contract-guard.js', 'approved-contract.js'];
const HARD_BOUND_MS = 600000;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// The named mutants that the order of fix 2 asks for (each must fail a named test), then the generator's.
const NAMED = Object.freeze([
  { id: 'N01', name: 'the drop counter is removed: a request behind a mark is dropped quietly for ever (fix 1)', from: '      dropRequest(request.socket);\n      return;', to: '      return;' },
  { id: 'N02', name: 'the drop budget is raised past the probe (16 to 100000)', from: 'const MAX_DROPPED_REQUESTS = 16;', to: 'const MAX_DROPPED_REQUESTS = 100000;' },
  { id: 'N03', name: 'the Expect mark is removed: an answer that Node forces to close does not mark the connection (m1)', from: '      if (!response.shouldKeepAlive) closing.add(request.socket);\n', to: '' },
  { id: 'N04', name: 'the over-budget request announces the limit but does not destroy the connection', from: '    socket.destroy();\n  }\n  // The one request path.', to: '  }\n  // The one request path.' },
  { id: 'N05', name: 'the over-budget request destroys the connection but does not announce the limit', from: "    server.emit('limit', { code: 'DROPPED_REQUEST_BACKLOG', limit: MAX_DROPPED_REQUESTS });\n", to: '' },
  { id: 'N06', name: 'one budget for the whole server instead of one per connection', from: 'const dropped = new WeakMap();', to: 'let total = 0;\nconst dropped = { get: () => total, set: (socket, count) => { total = count; } };' },
  { id: 'N07', name: 'an already destroyed connection is announced again by every later request of the same read', from: '    if (socket.destroyed) return;\n', to: '' },
  { id: 'N08', name: 'the Expect mark uses response.socket instead of request.socket', from: '      if (!response.shouldKeepAlive) closing.add(request.socket);', to: '      if (!response.shouldKeepAlive) closing.add(response.socket);' }
]);
// Survivors that no test can tell apart from the original, each with its reason (filled in from the survivors of a run).
const EQUIVALENT = Object.freeze({});

function lcsAdded(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const added = [];
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && oldLines[i] === newLines[j]) { i += 1; j += 1; } else if (i < n && table[i + 1][j] >= table[i][j + 1]) i += 1; else { added.push(j); j += 1; }
  }
  return added;
}

const swaps = [
  ['<=', ['<', '>', '>=']], ['>=', ['>', '<']], ['===', ['!==']], ['!==', ['===']], ['&&', ['||']], ['||', ['&&']],
  ['.destroy()', ['.end()', '.pause()']], ['.add(', ['.delete(']], ['.set(', ['.get(']], ['.has(', ['.delete(']], ['.emit(', ['.listenerCount(']]
];

function mutantsOfLine(text) {
  const found = [];
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.startsWith('//')) return found;
  if (/^(?:if \(.+\) )?return;$/.test(trimmed) || /^(?:[A-Za-z_.]+)\([^()]*\);$/.test(trimmed) || /^[A-Za-z_.]+\.(?:add|set|destroy|emit)\(.*\);$/.test(trimmed)) found.push({ kind: 'delete the statement', to: text.replace(/\S.*$/, '') });
  const condition = /^(\s*)if \((.+)\)( |$)/.exec(text);
  if (condition !== null) {
    found.push({ kind: 'condition true', to: text.replace(`if (${condition[2]})`, 'if (true)') });
    found.push({ kind: 'condition false', to: text.replace(`if (${condition[2]})`, 'if (false)') });
    found.push({ kind: 'condition negated', to: text.replace(`if (${condition[2]})`, `if (!(${condition[2]}))`) });
  }
  for (const [from, list] of swaps) {
    let at = text.indexOf(from);
    while (at !== -1) {
      for (const to of list) found.push({ kind: `${from} to ${to}`, to: text.slice(0, at) + to + text.slice(at + from.length) });
      at = text.indexOf(from, at + from.length);
    }
  }
  for (const match of text.matchAll(/(?<![\w'"`.])(\d+)(?![\w'"`])/g)) {
    const value = Number(match[1]);
    for (const next of new Set([value + 1, Math.max(0, value - 1), 0])) if (next !== value) found.push({ kind: `number ${value} to ${next}`, to: text.slice(0, match.index) + next + text.slice(match.index + match[1].length) });
  }
  for (const match of text.matchAll(/\b(true|false)\b/g)) found.push({ kind: `${match[1]} flipped`, to: text.slice(0, match.index) + (match[1] === 'true' ? 'false' : 'true') + text.slice(match.index + match[1].length) });
  for (const match of text.matchAll(/'([A-Z_]{4,})'/g)) found.push({ kind: `string ${match[1]} changed`, to: text.slice(0, match.index) + `'${match[1]}_X'` + text.slice(match.index + match[0].length) });
  for (const match of text.matchAll(/(\?\? )(\d+)/g)) found.push({ kind: 'default of ?? changed', to: text.slice(0, match.index) + `?? ${Number(match[2]) + 1}` + text.slice(match.index + match[0].length) });
  for (const match of text.matchAll(/!(?=[A-Za-z(])/g)) found.push({ kind: 'negation removed', to: text.slice(0, match.index) + text.slice(match.index + 1) });
  return found;
}

function generate(source, baseSource) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(eol);
  const added = lcsAdded(baseSource.split(eol), lines);
  const mutants = [];
  const seen = new Set();
  for (const index of added) {
    for (const found of mutantsOfLine(lines[index])) {
      const copy = [...lines];
      copy[index] = found.to;
      const text = copy.join(eol);
      if (seen.has(text) || text === source) continue;
      seen.add(text);
      mutants.push({ line: index + 1, kind: found.kind, original: lines[index].trim(), mutated: found.to.trim(), text });
    }
  }
  return { added: added.map((index) => index + 1), mutants };
}

function applyNamed(source, mutant) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lf = (text) => text.replace(/\r\n/g, '\n');
  const normalized = lf(source);
  const count = normalized.split(mutant.from).length - 1;
  if (count !== 1) throw new Error(`${mutant.id}: the fragment matches ${count} times, expected exactly one`);
  return normalized.replace(mutant.from, () => mutant.to).replace(/\n/g, eol);
}

function stage(directory) {
  const namespace = path.join(directory, 'capability', 'C026');
  fs.mkdirSync(path.join(namespace, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'capability', 'C001'), { recursive: true });
  for (const name of PRODUCTION) fs.copyFileSync(path.join(root, name), path.join(namespace, name));
  for (const name of [...SUITES, ...HELPERS]) fs.copyFileSync(path.join(__dirname, name), path.join(namespace, 'tests', name));
  for (const name of IMPORTS) fs.copyFileSync(path.join(repository, 'capability', 'C001', name), path.join(directory, 'capability', 'C001', name));
}

function runSuite(directory, suite) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'U040_SERVER_MODULE']) delete env[name];
    const out = [];
    let timedOut = false;
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', path.join('capability', 'C026', 'tests', suite)], { cwd: directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, HARD_BOUND_MS);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', () => {});
    child.on('close', (exit) => {
      clearTimeout(timer);
      const text = Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n');
      resolve({ exit, timedOut, tests: Number(/^# tests (\d+)$/m.exec(text)?.[1] ?? Number.NaN), failed: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()) });
    });
  });
}

// A mutant is killed by the first suite that has a failing test; the later suites are skipped (a survivor runs all of them).
async function runMutant(directory, sourceText) {
  fs.writeFileSync(path.join(directory, 'capability', 'C026', 'server.cjs'), sourceText);
  const parse = spawnSync(process.execPath, ['--check', path.join(directory, 'capability', 'C026', 'server.cjs')], { encoding: 'utf8', windowsHide: true });
  if (parse.status !== 0) return { outcome: 'invalid', failedTests: [] };
  let counted = 0;
  for (const suite of SUITES) {
    const result = await runSuite(directory, suite);
    if (result.timedOut) return { outcome: 'undecided', failedTests: [], suite };
    counted += Number.isNaN(result.tests) ? 0 : result.tests;
    if (result.exit !== 0 || result.failed.length > 0) return { outcome: result.failed.length > 0 ? 'killed' : 'undecided', failedTests: result.failed, suite };
  }
  return { outcome: 'survived', failedTests: [], tests: counted };
}

async function main() {
  const [scratchArgument, outArgument, workersArgument, onlyArgument] = process.argv.slice(2);
  if (scratchArgument === undefined || outArgument === undefined) throw new Error('usage: node u040-mutants-2.cjs <empty-scratch-dir> <out.json> [workers 1..2] [only-id,...]');
  const scratch = path.resolve(scratchArgument);
  const relative = path.relative(repository, scratch);
  if (!(relative.startsWith('..') || path.isAbsolute(relative))) throw new Error('the scratch folder must be outside the repository');
  if (fs.existsSync(scratch) && fs.readdirSync(scratch).length > 0) throw new Error('the scratch folder must be empty');
  const workers = Math.min(2, Math.max(1, Number(workersArgument ?? 2)));
  const only = onlyArgument ? new Set(onlyArgument.split(',')) : null;
  const live = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  const base = fs.readFileSync(BASE, 'utf8');
  const { added, mutants: generated } = generate(live, base);
  const named = NAMED.map((mutant) => ({ id: mutant.id, line: null, kind: `named: ${mutant.name}`, original: '', mutated: '', text: applyNamed(live, mutant) }));
  const all = [...named, ...generated.map((mutant, index) => ({ ...mutant, id: `G${String(index + 1).padStart(3, '0')}` }))].filter((mutant) => only === null || only.has(mutant.id));
  console.log(`U040 mutants 2: server.cjs ${sha(Buffer.from(live))}, ${added.length} changed lines against the superseded bytes, ${named.length} named and ${generated.length} generated mutants, ${workers} worker(s)`);
  const trees = Array.from({ length: workers }, (_, index) => path.join(scratch, `w${index + 1}`));
  for (const tree of trees) stage(tree);
  const control = await runMutant(trees[0], live);
  console.log(`control: ${control.outcome}`);
  const results = [{ id: 'control', outcome: control.outcome, killed: false, failedTests: control.failedTests }];
  let next = 0;
  async function worker(tree) {
    for (;;) {
      const mutant = all[next];
      next += 1;
      if (mutant === undefined) return;
      const result = await runMutant(tree, mutant.text);
      const entry = { id: mutant.id, line: mutant.line, kind: mutant.kind, original: mutant.original, mutated: mutant.mutated, outcome: result.outcome, killed: result.outcome === 'killed', failedTests: result.failedTests.slice(0, 6) };
      results.push(entry);
      console.log(`${mutant.id} line ${mutant.line ?? '-'} ${mutant.kind}: ${result.outcome}${result.failedTests.length > 0 ? ` (${result.failedTests.length} failing, e.g. ${result.failedTests[0].slice(0, 90)})` : ''}`);
    }
  }
  if (control.outcome === 'survived') await Promise.all(trees.map(worker));
  const counted = results.filter((entry) => entry.id !== 'control');
  const survivors = counted.filter((entry) => entry.outcome === 'survived');
  const hashes = Object.fromEntries([['u040-mutants-2.cjs', __filename], ...[...SUITES, ...HELPERS].map((name) => [name, path.join(__dirname, name)])]
    .map(([name, file]) => [name, sha(fs.readFileSync(file))]));
  const report = {
    schemaVersion: 1, serverSha256: sha(Buffer.from(live)), baseSha256: sha(Buffer.from(base)), testInputs: hashes, changedLines: added, controlPassed: control.outcome === 'survived',
    total: counted.length, killed: counted.filter((entry) => entry.killed).length, invalid: counted.filter((entry) => entry.outcome === 'invalid').length,
    undecided: counted.filter((entry) => entry.outcome === 'undecided').map((entry) => entry.id),
    survived: survivors.map((entry) => entry.id), equivalent: survivors.filter((entry) => EQUIVALENT[entry.kind + entry.original] !== undefined).map((entry) => ({ id: entry.id, reason: EQUIVALENT[entry.kind + entry.original] })),
    results
  };
  fs.writeFileSync(path.resolve(outArgument), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`U040 mutants 2: ${report.killed} of ${report.total - report.invalid} valid mutants killed, ${report.invalid} invalid, survivors ${JSON.stringify(report.survived)}, undecided ${JSON.stringify(report.undecided)}, control passed ${report.controlPassed}`);
  process.exitCode = report.controlPassed && report.undecided.length === 0 && report.survived.length === report.equivalent.length ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
