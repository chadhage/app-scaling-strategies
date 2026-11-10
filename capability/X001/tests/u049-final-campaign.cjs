'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');
const { inventory, bounded, apply, parses, sha } = require('.\\u049-mutation.cjs');
const { catalog } = require('.\\mutant-list.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const output = process.env.X001_U049_FINAL_CAMPAIGN;
assert.equal(require('node:os').getPriority(), 0, 'actual campaign has Normal priority');
assert.equal(process.argv.length, 2);
assert.ok(output && !fs.existsSync(output), 'a fresh owned output is required');
fs.mkdirSync(output, { recursive: true });
delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const sources = Object.fromEntries(['timeline.js', 'page.js'].map((file) => [file, fs.readFileSync(path.join(repository, 'capability', 'X001', file), 'utf8')]));
const sets = Object.entries(sources).map(([file, source]) => {
  const set = inventory(file, source, catalog.named);
  walk.full(acorn.parse(source, { ecmaVersion: 'latest', locations: true }), (node) => {
    if (node.type !== 'ClassDeclaration') return;
    set.statements.push({ type: node.type, line: node.loc.start.line, start: node.start, end: node.end });
    set.mutants.push({ id: `${file}:class-declaration-removed:${sha(Buffer.from(source.slice(node.start, node.end))).slice(0, 10)}`,
      file, op: 'class-declaration-removed', line: node.loc.start.line, start: node.start, end: node.end,
      original: source.slice(node.start, node.end), replacement: ';' });
  });
  return set;
});
const selected = sets.flatMap((set) => set.mutants);
assert.equal(new Set(selected.map((item) => item.id)).size, selected.length);
const suites = ['u049-module.test.cjs', 'timeline.test.cjs', 'guards.test.cjs', 'u049-final.test.cjs', 'u049-final-oracles.test.cjs', 'u049-page.test.cjs',
  'u049-killers.test.cjs', 'aliasing.test.cjs', 'describe.test.cjs', 'killers.test.cjs', 'page.test.cjs',
  'totality.test.cjs', 'u049-work-budget.test.cjs', 'exhaustive.test.cjs', 'properties.test.cjs'];
const frozen = [...suites, 'u049-final-campaign.cjs', 'u049-final-worker.cjs', 'u049-mutation.cjs', 'mutant-gen.cjs', 'mutant-list.cjs', 'dom-stub.cjs']
  .map((file) => ({ file, rawSha256: sha(fs.readFileSync(path.join(__dirname, file))) }));
const header = {
  schema: 'X001-U049-final-systematic-inventory/1', files: sets, generated: selected.length,
  sourceScope: 'Entire timeline.js and page.js, every executable statement including class declarations, every single condition and logical operand, and the complete retained mutation operators. No production line or operator skips.',
  invalidPolicy: 'Syntactically impossible independent loop-header declaration removals remain explicit invalid variants, never kills or equivalents.',
  suites, frozen, runnerSha256: sha(fs.readFileSync(__filename)), maximumWorkers: 1, priority: 'Normal',
  countedLoopLimitPerInvocation: 210000, timeoutKills: false,
};
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(header, null, 2) + '\n', { flag: 'wx' });
function unchanged() {
  for (const item of frozen) assert.equal(sha(fs.readFileSync(path.join(__dirname, item.file))), item.rawSha256, item.file);
  for (const set of sets) assert.equal(sha(fs.readFileSync(path.join(repository, 'capability', 'X001', set.file))), set.rawSha256, set.file);
}
function trial(file, mutated) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const child = fork(path.join(__dirname, 'u049-final-worker.cjs'), [], {
      cwd: repository, env, windowsHide: true, execArgv: ['--max-old-space-size=512'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stdout = '';
    let stderr = '';
    let result = null;
    child.stdout.on('data', (bytes) => { stdout += bytes; });
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    child.once('message', (message) => { result = message; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(result && code === 0 && result.priority === 0
      ? { ...result, stdout, stderr } : { status: 'undecided', code, signal, stdout, stderr, reason: 'No named assertion outcome; not a timeout or crash kill.' }));
    child.send({ repository, file, mutated, suites });
  });
}
async function main() {
  const pristine = await trial(null, null);
  fs.writeFileSync(path.join(output, 'pristine.json'), JSON.stringify(pristine, null, 2) + '\n', { flag: 'wx' });
  assert.equal(pristine.status, 'survived', 'all actual pristine assertions pass');
  for (const file of Object.keys(sources)) {
    const result = await trial(file, bounded(sources[file]));
    fs.writeFileSync(path.join(output, `bounded-pristine-${file}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    assert.equal(result.status, 'survived', 'counted safety instrumentation preserves pristine behavior');
  }
  const rows = [];
  const refresh = setInterval(() => {
    if (process.env.X001_U049_MUTATION_LOCK) {
      const lock = process.env.X001_U049_MUTATION_LOCK;
      const owner = process.env.X001_U049_MUTATION_OWNER;
      assert.ok(typeof owner === 'string' && owner.length > 0);
      assert.ok(fs.readFileSync(lock, 'utf8').startsWith(`${owner} `));
      fs.utimesSync(lock, new Date(), new Date());
    }
  }, 300000);
  try {
    for (const mutant of selected) {
      unchanged();
      let outcome;
      let mutatedSha256 = null;
      try {
        const changed = apply(sources[mutant.file], mutant);
        mutatedSha256 = sha(Buffer.from(changed));
        parses(changed);
        outcome = await trial(mutant.file, bounded(changed));
      } catch (error) {
        outcome = { status: error.name === 'SyntaxError' ? 'invalid' : 'undecided', reason: `${error.name}: ${error.message}` };
      }
      const row = { ...mutant, mutatedSha256, ...outcome };
      rows.push(row);
      fs.appendFileSync(path.join(output, 'outcomes.jsonl'), JSON.stringify(row) + '\n');
      if (row.status !== 'killed') console.log(JSON.stringify({ id: row.id, line: row.line, status: row.status, original: row.original, replacement: row.replacement, failures: row.precedingNonassertionFailures || [] }));
      if (rows.length % 50 === 0) console.log(`# progress ${rows.length}/${selected.length}`);
    }
  } finally { clearInterval(refresh); }
  unchanged();
  const report = { schema: 'X001-U049-final-systematic-campaign/1', inventorySha256: sha(fs.readFileSync(path.join(output, 'inventory.json'))),
    generated: rows.length, killed: rows.filter((row) => row.status === 'killed').length,
    survived: rows.filter((row) => row.status === 'survived').map((row) => row.id),
    undecided: rows.filter((row) => row.status === 'undecided').map((row) => row.id),
    invalid: rows.filter((row) => row.status === 'invalid').map((row) => row.id),
    maximumWorkers: 1, priority: 'Normal', timeoutKills: 0, mutants: rows };
  fs.writeFileSync(path.join(output, 'campaign.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ generated: report.generated, killed: report.killed, survived: report.survived.length, undecided: report.undecided.length, invalid: report.invalid.length }));
  process.exitCode = report.survived.length || report.undecided.length ? 1 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
