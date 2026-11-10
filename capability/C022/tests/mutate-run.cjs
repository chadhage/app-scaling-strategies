'use strict';

// Test tooling, not production code: runs the systematic mutants of mutate-gen.cjs against private COPIES of the namespace. Each worker owns
// one scratch tree (<scratch>/w<n>/capability/C022 plus the pinned imports); a mutant is written over ONE production file of that tree, the
// test files run in a fixed order and the first failing one KILLS it (the failing test is named); a mutant that passes EVERY file survives.
// Before the first mutant the whole order runs once on the UNMUTATED tree (the baseline): a file that fails there would "kill" every mutant.
// A run that times out or crashes without a named failing test is UNDECIDED, never a kill (a timeout cannot tell a hang from starvation).
// Workers run at normal priority (a BelowNormal process starves on a saturated machine); --low 1 lowers them.
//   node mutate-run.cjs --scratch <dir> --out <json> [--workers 2] [--files server.cjs,service.cjs,...] [--limit N] [--until HH:MM]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { generate } = require('./mutate-gen.cjs');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const repo = path.resolve(__dirname, '..', '..', '..');
const namespace = path.join(repo, 'capability', 'C022');
const scratch = path.resolve(args.scratch);
const workers = Number(args.workers || 2);
// --hand <list.cjs>: instead of the generated mutants, run the HAND LIST of isolation-guard mutants (tests\hand-mutants.cjs: iteration sources, call
// arguments and scoped accessors that the generator cannot make). Every entry is applied alone and must be killed by a NAMED failing test.
const hand = args.hand ? require(path.resolve(args.hand)).MUTANTS : null;
const FILES = hand ? [...new Set(hand.map((entry) => entry.file))] : (args.files || 'server.cjs,service.cjs,identity.cjs,store.cjs,contract.js,page.js').split(',');
// The test files, from the directory (a new test file needs no edit here): cheap in-process files first, then the heavy in-process ones, then
// the files that start processes. imports.test.cjs and evidence.test.cjs need git and the archive, so they are not part of a scratch tree;
// page.js has its own suite. A mutant SURVIVES only when every file that can load the mutated file passes.
// These files start child processes and attackers: they always run to their end (killing the test process would orphan its children).
const SPAWNING = new Set(['pipeline-process-rows', 'pipeline-process-third-hole', 'refusal-flood', 'pending-flood']);
const HEAVY = new Set(['property', 'isolation-more', 'refusal-close', 'pipeline-one-write', 'pipeline-earlier', 'pipeline-two-writes', 'pipeline-http10', 'pipeline-third-hole']);
const onDisk = fs.readdirSync(__dirname).filter((name) => /\.test\.cjs$/.test(name)).map((name) => name.replace(/\.test\.cjs$/, '')).filter((name) => !['evidence', 'imports'].includes(name)).sort();
const ALL = [...onDisk.filter((name) => !HEAVY.has(name) && !SPAWNING.has(name)), ...onDisk.filter((name) => HEAVY.has(name)), ...onDisk.filter((name) => SPAWNING.has(name))];
// What most likely kills a mutant of each production file goes first (the order only saves time, never decides: the whole list runs for a survivor).
const FIRST = {
  'identity.cjs': ['dual-tenant', 'guard-gaps', 'identity', 'identity-room', 'property', 'service', 'lifecycle'],
  'store.cjs': ['dual-tenant', 'store', 'store-gaps', 'service', 'isolation', 'property'],
  'service.cjs': ['dual-tenant', 'service', 'lifecycle', 'races', 'property', 'isolation'],
  'contract.js': ['contract-pins', 'contract-bounds', 'contract', 'rows-complete', 'guards', 'server'],
  'server.cjs': ['close-resolves', 'static-tables', 'auth-header', 'credentials', 'credential-first', 'continue', 'wiring', 'finished-socket', 'dual-tenant', 'guards', 'server', 'lifecycle', 'races', 'isolation', 'property', 'refusal-close']
};
// Pure unit files never load server.cjs, so a mutant of server.cjs cannot change their result (they stay in the baseline).
const UNIT = new Set(['identity', 'identity-room', 'store', 'store-gaps', 'contract', 'rows-complete']);
const SUITES = { 'page.js': ['page', 'page-gaps'] };
const orderFor = (file) => (SUITES[file] || [...(FIRST[file] || []), ...ALL.filter((name) => !(FIRST[file] || []).includes(name))].filter((name) => !(file === 'server.cjs' && UNIT.has(name)))).slice(0, args['order-limit'] ? Number(args['order-limit']) : undefined);
const ORDER = ALL;
const deadline = args.until ? new Date(`${new Date().toISOString().slice(0, 10)}T${args.until}:00`).getTime() : Infinity;
const IMPORTS = ['capability/C009/http-io.cjs', 'capability/C009/codes.cjs', 'capability/C009/queue.cjs', 'capability/C020/profiles.cjs', 'capability/C020/contract.js'];

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'evidence' || entry.name === 'scratch') continue;
    const source = path.join(from, entry.name);
    if (entry.isDirectory()) copyTree(source, path.join(to, entry.name));
    else fs.copyFileSync(source, path.join(to, entry.name));
  }
}

// The file runs directly with the TAP reporter. With bail, the first failing test ends the run at once (the mutant is killed by that named
// test); a file that spawns children never bails. A timeout is reported as such and is never a kill.
function runFile(tree, name, timeoutMs, bail = false) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    env.NODE_V8_COVERAGE = '';
    const file = path.join(tree, 'capability', 'C022', 'tests', `${name}.test.cjs`);
    const child = spawn(process.execPath, ['--test-reporter=tap', file], { cwd: tree, env, windowsHide: true });
    if (args.low === '1') { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort */ } }
    let out = '';
    let timedOut = false;
    let bailed = false;
    const seen = () => [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()).filter((name) => !/\.cjs$/.test(name));
    const onData = (chunk) => {
      out += chunk;
      if (bail && !bailed && !timedOut && seen().length && /ERR_ASSERTION/.test(out)) { bailed = true; child.kill('SIGKILL'); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status: bailed ? 1 : status, failed: seen(), assertionFailure: /ERR_ASSERTION/.test(out), timedOut: timedOut && !bailed, bailed });
    });
  });
}

// A hand-list entry as a mutant: every find text occurs exactly once in its file; the replacement is applied in order.
function handMutant(entry, source) {
  for (const [find] of entry.edits) {
    const count = source.split(find).length - 1;
    if (count !== 1) throw new Error(`${entry.id}: the find text occurs ${count} times in ${entry.file}`);
  }
  const first = source.indexOf(entry.edits[0][0]);
  return { id: entry.id, line: source.slice(0, first).split('\n').length, kind: 'hand', note: entry.why, from: entry.edits[0][0], to: entry.edits[0][1], apply: (text) => entry.edits.reduce((current, [find, to]) => current.replace(find, () => to), text) };
}

async function main() {
  const importProof = JSON.parse(fs.readFileSync(args['import-proof'] ? path.resolve(args['import-proof']) : path.join(namespace, 'evidence', 'final', 'import-reuse-proof.json'), 'utf8'));
  const importBindings = {};
  for (const rel of IMPORTS) {
    const bytes = fs.readFileSync(path.join(repo, rel));
    const normalized = sha256(Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1'));
    if (normalized !== importProof.imports[rel].lf) throw new Error(`${rel}: current imports do not bind the historical pass`);
    importBindings[rel] = { raw: sha256(bytes), lf: normalized, commit: importProof.imports[rel].commit };
  }
  const queue = [];
  const sourceHashes = {};
  for (const file of FILES) {
    const source = fs.readFileSync(path.join(namespace, file), 'utf8');
    sourceHashes[file] = { raw: sha256(source), lf: sha256(source.replaceAll('\r\n', '\n')) };
    const own = hand ? hand.filter((entry) => entry.file === file).map((entry) => handMutant(entry, source)) : generate(source, { numbers: file === 'contract.js' });
    for (const mutant of own) queue.push({ file, source, mutant });
  }
  const testHashes = {};
  for (const name of new Set([...ALL, ...Object.values(SUITES).flat()])) {
    const bytes = fs.readFileSync(path.join(namespace, 'tests', `${name}.test.cjs`));
    testHashes[name] = { raw: sha256(bytes), lf: sha256(bytes.toString('latin1').replaceAll('\r\n', '\n')) };
  }
  // --base <earlier manifest>: a later pass keeps what an earlier pass KILLED, as long as the production file is byte-identical and the test
  // file that killed it is byte-identical too (test files are only ever ADDED between passes), and runs everything else: the survivors, the
  // undecided and the mutants an earlier time-boxed pass did not reach. The new files can only add kills.
  const base = args.base ? JSON.parse(fs.readFileSync(path.resolve(args.base), 'utf8')) : null;
  const baseSha256 = base ? sha256(fs.readFileSync(path.resolve(args.base))) : null;
  if (base && !Object.values(importProof.baseManifests).includes(baseSha256)) throw new Error('base pass is not the exact retained observation');
  const rawOf = (entry) => (entry && typeof entry === 'object' ? entry.raw : entry);
  const sameSource = (file) => base && base.sourceHashes && rawOf(base.sourceHashes[file]) === sourceHashes[file].raw;
  const stillValid = (entry) => {
    const name = entry.killedBy && entry.killedBy.file.replace('.test.cjs', '');
    return Boolean(name) && sameSource(entry.file) && base.testHashes && rawOf(base.testHashes[name]) === testHashes[name].raw;
  };
  const kept = base ? base.results.filter((entry) => FILES.includes(entry.file) && stillValid(entry)) : [];
  // Two mutants of one condition (to true, to false) share their id: the replacement text is part of the key.
  const keyOf = (file, id, to) => `${file}:${id}:${to}`;
  const keptIds = new Set(kept.map((entry) => keyOf(entry.file, entry.id, entry.to)));
  const pending = queue.filter((entry) => !keptIds.has(keyOf(entry.file, entry.mutant.id, entry.mutant.to)));
  const limit = args.limit ? Number(args.limit) : pending.length;
  const todo = pending.slice(0, limit);
  console.log(`mutants: ${todo.length} to run of ${queue.length} (${kept.length} kept from the base pass); workers ${workers}`);
  const results = [...kept];
  fs.rmSync(scratch, { recursive: true, force: true });
  const trees = [];
  for (let n = 0; n < workers; n += 1) {
    const tree = path.join(scratch, `w${n}`);
    copyTree(namespace, path.join(tree, 'capability', 'C022'));
    for (const rel of IMPORTS) {
      fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true });
      fs.copyFileSync(path.join(repo, rel), path.join(tree, rel));
    }
    trees.push(tree);
  }
  const baseline = [];
  // --skip-baseline 1 and --order-limit N are for DEVELOPMENT runs only (a quick look at a list of mutants): the archived pass runs the baseline of every
  // file and the whole order for a survivor, and the evidence test rejects a manifest without them.
  for (const name of args['skip-baseline'] === '1' ? [] : new Set(Object.values(SUITES).flat().concat(ORDER))) {
    const result = await runFile(trees[0], name, 900000);
    baseline.push({ file: `${name}.test.cjs`, status: result.status, failed: result.failed.slice(0, 3) });
    console.log(`baseline ${name}: ${result.status === 0 ? 'passes' : `FAILS ${result.failed.slice(0, 1)}`}`);
  }
  const broken = baseline.filter((entry) => entry.status !== 0);
  if (broken.length) throw new Error(`the baseline (no mutant) fails: ${broken.map((entry) => entry.file).join(', ')}`);
  await Promise.all(trees.map(async (tree) => {
    while (todo.length && Date.now() < deadline) {
      const { file, source, mutant } = todo.shift();
      const target = path.join(tree, 'capability', 'C022', file);
      const t0 = Date.now();
      let killedBy = null;
      let undecided = null;
      fs.writeFileSync(target, mutant.apply(source));
      try {
        for (const name of orderFor(file)) {
          const result = await runFile(tree, name, 180000, !SPAWNING.has(name));
          if (result.status === 0) continue;
          if (result.timedOut || result.failed.length === 0 || !result.assertionFailure) { undecided = undecided || { file: `${name}.test.cjs`, reason: result.timedOut ? 'timed out' : 'ended without a named assertion failure' }; continue; }
          killedBy = { file: `${name}.test.cjs`, test: result.failed[0] };
          break;
        }
      } finally {
        fs.writeFileSync(target, source);
      }
      results.push({ file, id: mutant.id, line: mutant.line, kind: mutant.kind, note: mutant.note, from: mutant.from, to: mutant.to, killedBy, undecided: killedBy ? null : undecided, ms: Date.now() - t0 });
      console.log(`${results.length}/${queue.length} ${file}:${mutant.line} ${mutant.kind} ${killedBy ? `killed by ${killedBy.file}` : undecided ? `UNDECIDED ${undecided.reason} in ${undecided.file}` : 'SURVIVED'} ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }));
  const summary = {};
  for (const file of FILES) {
    const mine = results.filter((r) => r.file === file);
    const generated = queue.filter((entry) => entry.file === file).length;
    summary[file] = { generated, total: mine.length, killed: mine.filter((r) => r.killedBy).length, survived: mine.filter((r) => !r.killedBy && !r.undecided).length, undecided: mine.filter((r) => r.undecided).length, notRun: generated - mine.length };
  }
  const document = {
    tool: 'tests/mutate-gen.cjs + tests/mutate-run.cjs', handList: hand ? { file: 'tests/hand-mutants.cjs', count: hand.length, raw: sha256(fs.readFileSync(path.resolve(args.hand), 'utf8')), lf: sha256(fs.readFileSync(path.resolve(args.hand), 'utf8').replaceAll('\r\n', '\n')) } : null, node: process.version, generatedAtUtc: new Date().toISOString(), workers, order: { all: ALL, first: FIRST, skippedForServer: [...UNIT], neverBailing: [...SPAWNING] }, timeBox: args.until || null, baseline,
    sourceHashes, testHashes, importBindings, baseSha256, retainedKillsAreHistoricalNotNewRuns: true,
    passes: [...(base && sameSource(FILES[0]) ? base.passes || [] : []), { generatedAtUtc: new Date().toISOString(), ran: results.length - kept.length, keptFromBase: kept.length, workers, timeBox: args.until || null }],
    complete: Object.values(summary).every((figures) => figures.notRun === 0 && figures.undecided === 0), summary, results: results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  };
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(document, null, 1)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(summary));
  fs.rmSync(scratch, { recursive: true, force: true });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
