'use strict';

// Test tooling, not production code: the SYSTEMATIC mutation run (C059 review F3). Started from the independent reviewer's generator (mp.cjs):
// statement mutants of page.js and journey.js, single-condition mutants of a11y-check.js and the guards of server.cjs are applied one at a time in a
// private copy OUTSIDE the repository; a mutant is killed only by a NAMED failing test. Survivors of the fast page suites face the slow ones
// (keyboard enumeration, property test). A mutant with an `equivalent` reason may survive; any other survivor fails the run.
// Usage: node tests\mutate-gen.cjs --scratch <dir outside the repository> --out <report.json> [--only page|checker|server] [--match <label text>] [--check] [--workers N]
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const scratch = argument('--scratch');
const out = argument('--out');
const only = argument('--only');
const match = argument('--match');
const check = process.argv.includes('--check');
const workers = Number(argument('--workers') ?? 2);
// Progress of a long run: every result line is also appended to the file that C059_MUT_PROGRESS names (the recorder keeps stdout until the end).
const log = (line) => { console.log(line); if (process.env.C059_MUT_PROGRESS) fs.appendFileSync(process.env.C059_MUT_PROGRESS, `${line}\n`); };
if (!scratch || (!out && !check) || path.resolve(scratch).toLowerCase().startsWith(repository.toLowerCase())) throw new Error('--scratch must be outside the repository and --out a new report file');

const FAST_PAGE = ['page', 'flow', 'tamper', 'page-bind', 'bind-null', 'page-kill', 'journey', 'journey-freeze'];
const SLOW_PAGE = ['keyboard', 'property'];
const FAST_CHECKER = ['checker', 'checker-reach', 'checker-kill', 'checker-fp'];
const groups = [
  ['page', require('./mutants-page.cjs').map((item) => ({ ...item, suites: FAST_PAGE, slow: item.file === 'page.js' ? SLOW_PAGE : [] }))],
  ['checker', require('./mutants-checker.cjs').map((item) => ({ ...item, suites: FAST_CHECKER, slow: [] }))],
  ['server', require('./mutants-server.cjs').map((item) => ({ ...item, slow: [] }))],
];
const mutants = groups.filter(([name]) => !only || only === name).flatMap(([group, list]) => list.map((item) => ({ group, ...item }))).filter((item) => !match || match.split('|').some((part) => item.label.includes(part)));

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
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C059_RED_SUBJECT', 'C059_FLOOD_SUBJECT']) delete env[key];
    // The mutation run uses ONE framing pair and ONE shape of the pipelining matrix: a mutant that keeps connections open would otherwise make every
    // one of its 200 cases wait for the idle bound (the full matrix runs in the green run and in every replay).
    env.C059_MATRIX = 'quick';
    const files = suites.map((suite) => path.join('capability', 'C059', 'tests', `${suite}.test.cjs`));
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=90000', ...files], { cwd: tree, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 600000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, text: Buffer.concat(chunks).toString('utf8') }); });
  });
}

const failing = (text) => [...new Set([...text.matchAll(/^\s*not ok \d+ - (?!capability[\\/])(.+)$/gm)].map((match) => match[1].trim()))];

async function worker(name, queue, results) {
  const tree = path.join(scratch, name);
  buildTree(tree);
  while (queue.length) {
    const mutant = queue.shift();
    const target = path.join(tree, 'capability', 'C059', mutant.file);
    const original = fs.readFileSync(target, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const find = mutant.from.replace(/\n/g, eol);
    const occurrences = original.split(find).length - 1;
    if (occurrences !== 1) { results.push({ ...mutant, error: `the mutated text occurs ${occurrences} times` }); log(`ERROR    ${mutant.file}: ${mutant.label}: occurs ${occurrences} times`); continue; }
    fs.writeFileSync(target, original.replace(find, () => mutant.to.replace(/\n/g, eol)));
    let run = await runTests(tree, mutant.suites);
    // A test process that dies without naming a failing test (the machine is shared and kills processes under memory pressure) is not a result: run again.
    for (let attempt = 0; attempt < 2 && run.code !== 0 && failing(run.text).length === 0; attempt += 1) run = await runTests(tree, mutant.suites);
    let stage = 'fast';
    if (run.code === 0 && mutant.slow.length) {
      stage = 'slow';
      run = await runTests(tree, mutant.slow);
      for (let attempt = 0; attempt < 2 && run.code !== 0 && failing(run.text).length === 0; attempt += 1) run = await runTests(tree, mutant.slow);
    }
    fs.writeFileSync(target, original);
    const named = failing(run.text);
    const killed = run.code !== 0 && named.length > 0;
    results.push({ group: mutant.group, file: mutant.file, label: mutant.label, killed, stage, crashLike: /SyntaxError|ReferenceError|Cannot read properties of (?:null|undefined)/.test(run.text), failingTests: named.slice(0, 3), equivalent: mutant.equivalent ?? null });
    log(`${killed ? 'KILLED  ' : 'SURVIVED'} [${stage}] ${mutant.file}: ${mutant.label}${killed ? ` <- ${named.slice(0, 3).map((name) => name.slice(0, 90)).join(' | ')}` : ''}`);
    if (!killed) log(`  exit ${run.code}; tail: ${run.text.slice(-500).replace(/\s+/g, ' ')}`);
  }
}

function anchors() {
  const sources = new Map();
  let bad = 0;
  for (const mutant of mutants) {
    if (!sources.has(mutant.file)) sources.set(mutant.file, fs.readFileSync(path.join(root, mutant.file), 'utf8').replace(/\r\n/g, '\n'));
    const count = sources.get(mutant.file).split(mutant.from).length - 1;
    if (count !== 1) { bad += 1; console.log(`ANCHOR ${count}x ${mutant.file}: ${mutant.label}`); }
  }
  console.log(`${mutants.length} mutants, ${bad} anchors that do not occur exactly once`);
  process.exitCode = bad === 0 ? 0 : 1;
}

async function main() {
  if (check) return anchors();
  const queue = [...mutants];
  const results = [];
  const names = Array.from({ length: workers }, (_, index) => `gen-${index}`);
  await Promise.all(names.map((name) => worker(name, queue, results)));
  results.sort((a, b) => `${a.file}${a.label}`.localeCompare(`${b.file}${b.label}`));
  const survivors = results.filter((item) => !item.error && !item.killed && !item.equivalent);
  const report = {
    schema: 'C059-mutation-gen/1', total: mutants.length, killed: results.filter((item) => item.killed).length, errors: results.filter((item) => item.error).length,
    crashLikeKills: results.filter((item) => item.killed && item.crashLike).length,
    equivalent: results.filter((item) => item.equivalent).map((item) => ({ label: item.label, reason: item.equivalent, survived: !item.killed })),
    survivors: survivors.map((item) => `${item.file}: ${item.label}`), results,
  };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`DONE total=${report.total} killed=${report.killed} equivalent-listed=${report.equivalent.length} survivors=${survivors.length} errors=${report.errors}`);
  for (const name of names) fs.rmSync(path.join(scratch, name), { recursive: true, force: true });
  if (survivors.length > 0 || report.errors > 0) process.exitCode = 1;
}

main();
