'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { buildEnvironment } = require('../command.cjs');
const { killTree } = require('../runner.cjs');
const { sha, normalize } = require('./u041-authority.cjs');

const AFFECTED = Object.freeze(['gate.cjs', 'glob.cjs']);
const nativeParser = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if (!nativeParser) throw new Error('This offline generator requires the parser bundled with the qualified Node runtime.');
const parserModule = { exports: {} };
new Function('module', 'exports', nativeParser)(parserModule, parserModule.exports);
const parse = (source) => parserModule.exports.parse(source, { ecmaVersion: 'latest', locations: true });
const namespace = path.resolve(__dirname, '..');

function walk(node, visitor, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node, parent, key);
  for (const [field, value] of Object.entries(node)) {
    if (Array.isArray(value)) for (const item of value) walk(item, visitor, node, field);
    else if (value && typeof value.type === 'string') walk(value, visitor, node, field);
  }
}

function generate(file, source) {
  const candidates = [];
  const statements = [];
  const predicates = new Map();
  const remember = (node) => {
    if (!node) return;
    if (node.type === 'LogicalExpression') { remember(node.left); remember(node.right); }
    else predicates.set(`${node.start}:${node.end}`, node);
  };
  walk(parse(source), (node, parent, key) => {
    const headerDeclaration = node.type === 'VariableDeclaration' && parent &&
      ((parent.type === 'ForStatement' && key === 'init') || (['ForInStatement', 'ForOfStatement'].includes(parent.type) && key === 'left'));
    if ((/Statement$/.test(node.type) || ['VariableDeclaration', 'FunctionDeclaration'].includes(node.type)) && !headerDeclaration) {
      statements.push({ start: node.start, end: node.end, type: node.type, line: node.loc.start.line });
      if (node.type !== 'EmptyStatement') candidates.push({
        kind: 'statement', type: node.type, start: node.start, end: node.end, line: node.loc.start.line,
        replacement: node.type === 'BlockStatement' ? '{}' : ';'
      });
    }
    if (['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ConditionalExpression'].includes(node.type)) remember(node.test);
    if (node.type === 'LogicalExpression') remember(node);
    if (node.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(node.operator)) remember(node);
  });
  for (const node of [...predicates.values()].sort((a, b) => a.start - b.start || a.end - b.end)) {
    candidates.push({ kind: 'condition', type: node.type, start: node.start, end: node.end, line: node.loc.start.line,
      replacement: `!(${source.slice(node.start, node.end)})` });
  }
  const valid = [];
  const inapplicable = [];
  for (const candidate of candidates) {
    const changed = source.slice(0, candidate.start) + candidate.replacement + source.slice(candidate.end);
    try {
      new vm.Script(changed);
      valid.push({ ...candidate, file, original: source.slice(candidate.start, candidate.end) });
    } catch (error) {
      inapplicable.push({ file, kind: candidate.kind, type: candidate.type, line: candidate.line, reason: `syntax-invariant: ${error.message}` });
    }
  }
  return { statements, predicates: [...predicates.values()].map((node) => ({ start: node.start, end: node.end, line: node.loc.start.line })),
    valid, inapplicable };
}

// Only the mutation harness has these guards. An instrumented, unmutated baseline must pass before any guarded mutant is executed.
function bounded(source, file) {
  const edits = [];
  const functions = [];
  const loops = [];
  walk(parse(source), (node) => {
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type) && node.body.type === 'BlockStatement') functions.push(node);
    if (['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(node.type)) loops.push(node);
  });
  const used = new Set();
  for (const loop of loops) {
    const owner = functions.filter((node) => node.body.start < loop.start && node.body.end > loop.end).sort((a, b) =>
      (a.end - a.start) - (b.end - b.start))[0];
    if (!owner) throw new Error('A top-level loop requires a separately reviewed structural guard.');
    const name = `__u041Budget${owner.start}`;
    if (!used.has(name)) {
      used.add(name);
      edits.push({ start: owner.body.start + 1, end: owner.body.start + 1, text: `let ${name}=${file === 'glob.cjs' ? 5000000 : 500};` });
    }
    const guard = `if(--${name}<0)require('node:assert/strict').fail('U041_MUTATION_ITERATION_BOUND ${file}');`;
    if (loop.body.type === 'BlockStatement') edits.push({ start: loop.body.start + 1, end: loop.body.start + 1, text: guard });
    else {
      edits.push({ start: loop.body.start, end: loop.body.start, text: `{${guard}` });
      edits.push({ start: loop.body.end, end: loop.body.end, text: '}' });
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  new vm.Script(source);
  return source;
}

function classify(stdout, status, signal) {
  const count = (key) => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(stdout)?.[1]);
  const failures = stdout.split(/(?=^\s*not ok \d+ - )/m).filter((block) =>
    /^\s*not ok \d+ - /m.test(block) && /code: 'ERR_ASSERTION'/.test(block));
  const names = failures.map((block) => /^\s*not ok \d+ - (.+)$/m.exec(block)[1].trim());
  const outcome = status === 0 && signal === null ? 'survived' : names.length ? 'killed' : 'undecided';
  return { outcome, exit: status, signal, tests: count('tests'), passed: count('pass'), failed: count('fail'),
    cancelled: count('cancelled'), skipped: count('skipped'), assertionNames: [...new Set(names)],
    killedByBound: failures.some((block) => block.includes('U041_MUTATION_ITERATION_BOUND')) };
}

async function runTests(root, tests, { pattern = null, skipPattern = null } = {}) {
  const args = ['--test', '--test-concurrency=1', ...(pattern ? [`--test-name-pattern=${pattern}`] : []),
    ...(skipPattern ? [`--test-skip-pattern=${skipPattern}`] : []),
    ...tests.map((file) => path.join(root, 'testing', 'coverage', 'tests', file))];
  const child = spawn(process.execPath, args, {
    cwd: root, windowsHide: true,
    env: buildEnvironment(process.env, { U041_SUBJECT_ROOT: path.join(root, 'testing', 'coverage'), U009_EVIDENCE_CAPTURE: undefined, U009_HEAVY_HERMETIC: undefined }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const stdout = [];
  const stderr = [];
  try {
    const run = await new Promise((resolve) => {
      child.stdout.on('data', (bytes) => stdout.push(bytes));
      child.stderr.on('data', (bytes) => stderr.push(bytes));
      child.once('error', (error) => stderr.push(Buffer.from(error.message)));
      child.once('close', (status, signal) => resolve({ status, signal }));
    });
    const out = Buffer.concat(stdout);
    const err = Buffer.concat(stderr);
    return { ...classify(out.toString('utf8'), run.status, run.signal), pid: child.pid, stdout: out, stderr: err };
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.pid) killTree(child.pid);
  }
}

const testsFor = (file) => file === 'gate.cjs' ?
  ['gate.test.cjs', 'gate-fixes.test.cjs', 'u041-importer.test.cjs', 'u041-fast-json.test.cjs', 'u041-policy.test.cjs', 'u041-strict.test.cjs', 'u041-json.test.cjs'] :
  ['glob.test.cjs', 'u041-importer.test.cjs', 'u041-real-work.test.cjs', 'u041-work.test.cjs', 'u041-strict.test.cjs'];
const systemSkip = '^U041 P2/FU1:|^U041 P1/FU3: real passing gates';

function namedMutants() {
  const work = '    following.fill(0);\n    let alive = false;';
  return [
    { id: 'A08-hidden-constant-slowdown', file: 'glob.cjs', find: work,
      replace: '    following.fill(0);\n    for (let burn = 0; burn < 50; burn += 1) following.fill(0);\n    let alive = false;',
      tests: ['u041-real-work.test.cjs', 'u041-work.test.cjs'] },
    { id: 'A09-hidden-quadratic-rescan', file: 'glob.cjs', find: work,
      replace: '    following.fill(0);\n    for (let again = 0; again < position; again += 1) following.fill(0);\n    let alive = false;',
      tests: ['u041-real-work.test.cjs', 'u041-work.test.cjs'] },
    { id: 'report-changed-replaces-winner', file: 'gate.cjs',
      find: "    if (failure.error.code !== 'REPORT_CHANGED') replaceReports(argv, failure, deps);", replace: '    replaceReports(argv, failure, deps);',
      tests: ['u041-fast-json.test.cjs'] },
    { id: 'equals-form-dropped', file: 'gate.cjs',
      find: "    const jsonEquals = argument.startsWith('--json=');", replace: '    const jsonEquals = false;',
      tests: ['u041-json.test.cjs'], pattern: '^U041 P1/FU3: real passing gates' },
    { id: 'empty-json-value-accepted', file: 'gate.cjs',
      find: "      if (values.length === 0 || (flag === '--json' && values[0] === '')) throw new UsageError(`${flag} needs a value.`);",
      replace: '      if (values.length === 0) throw new UsageError(`${flag} needs a value.`);',
      tests: ['u041-fast-json.test.cjs'] },
    { id: 'self-gate-drops-heavy-checks', file: 'gate.cjs', find: "        overrides.U009_HEAVY_HERMETIC = '1';", replace: '',
      tests: ['u041-policy.test.cjs'], pattern: '^U041 P4: every full self-gate child' },
    { id: 'self-gate-keeps-capture-bypass', file: 'gate.cjs', find: '        overrides.U009_EVIDENCE_CAPTURE = undefined;', replace: '',
      tests: ['u041-strict.test.cjs'] }
  ];
}

function archiveResult(directory, id, source, run, facts) {
  fs.mkdirSync(directory, { recursive: true });
  const paths = { source: `${id}.subject.cjs.txt`, stdout: `${id}.stdout.gz`, stderr: `${id}.stderr.gz` };
  for (const [kind, bytes] of [['source', Buffer.from(source)], ['stdout', zlib.gzipSync(run.stdout)], ['stderr', zlib.gzipSync(run.stderr)]]) {
    fs.writeFileSync(path.join(directory, paths[kind]), bytes, { flag: 'wx' });
  }
  const { stdout, stderr, ...outcome } = run;
  const result = { id, ...facts, ...outcome, subjectSha256: sha(source), paths,
    stdoutSha256: sha(stdout), stderrSha256: sha(stderr), timeoutUsed: false };
  fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

async function campaign({ sourceRoot = namespace, scratch, workers = 2, only = null, namedOnly = false }) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 2) throw new Error('mutation workers must be 1 or 2 at normal priority');
  const originals = Object.fromEntries(AFFECTED.map((file) => [file, normalize(fs.readFileSync(path.join(sourceRoot, file))).toString('utf8')]));
  const inventory = AFFECTED.map((file) => ({ file, ...generate(file, originals[file]) }));
  const systematic = inventory.flatMap((entry) => entry.valid.map((candidate, index) => ({
    ...candidate, id: `${entry.file.startsWith('gate') ? 'G' : 'L'}${String(index + 1).padStart(4, '0')}`
  })));
  const named = namedMutants();
  const requested = (namedOnly ? named : [...systematic, ...named]).filter((item) => !only || only.includes(item.id));
  const reportDirectory = path.join(scratch, 'results');
  fs.mkdirSync(reportDirectory, { recursive: true });
  const prepare = (id) => {
    const root = path.join(scratch, `w-${id}`);
    if (fs.existsSync(root)) throw new Error(`owned work path already exists: ${id}`);
    fs.cpSync(sourceRoot, path.join(root, 'testing', 'coverage'), { recursive: true, filter: (file) => path.basename(file) !== '.scratch' });
    return root;
  };
  const baselines = [];
  for (const file of AFFECTED) {
    const id = file === 'gate.cjs' ? 'baseline-G' : 'baseline-L';
    const root = prepare(id);
    const source = bounded(originals[file], file);
    try {
      fs.writeFileSync(path.join(root, 'testing', 'coverage', file), source);
      const run = await runTests(root, testsFor(file), { skipPattern: systemSkip });
      const baseline = archiveResult(reportDirectory, id, source, run, { file, instrumented: true, testsSelected: testsFor(file) });
      baselines.push(baseline);
      if (run.exit !== 0 || run.failed !== 0 || run.cancelled !== 0) throw new Error(`instrumented ${file} baseline failed; no mutant is accepted`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < requested.length) {
      const item = requested[next++];
      const isNamed = Object.hasOwn(item, 'find');
      let source;
      if (isNamed) {
        if (originals[item.file].split(item.find).length !== 2) throw new Error(`named mutant anchor is not unique: ${item.id}`);
        source = originals[item.file].replace(item.find, item.replace);
      } else {
        source = originals[item.file].slice(0, item.start) + item.replacement + originals[item.file].slice(item.end);
        source = bounded(source, item.file);
      }
      const root = prepare(item.id);
      try {
        fs.writeFileSync(path.join(root, 'testing', 'coverage', item.file), source);
        const selected = item.tests || testsFor(item.file);
        const run = await runTests(root, selected, { pattern: item.pattern, skipPattern: isNamed ? null : systemSkip });
        const result = archiveResult(reportDirectory, item.id, source, run, {
          file: item.file, kind: isNamed ? 'named' : item.kind, line: item.line ?? null, instrumented: !isNamed,
          testsSelected: selected, selectionPattern: item.pattern || null,
          change: isNamed ? { find: item.find, replacement: item.replace } : { start: item.start, end: item.end, original: item.original, replacement: item.replacement }
        });
        results.push(result);
        fs.appendFileSync(path.join(scratch, 'progress.jsonl'), JSON.stringify({ id: item.id, outcome: result.outcome }) + '\n');
        if (results.length % 25 === 0) console.error(`U041 mutation progress: ${results.length}/${requested.length}`);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
  }));
  results.sort((a, b) => a.id.localeCompare(b.id));
  const document = {
    schema: 'U041-mutation-campaign/1', affectedProduction: AFFECTED, workers, priority: 'Normal', node: process.version,
    parser: parserModule.exports.version, generatedStatements: inventory.map((entry) => ({ file: entry.file, count: entry.statements.length })),
    generatedConditions: inventory.map((entry) => ({ file: entry.file, count: entry.predicates.length })),
    syntaxInvariants: inventory.flatMap((entry) => entry.inapplicable), generated: systematic.length, named: named.length,
    requested: requested.length, completed: results.length, baselines,
    killed: results.filter((item) => item.outcome === 'killed').length,
    survived: results.filter((item) => item.outcome === 'survived').map((item) => item.id),
    undecided: results.filter((item) => item.outcome === 'undecided').map((item) => item.id),
    equivalent: [], unexecuted: [...systematic, ...named].filter((item) => !requested.some((request) => request.id === item.id)).map((item) => item.id),
    iterationBounds: { 'gate.cjs': 500, 'glob.cjs': 5000000, scope: 'per function invocation; no wall-clock decision' },
    timeoutUsed: false, results
  };
  fs.writeFileSync(path.join(scratch, 'campaign.json'), JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
  return document;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
  const sourceRoot = path.resolve(value('--source') || namespace);
  if (args.includes('--check')) {
    console.log(JSON.stringify(AFFECTED.map((file) => {
      const inventory = generate(file, normalize(fs.readFileSync(path.join(sourceRoot, file))).toString('utf8'));
      return { file, statements: inventory.statements.length, conditions: inventory.predicates.length, mutants: inventory.valid.length, syntaxInvariants: inventory.inapplicable };
    }), null, 2));
  } else {
    const scratch = value('--scratch');
    if (!scratch) throw new Error('Usage: node testing\\coverage\\tests\\u041-mutations.cjs --scratch <owned-dir> [--source <retained-namespace>] [--workers 1|2] [--only ids] [--named]');
    campaign({ sourceRoot, scratch: path.resolve(scratch), workers: Number(value('--workers') || 2), only: value('--only')?.split(',') || null, namedOnly: args.includes('--named') })
      .then((document) => { console.log(JSON.stringify(document)); process.exitCode = document.survived.length || document.undecided.length ? 1 : 0; })
      .catch((error) => { console.error(error.stack); process.exitCode = 2; });
  }
}

module.exports = Object.freeze({ AFFECTED, generate, bounded, classify, namedMutants, campaign });
