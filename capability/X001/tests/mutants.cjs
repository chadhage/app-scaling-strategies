'use strict';

// Systematic mutation self-check (L-0104, L-0147, L-0172): every statement and every single condition of describe.js, page.js and timeline.js is
// mutated, one source range at a time, and a named test must fail. Each mutant runs in a FRESH worker thread (own module graph; a run that exceeds --timeout
// seconds is reported as TIMEOUT, which is UNDECIDED and exits 1: on a starved machine a surviving mutant looks exactly like an endless loop) that is handed the mutated source through fs.readFileSync; the suites read a private SNAPSHOT of the namespace (the scratch
// directory, removed at the end), so the namespace is never written and an edit during a long run changes nothing.
// Pass 1 runs the suites that exercise the file (fast ones first, stopping at the first failing test); every survivor then runs all remaining suites
// (pass 2). The survivors that remain are either listed in mutant-list.cjs with a proof of equivalence or reported as SURVIVED (exit 1), and each one is
// printed on stderr the moment it is found. saved.js is generated data without logic: it is protected byte for byte by the provenance test in imports.test.cjs.
//   node capability\X001\tests\mutants.cjs <scratch-dir-that-does-not-exist> [--workers N] [--files describe.js,page.js,timeline.js] [--limit N]
//       [--only id,id] [--no-pristine] [--skip string,template,initializer,arrow,not,number] [--lines describe.js:1-130,timeline.js:54-93]
//       [--literal-lines describe.js:40-87]   (spans where --skip does not apply) [--timeout seconds, default 120] [--live <file>]  node capability\X001\tests\mutants.cjs --list   counts without running
// Needs the acorn that ships inside the Node binary: the tool restarts itself with `node --expose-internals`.
if (!process.execArgv.includes('--expose-internals')) {
  const restarted = require('node:child_process').spawnSync(process.execPath, ['--expose-internals', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(restarted.status === null ? 1 : restarted.status);
}
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const { generate, apply, parses } = require('.\\mutant-gen.cjs');
const { catalog } = require('.\\mutant-list.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const scratch = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
let base = repository;
const workers = Number(option('--workers', 4));
const timeoutSeconds = Number(option('--timeout', 120));
const targets = option('--files', 'describe.js,page.js,timeline.js').split(',');
const skipped = option('--skip', '').split(',').filter(Boolean);
// --lines file:a-b,file:c-d restricts a file to those line spans; --literal-lines file:a-b names the spans where --skip does not apply (wording that is under test).
const spans = (name) => option(name, '').split(',').filter(Boolean).map((item) => { const [file, span] = item.split(':'); return [file, ...span.split('-').map(Number)]; });
const ranges = spans('--lines');
const literalRanges = spans('--literal-lines');
const within = (list, file, line) => list.some(([name, from, to]) => name === file && line >= from && line <= to);
const readSource = (file) => fs.readFileSync(path.join(base, 'capability', 'X001', file), 'utf8');
// --live <file>: every stderr line (survivors the moment they are found, progress) is also appended to a file, because the shared recorder only writes a run's transcript at its end.
if (option('--live', null)) {
  const live = path.resolve(option('--live'));
  const toStderr = console.error.bind(console);
  console.error = (...items) => { fs.appendFileSync(live, `${items.join(' ')}\n`); toStderr(...items); };
}

// A private snapshot of everything the suites read: the namespace is never written, and an edit during a long run cannot change a verdict half way.
const SHARED = ['capability\\C044\\cursor.js', 'capability\\C044\\reducer.js', 'capability\\C034\\trace.js', 'capability\\C020\\contract.js', 'capability\\C020\\inspector.js', 'capability\\C033\\journey.js'];
function takeSnapshot(target) {
  const tests = fs.readdirSync(__dirname).filter((name) => /\.cjs$/.test(name) && !/^(evidence|imports|red-replay|red-replay-fix)(\.test)?\.cjs$/.test(name));
  const files = [...SHARED, ...['timeline.js', 'describe.js', 'page.js', 'saved.js', 'index.html', 'style.css', 'X001.feature', 'X001-fix.feature', '.gitattributes', 'evidence\\.gitattributes'].map((name) => `capability\\X001\\${name}`),
    ...tests.map((name) => `capability\\X001\\tests\\${name}`)];
  for (const relative of files) {
    if (!fs.existsSync(path.join(repository, relative))) continue;
    fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
    fs.copyFileSync(path.join(repository, relative), path.join(target, relative));
  }
}

// The named mutants (the reviewer's survivors) become range mutants like the generated ones.
function named(file, source) {
  return catalog.named.filter((item) => item.file === file).map((item) => {
    const at = source.indexOf(item.find);
    if (at < 0 || source.indexOf(item.find, at + 1) >= 0) throw new Error(`named mutant ${item.name}: the line must occur exactly once in ${file}`);
    return { file, op: `named-${item.name}`, start: at, end: at + item.find.length, replacement: item.replace, line: source.slice(0, at).split('\n').length, original: item.find.slice(0, 80) };
  });
}

const mutantList = () => targets.flatMap((file) => {
  const source = readSource(file);
  const inside = (mutant) => !ranges.some(([name]) => name === file) || within(ranges, file, mutant.line);
  const wanted = (mutant) => !skipped.includes(mutant.op.split('-')[0]) || within(literalRanges, file, mutant.line) || mutant.op.startsWith('named-');
  const seen = new Map();
  return [...generate(file, source), ...named(file, source)].map((mutant) => {
    const base = mutantId(file, source, mutant);
    seen.set(base, (seen.get(base) || 0) + 1);
    return { ...mutant, source, id: seen.get(base) === 1 ? base : `${base}~${seen.get(base)}` };
  }).filter((mutant) => wanted(mutant) && (inside(mutant) || mutant.op.startsWith('named-')));
});

// A stable id: the file, the operator, the text and its neighbours (not an offset), so an edit elsewhere in the file does not rename the mutants.
function mutantId(file, source, mutant) {
  const context = `${source.slice(Math.max(0, mutant.start - 30), mutant.start)}<<${source.slice(mutant.start, mutant.end)}>>${mutant.replacement}||${source.slice(mutant.end, mutant.end + 30)}`;
  return `${file}:${mutant.op}:${createHash('sha1').update(context.replace(/\s+/g, ' ')).digest('hex').slice(0, 10)}`;
}

function runWorker(file, mutated, suites, limitSeconds = timeoutSeconds) {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'mutant-runner.cjs'), { workerData: { repository: base, file, mutated, suites }, resourceLimits: { maxOldGenerationSizeMb: 768 } });
    // A run that does not finish is UNDECIDED, never a kill: on a starved machine a mutant that survives the suites looks exactly like an endless loop.
    const timer = setTimeout(() => { worker.terminate(); resolve({ killed: false, undecided: true, suite: 'timeout', by: [`timeout: the suites did not finish in ${limitSeconds} s (an endless loop or a starved machine)`] }); }, limitSeconds * 1000);
    const done = (outcome) => { clearTimeout(timer); resolve(outcome); };
    worker.once('message', (outcome) => { done(outcome); worker.terminate(); });
    worker.once('error', (error) => done({ killed: true, suite: 'crash', by: [`crash: ${String(error.message).slice(0, 80)}`] }));
  });
}

async function pool(items, action) {
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await action(item);
    }
  }));
}

async function main() {
  if (!args.includes('--list')) {
    if (!scratch || fs.existsSync(scratch)) throw new Error('usage: node mutants.cjs <scratch-dir-that-does-not-exist> [options] (or --list)');
    takeSnapshot(scratch);
    base = scratch;
  }
  try {
    await campaign();
  } finally {
    if (base !== repository) fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function campaign() {
  const list = mutantList();
  if (new Set(list.map((mutant) => mutant.id)).size !== list.length) throw new Error('mutant ids are not unique');
  if (args.includes('--list')) {
    const counts = {};
    for (const mutant of list) counts[`${mutant.file} ${mutant.op.split('-')[0]}`] = (counts[`${mutant.file} ${mutant.op.split('-')[0]}`] || 0) + 1;
    console.log(JSON.stringify({ generated: list.length, counts }, null, 1));
    return;
  }
  const only = option('--only', null);
  let selected = list.filter((mutant) => !only || only.split(',').some((part) => mutant.id.includes(part)));
  if (option('--limit', null)) selected = selected.slice(0, Number(option('--limit')));
  const started = Date.now();
  const report = { schema: 'X001-mutants/2', generator: 'tests\\mutant-gen.cjs (acorn of the Node binary), tests\\mutant-runner.cjs (worker threads)', files: targets, skipped, ranges, generated: selected.length, pristine: {}, mutants: [] };
  const everything = catalog.pass2;
  if (!args.includes('--no-pristine')) {
    await pool(everything, async (suite) => { const outcome = await runWorker(null, null, [suite], 400); report.pristine[suite] = outcome.killed ? `FAILED ${JSON.stringify(outcome.by)}` : 'passed'; });
    if (Object.values(report.pristine).some((state) => state !== 'passed')) throw new Error(`the unmutated suites must pass: ${JSON.stringify(report.pristine)}`);
  }
  let done = 0;
  await pool(selected, async (mutant) => {
    const record = { id: mutant.id, file: mutant.file, line: mutant.line, op: mutant.op, original: mutant.original, replacement: mutant.replacement.slice(0, 60) };
    const began = Date.now();
    try {
      const mutated = apply(mutant.source, mutant);
      parses(mutated);
      let outcome = await runWorker(mutant.file, mutated, catalog.suites[mutant.file]);
      if (!outcome.killed && !outcome.undecided) outcome = await runWorker(mutant.file, mutated, catalog.pass2.filter((suite) => !catalog.suites[mutant.file].includes(suite)));
      const proof = catalog.equivalents[mutant.id];
      report.mutants.push({ ...record, outcome: outcome.killed ? 'killed' : outcome.undecided ? 'TIMEOUT' : proof ? 'equivalent' : 'SURVIVED', ...(outcome.killed || outcome.undecided ? { suite: outcome.suite, by: outcome.by } : {}), ...(proof && !outcome.killed && !outcome.undecided ? { proof } : {}), ms: Date.now() - began });
    } catch (error) {
      report.mutants.push({ ...record, outcome: `INVALID (${String(error.message).slice(0, 80)})` });
    }
    done += 1;
    const last = report.mutants[report.mutants.length - 1];
    if (last && (last.outcome === 'SURVIVED' || last.outcome === 'TIMEOUT')) console.error(`# ${last.outcome} ${last.id} line ${last.line}: ${last.original.replace(/\s+/g, ' ').slice(0, 60)} -> ${last.replacement.replace(/\s+/g, ' ')}`);
    if (done % 25 === 0) console.error(`# progress ${done}/${selected.length} survived ${report.mutants.filter((item) => item.outcome === 'SURVIVED').length} ${Math.round((Date.now() - started) / 1000)} s`);
  });
  report.mutants.sort((a, b) => a.file.localeCompare(b.file) || a.id.localeCompare(b.id));
  const count = (outcome) => report.mutants.filter((item) => item.outcome === outcome).length;
  report.summary = {
    generated: selected.length, killed: count('killed'), equivalent: count('equivalent'), survived: report.mutants.filter((item) => item.outcome === 'SURVIVED').map((item) => item.id),
    timeouts: report.mutants.filter((item) => item.outcome === 'TIMEOUT').map((item) => item.id), timeoutSeconds,
    invalid: report.mutants.filter((item) => item.outcome.startsWith('INVALID')).length, elapsedSeconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(JSON.stringify(report));
  process.exitCode = report.summary.survived.length === 0 && report.summary.timeouts.length === 0 && report.summary.invalid === 0 ? 0 : 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
