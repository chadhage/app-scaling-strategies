'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const { mutantsOf } = require('./mutate-lex.cjs');
const args = process.argv.slice(2);
const work = path.resolve(args[args.indexOf('--work') + 1]);
const jobs = Number(args[args.indexOf('--jobs') + 1] || 2);
if (![1, 2].includes(jobs) || args.indexOf('--work') < 0) throw new Error('U007 mutation needs a fresh --work and one or two jobs');
fs.mkdirSync(work);
const lifecycle = path.resolve(__dirname, '..');
const sourceFiles = ['scratch.cjs', 'scratch-session.cjs'];
const testFiles = ['u007-api.test.cjs', 'u007-scratch.test.cjs', 'u007-safety.test.cjs',
  'u007-session.test.cjs', 'u007-integration.test.cjs', 'u007-more.test.cjs'];
const helperFiles = ['u007-support.cjs', 'u007-hostile.cjs', 'u007-mutation-bound.cjs', 'u005-support-world.cjs',
  'u005-support-impl.cjs', 'support\\fake-os.cjs', 'support\\impl.cjs'];
const acceptedFiles = ['tree.cjs', 'windows.cjs', 'owned.cjs', 'startup.cjs', 'close.cjs', 'session.cjs'];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map((f) => [f, sha(fs.readFileSync(path.join(lifecycle, f)))]));
const campaign = [];
const enumeration = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(lifecycle, file), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 'latest', locations: true, sourceType: 'script' });
  const candidates = [];
  const statements = [], conditions = [];
  const add = (start, end, replacement, op, node) => candidates.push({ start, end, replacement, op, line: node?.loc.start.line });
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (node.type.endsWith('Statement') || ['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) {
      statements.push({ type: node.type, start: node.start, end: node.end, line: node.loc.start.line });
      if (node.type === 'BlockStatement') add(node.start, node.end, '{}', 'AST empty block', node);
      else add(node.start, node.end, node.type === 'VariableDeclaration' ? '' : ';', 'AST delete ' + node.type, node);
    }
    if (node.test) {
      conditions.push({ type: node.type, start: node.test.start, end: node.test.end, line: node.test.loc.start.line });
      for (const value of ['true', 'false']) add(node.test.start, node.test.end, value, 'AST condition ' + value, node.test);
    }
    if (node.type === 'LogicalExpression') {
      for (const side of ['left', 'right']) for (const value of ['true', 'false']) add(node[side].start, node[side].end, value, 'AST logical ' + side + ' ' + value, node[side]);
    }
    if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') add(node.right.start, node.right.end, '[]', 'AST empty iteration source', node.right);
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      for (const argument of node.arguments) if (argument.type !== 'SpreadElement') add(argument.start, argument.end, 'undefined', 'AST caller argument undefined', argument);
      if (node.arguments.length >= 2 && node.arguments[0].type !== 'SpreadElement' && node.arguments[1].type !== 'SpreadElement') {
        const a = node.arguments[0], b = node.arguments[1];
        add(a.start, b.end, source.slice(b.start, b.end) + ', ' + source.slice(a.start, a.end), 'AST swap first two caller arguments', node);
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
      } else if (value && typeof value.type === 'string') pending.push(value);
    }
  }
  for (const m of mutantsOf(source)) candidates.push(m);
  const seen = new Set();
  let invalid = 0, unchanged = 0;
  for (const m of candidates) {
    if (m.replacement === source.slice(m.start, m.end)) { unchanged += 1; continue; }
    const key = `${m.start}:${m.end}:${m.replacement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mutated = source.slice(0, m.start) + m.replacement + source.slice(m.end);
    try { new vm.Script(`(function(exports,require,module,__filename,__dirname){${mutated}\n})`); }
    catch { invalid += 1; continue; }
    campaign.push({ id: 'M' + String(campaign.length + 1).padStart(5, '0'), file, ...m, mutated });
  }
  enumeration.push({ file, sourceSha256: sourceHashes[file], statements, conditions, runnableMutants: campaign.filter((m) => m.file === file).length, invalidSyntaxNotKills: invalid, unchanged });
}
fs.writeFileSync(path.join(work, 'enumeration.json'), JSON.stringify({ schema: 'U007-AST-mutation/1', parser: 'Node bundled Acorn ' + acorn.version, sourceHashes, enumeration,
  mutants: campaign.map(({ mutated, ...m }) => m) }, null, 2) + '\n', { flag: 'wx' });
const results = [];
const hb = process.env.U007_HEARTBEAT;
const beat = () => { if (hb) fs.writeFileSync(hb, `${new Date().toISOString()} worker-U007 private mutation ${results.length}/${campaign.length}; max ${jobs} normal workers; no other capture\n`); };
const heartbeat = setInterval(beat, 60000);
beat();
let next = 0;
const deadline = process.env.U007_MUTATION_RETURN_BY ? Date.parse(process.env.U007_MUTATION_RETURN_BY) : Infinity;
function prepare(id, mutant) {
  const root = path.join(work, id);
  fs.mkdirSync(root);
  const subject = path.join(root, 'testing', 'browser', 'lifecycle');
  fs.mkdirSync(path.join(subject, 'tests', 'support'), { recursive: true });
  for (const file of [...sourceFiles, ...acceptedFiles]) fs.copyFileSync(path.join(lifecycle, file), path.join(subject, file), fs.constants.COPYFILE_EXCL);
  for (const file of [...testFiles, ...helperFiles]) {
    const destination = path.join(subject, 'tests', file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(lifecycle, 'tests', file), destination, fs.constants.COPYFILE_EXCL);
  }
  if (mutant) fs.writeFileSync(path.join(subject, mutant.file), mutant.mutated);
  const fixtures = path.join(root, 'fixtures');
  fs.mkdirSync(fixtures);
  return { root, subject, fixtures };
}
function runNode(context, files) {
  const env = { ...process.env, U007_WORK: context.fixtures, U007_IMPLEMENTATION: 'candidate',
    TEMP: context.fixtures, TMP: context.fixtures, TMPDIR: context.fixtures };
  for (const key of Object.keys(env)) if (['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(key.toUpperCase())) delete env[key];
  const previous = process.env.NODE_V8_COVERAGE;
  delete process.env.NODE_V8_COVERAGE;
  let child;
  try {
    child = spawn(process.execPath, ['--max-old-space-size=128', '--require', path.join(context.subject, 'tests', 'u007-mutation-bound.cjs'),
      '--test', '--experimental-test-isolation=none', '--test-concurrency=1', '--test-timeout=120000',
      '--test-name-pattern=^(?!S010: nested Node)', ...files.map((f) => path.join(context.subject, 'tests', f))],
      { cwd: context.fixtures, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } finally { if (previous !== undefined) process.env.NODE_V8_COVERAGE = previous; }
  return new Promise((resolve, reject) => {
    const stdout = [], stderr = [];
    child.stdout.on('data', (b) => stdout.push(b));
    child.stderr.on('data', (b) => stderr.push(b));
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, pid: child.pid, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
  });
}
async function execute(id, mutant) {
  const context = prepare(id, mutant);
  const smoke = await runNode(context, ['u007-api.test.cjs']);
  let full = null;
  if (smoke.exitCode === 0) full = await runNode(context, testFiles);
  const captures = [smoke, ...(full ? [full] : [])];
  const text = captures.map((c) => c.stdout.toString('utf8') + c.stderr.toString('utf8')).join('\n');
  const named = [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  const bound = text.includes('U007_MUTATION_ITERATION_BOUND');
  const timeout = /testTimeoutFailure|cancelledByParent|test timed out|ERR_TEST_TIMEOUT/.test(text);
  const failed = captures.some((c) => c.exitCode !== 0);
  const status = timeout || captures.some((c) => c.signal) || (failed && named.length === 0) ? 'undecided'
    : failed ? bound ? 'killed-by-bound' : 'killed-by-test' : 'survived';
  const record = { id, file: mutant?.file || 'control', op: mutant?.op || 'control', line: mutant?.line || null, status, named, timeout,
    captures: captures.map((c, index) => {
      fs.writeFileSync(path.join(context.root, `capture-${index}.stdout.raw`), c.stdout, { flag: 'wx' });
      fs.writeFileSync(path.join(context.root, `capture-${index}.stderr.raw`), c.stderr, { flag: 'wx' });
      return { exitCode: c.exitCode, signal: c.signal, stdoutSha256: sha(c.stdout), stderrSha256: sha(c.stderr) };
    }), fixtureRemainder: fs.readdirSync(context.fixtures) };
  fs.writeFileSync(path.join(context.root, 'result.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  if (mutant) results.push(record);
  return record;
}
(async () => {
  try {
    const control = await execute('control', null);
    if (control.status !== 'survived' || control.fixtureRemainder.length) throw new Error('Mutation control is not fully green and clean: ' + JSON.stringify(control));
    async function worker() {
      for (;;) {
        if (Date.now() >= deadline) return;
        const index = next++;
        if (index >= campaign.length) return;
        const mutant = campaign[index];
        await execute(mutant.id, mutant);
      }
    }
    await Promise.all(Array.from({ length: jobs }, worker));
    const summary = { generated: campaign.length, executed: results.length,
      killedByTest: results.filter((r) => r.status === 'killed-by-test').length,
      killedByBound: results.filter((r) => r.status === 'killed-by-bound').length,
      survived: results.filter((r) => r.status === 'survived').length,
      undecided: results.filter((r) => r.status === 'undecided').length,
      uncaptured: campaign.length - results.length, equivalent: 0 };
    fs.writeFileSync(path.join(work, 'campaign.json'), JSON.stringify({ schema: 'U007-mutation-result/1', sourceHashes, control, summary, results }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ sourceHashes, summary, survivors: results.filter((r) => r.status === 'survived' || r.status === 'undecided').map(({ id, file, op, line, status }) => ({ id, file, op, line, status })) }, null, 2));
    if (summary.survived || summary.undecided || summary.uncaptured) process.exitCode = 1;
  } finally { clearInterval(heartbeat); beat(); }
})().catch((error) => { console.error(error); process.exitCode = 2; });
