'use strict';

// Test tooling, not production code: the SYSTEMATIC mutation run (C059 review F3). Started from the independent reviewer's generator (mp.cjs):
// statement mutants of page.js and journey.js, single-condition mutants of a11y-check.js and the guards of server.cjs are applied one at a time in a
// private copy OUTSIDE the repository. CAUSAL-KILL RULE (fourth fix, review D2 and D3): a mutant is KILLED only when a NAMED test fails by an assertion or by an error thrown inside it, in a run
// whose TAP counters were read (tests\mutate-classify.cjs); a per-test timeout, the failure of a whole file, a crash or a run without a named failing test is UNDECIDED and fails the run (never a
// kill, never an equivalent). The private tree is compared with its pristine digest after EVERY mutant and restored when a run left anything behind (tests\mutate-tree.cjs). The suites run with
// the per-test cap of the README (900000 ms), one suite file at a time (the lane suite first, pipelining last: the first file that kills decides). Survivors of the fast page suites face the slow ones (keyboard enumeration, property test). A mutant with an `equivalent` reason (IDENTITY,
// DEMONSTRATED or REASONING ONLY) may survive; any other survivor fails the run.
// Usage: node tests\mutate-gen.cjs --scratch <dir outside the repository> --out <report.json> [--only page|checker|server] [--match <label text>] [--check] [--workers N]
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { classify, counters, demonstrationFile, proofKind } = require('./mutate-classify.cjs');
const treeTools = require('./mutate-tree.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const scratch = argument('--scratch');
const out = argument('--out');
const only = argument('--only');
const match = argument('--match');
const check = process.argv.includes('--check');
const workers = Number(argument('--workers') ?? 2);
const TEST_TIMEOUT_MS = 900000;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const proofDirectory = out ? path.join(path.dirname(path.resolve(out)), `${path.basename(out, '.json')}.proofs`) : null;
// Progress of a long run: every result line is also appended to the file that C059_MUT_PROGRESS names (the recorder keeps stdout until the end).
const log = (line) => { console.log(line); if (process.env.C059_MUT_PROGRESS) fs.appendFileSync(process.env.C059_MUT_PROGRESS, `${line}\n`); };
const within = (file, directory) => {
  const relative = path.relative(directory, path.resolve(file));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
if (!scratch || (!out && !check) || (within(scratch, repository) && !within(scratch, path.join(repository, 'mutation-work')))) {
  throw new Error('--scratch must be outside the source tree or under the explicitly owned mutation-work folder, and --out a new report file');
}
if (!Number.isInteger(workers) || workers < 1 || workers > 2) throw new Error('--workers must be 1 or 2');

const FAST_PAGE = ['page', 'flow', 'tamper', 'page-bind', 'bind-null', 'page-kill', 'journey', 'journey-freeze'];
const SLOW_PAGE = ['keyboard', 'property'];
const FAST_CHECKER = ['checker', 'checker-reach', 'checker-kill', 'checker-fp'];
// The slowest and riskiest group runs FIRST (the server mutants start the long runs early and an undecided one shows up in the first minutes of a campaign); the report is sorted afterwards.
const groups = [
  ['server', require('./mutants-server.cjs').map((item) => ({ ...item, slow: [] }))],
  ['checker', require('./mutants-checker.cjs').map((item) => ({ ...item, suites: FAST_CHECKER, slow: [] }))],
  ['page', require('./mutants-page.cjs').map((item) => ({ ...item, suites: FAST_PAGE, slow: item.file === 'page.js' ? SLOW_PAGE : [] }))],
];
const mutants = groups.filter(([name]) => !only || only === name).flatMap(([group, list]) => list.map((item) => ({ group, ...item }))).map((item, index) => ({ ...item, ordinal: index + 1 })).filter((item) => !match || match.split('|').some((part) => item.label.includes(part)));

function listFiles(directory, filter) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? (filter(full) ? listFiles(full, filter) : []) : [full];
  });
}

function buildTree(target) {
  if (fs.existsSync(target)) throw new Error('a new owned mutation tree is required');
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
    // The per-test cap is the one of the README (900000 ms), so that a load-dependent timeout cannot turn into a result; the hard stop of a whole run is longer than that cap.
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`, ...files], { cwd: tree, env, windowsHide: true });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let spawnError = null;
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => { timedOut = true; killTree(child); child.kill(); }, 1200000);
    child.on('error', (error) => { spawnError = error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      resolve({ code, signal, timedOut, spawnError, stdout: out, stderr: err, text: out.toString('utf8') + err.toString('utf8') });
    });
  });
}

function retainRun(mutant, suite, run, verdict, runs) {
  const stem = `${String(mutant.ordinal).padStart(4, '0')}-${String(runs.length + 1).padStart(2, '0')}-${suite}`;
  const transcripts = {};
  for (const stream of ['stdout', 'stderr']) {
    const bytes = run[stream];
    const gzip = zlib.gzipSync(bytes, { level: 9 });
    const file = path.join(proofDirectory, `${stem}.${stream}.raw.gz`);
    fs.writeFileSync(file, gzip, { flag: 'wx' });
    transcripts[stream] = { path: path.relative(path.dirname(path.resolve(out)), file), bytes: bytes.length, sha256: sha(bytes), gzipSha256: sha(gzip) };
  }
  runs.push({
    suite, exitCode: run.code, signal: run.signal, timedOut: run.timedOut, spawnError: run.spawnError,
    status: verdict.status, named: verdict.named, summary: counters(run.text), transcripts,
  });
}

// A hard stop ends the WHOLE tree of the run: the runner and the process of every test file (a plain kill of the runner leaves the test files running in the tree of the worker).
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
}

// The suite files of a mutant run ONE AT A TIME and the first file that KILLS decides: the lane suite first (it kills the guards of the server in seconds), pipelining last (a mutant that makes
// every connection misbehave holds that file, or the server suite, for many minutes: the first campaign of this fix waited 19 minutes behind them for a mutant that the lane suite kills in
// seconds). A survivor runs every file; a mutant that no file kills and that a file leaves undecided is UNDECIDED. Each run is repeated (at most twice) only when the process died WITHOUT its
// TAP counters (the machine is shared and kills processes under memory pressure): that is not a result.
const RANK = { lane: 0, pipelining: 2 };
const rank = (suite) => RANK[suite] ?? 1;
async function decide(tree, suites, mutant, runs) {
  const stages = [];
  for (const suite of [...suites].sort((a, b) => rank(a) - rank(b))) {
    let run = await runTests(tree, [suite]);
    let verdict = classify(run);
    retainRun(mutant, suite, run, verdict, runs);
    for (let attempt = 0; attempt < 2 && verdict.unfinished; attempt += 1) {
      run = await runTests(tree, [suite]);
      verdict = classify(run);
      retainRun(mutant, suite, run, verdict, runs);
    }
    stages.push({ suite, run, verdict });
    if (verdict.status === 'killed') return { run, verdict };
  }
  const undecided = stages.find((stage) => stage.verdict.status === 'undecided');
  if (undecided) return { run: undecided.run, verdict: { ...undecided.verdict, reason: `${undecided.suite}: ${undecided.verdict.reason}` } };
  return { run: stages.at(-1).run, verdict: stages.at(-1).verdict };
}

async function worker(name, queue, results) {
  const tree = path.join(scratch, name);
  buildTree(tree);
  const pristine = treeTools.snapshot(tree);
  const pristineDigest = treeTools.digest(pristine);
  while (queue.length) {
    const mutant = queue.shift();
    const target = path.join(tree, 'capability', 'C059', mutant.file);
    const original = fs.readFileSync(target, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const find = mutant.from.replace(/\n/g, eol);
    const occurrences = original.split(find).length - 1;
    if (occurrences !== 1) { results.push({ ...mutant, error: `the mutated text occurs ${occurrences} times` }); log(`ERROR    ${mutant.file}: ${mutant.label}: occurs ${occurrences} times`); continue; }
    const runs = [];
    let run;
    let verdict;
    let stage = 'fast';
    let repaired = 0;
    let restoredDigest;
    try {
      fs.writeFileSync(target, original.replace(find, () => mutant.to.replace(/\n/g, eol)));
      ({ run, verdict } = await decide(tree, mutant.suites, mutant, runs));
      if (verdict.status === 'survived' && mutant.slow.length) {
        stage = 'slow';
        ({ run, verdict } = await decide(tree, mutant.slow, mutant, runs));
      }
      const demonstration = demonstrationFile(mutant.equivalent);
      if (verdict.status === 'survived' && demonstration) {
        const suite = demonstration.replace(/\.test\.cjs$/, '');
        if (!runs.some((entry) => entry.suite === suite && entry.status === 'survived')) {
          ({ run, verdict } = await decide(tree, [suite], mutant, runs));
        }
      }
    } finally {
      fs.writeFileSync(target, original);
      if (treeTools.digest(treeTools.snapshot(tree)) !== pristineDigest) repaired = treeTools.restore(tree, pristine);
      restoredDigest = treeTools.digest(treeTools.snapshot(tree));
      if (restoredDigest !== pristineDigest) throw new Error(`the tree ${name} could not be restored after: ${mutant.label}`);
    }
    const killed = verdict.status === 'killed';
    const demonstration = demonstrationFile(mutant.equivalent)?.replace(/\.test\.cjs$/, '');
    const proofRun = demonstration ? runs.findLast((entry) => entry.suite === demonstration) : null;
    results.push({
      group: mutant.group, file: mutant.file, label: mutant.label, status: verdict.status, killed, stage, kinds: verdict.kinds, reason: verdict.reason, repaired,
      crashLike: /SyntaxError|ReferenceError|Cannot read properties of (?:null|undefined)/.test(run.text), failingTests: verdict.named.slice(0, 3),
      equivalent: mutant.equivalent ?? null, proof: proofKind(mutant.equivalent),
      pristineDigest, restoredDigest, runs,
      proofExecution: proofRun ? { suite: proofRun.suite, status: proofRun.status, tests: proofRun.summary?.tests ?? 0 } : null,
    });
    const word = killed ? 'KILLED  ' : verdict.status === 'survived' ? 'SURVIVED' : 'UNDECIDED';
    log(`${word} [${stage}] ${mutant.file}: ${mutant.label}${killed ? ` <- ${verdict.named.slice(0, 3).map((named) => named.slice(0, 90)).join(' | ')}` : ''}${repaired ? ` (tree repaired: ${repaired} paths)` : ''}`);
    if (!killed) log(`  exit ${run.code}; ${verdict.reason ?? ''}; tail: ${run.text.slice(-500).replace(/\s+/g, ' ')}`);
  }
}

// Every `equivalent` reason must say what kind of proof it is (IDENTITY, DEMONSTRATED (tests\<file>) with a file that exists, REASONING ONLY): the report counts the kinds, and no sentence may
// claim more than the kind says.
function equivalents() {
  let bad = 0;
  for (const mutant of mutants.filter((item) => item.equivalent)) {
    const kind = proofKind(mutant.equivalent);
    const demo = demonstrationFile(mutant.equivalent);
    if (kind === 'unlabelled' || (kind === 'identity' && mutant.from !== mutant.to) || (kind === 'demonstrated' && !fs.existsSync(path.join(__dirname, demo)))) { bad += 1; console.log(`EQUIVALENT without a valid proof kind (or a demonstration that does not exist): ${mutant.file}: ${mutant.label}`); }
  }
  return bad;
}

function anchors() {
  const sources = new Map();
  let bad = equivalents();
  for (const mutant of mutants) {
    if (!sources.has(mutant.file)) sources.set(mutant.file, fs.readFileSync(path.join(root, mutant.file), 'utf8').replace(/\r\n/g, '\n'));
    const count = sources.get(mutant.file).split(mutant.from).length - 1;
    if (count !== 1) { bad += 1; console.log(`ANCHOR ${count}x ${mutant.file}: ${mutant.label}`); }
  }
  console.log(`${mutants.length} mutants, ${bad} anchors or equivalent reasons that are not in order`);
  process.exitCode = bad === 0 ? 0 : 1;
}

async function main() {
  if (check) return anchors();
  if (equivalents() > 0) throw new Error('an equivalent mutant has no proof kind');
  fs.mkdirSync(proofDirectory);
  const queue = [...mutants];
  const results = [];
  const names = Array.from({ length: workers }, (_, index) => `gen-${index}`);
  try {
    const finished = await Promise.allSettled(names.map((name) => worker(name, queue, results)));
    const failed = finished.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  } finally {
    for (const name of names) {
      const tree = path.join(scratch, name);
      if (fs.existsSync(tree)) fs.rmSync(tree, { recursive: true, force: true });
    }
  }
  results.sort((a, b) => `${a.file}${a.label}`.localeCompare(`${b.file}${b.label}`));
  const survivors = results.filter((item) => !item.error && item.status === 'survived' && !item.equivalent);
  const undecided = results.filter((item) => !item.error && item.status === 'undecided');
  const report = {
    schema: 'C059-mutation-gen/2', total: mutants.length, killed: results.filter((item) => item.killed).length, errors: results.filter((item) => item.error).length,
    testTimeoutMs: TEST_TIMEOUT_MS, workers,
    sourceFreezeSha256: fs.existsSync(path.join(root, 'evidence', 'final', 'source-freeze.json')) ? sha(fs.readFileSync(path.join(root, 'evidence', 'final', 'source-freeze.json'))) : null,
    undecided: undecided.length, undecidedMutants: undecided.map((item) => `${item.file}: ${item.label}: ${item.reason}`),
    crashLikeKills: results.filter((item) => item.killed && item.crashLike).length, treeRepairs: results.reduce((sum, item) => sum + (item.repaired ?? 0), 0),
    equivalent: results.filter((item) => item.equivalent).map((item) => ({ label: item.label, reason: item.equivalent, proof: item.proof, status: item.status, survived: item.status === 'survived' })),
    survivors: survivors.map((item) => `${item.file}: ${item.label}`), results,
  };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`DONE total=${report.total} killed=${report.killed} equivalent-listed=${report.equivalent.length} survivors=${survivors.length} undecided=${report.undecided} errors=${report.errors}`);
  if (survivors.length > 0 || report.undecided > 0 || report.errors > 0) process.exitCode = 1;
}

main();
