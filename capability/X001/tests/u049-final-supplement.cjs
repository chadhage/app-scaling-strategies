'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');
const { bounded, parses, sha } = require('.\\u049-mutation.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const prior = process.env.X001_U049_FINAL_BASE;
const output = process.env.X001_U049_FINAL_SUPPLEMENT;
assert.ok(prior && output && !fs.existsSync(output));
assert.equal(process.argv.length, 2);
assert.equal(require('node:os').getPriority(), 0);
fs.mkdirSync(output, { recursive: true });
const baseBytes = fs.readFileSync(path.join(prior, 'inventory.json'));
const base = JSON.parse(baseBytes);
const campaignBytes = fs.readFileSync(path.join(prior, 'campaign.json'));
const previous = JSON.parse(campaignBytes);
const sources = Object.fromEntries(base.files.map((file) => {
  const source = fs.readFileSync(path.join(repository, 'capability', 'X001', file.file), 'utf8');
  assert.equal(sha(Buffer.from(source)), file.rawSha256, 'the full campaign subject remains exact');
  return [file.file, source];
}));
const retested = previous.mutants.filter((row) => row.status === 'survived' || row.status === 'undecided').map((row) => {
  const { id, file, op, line, start, end, original, replacement } = row;
  return { id, file, op, line, start, end, original, replacement, priorStatus: row.status };
});
const mutants = [...retested];
const allStatements = [];
for (const [file, source] of Object.entries(sources)) {
  walk.full(acorn.parse(source, { ecmaVersion: 'latest', locations: true }), (node) => {
    if (/Statement$/.test(node.type) || ['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration'].includes(node.type)) {
      allStatements.push({ file, type: node.type, line: node.loc.start.line, start: node.start, end: node.end, directive: Boolean(node.directive) });
    }
    const op = node.type === 'BlockStatement' ? 'block-emptied' : node.type === 'EmptyStatement' ? 'empty-statement-removed' : node.directive ? 'directive-removed' : null;
    if (op === null) return;
    const replacement = op === 'block-emptied' ? '{}' : op === 'directive-removed' ? ';' : '';
    const original = source.slice(node.start, node.end);
    if (original === replacement) return;
    mutants.push({ id: `${file}:${op}:${sha(Buffer.from(`${node.start}:${node.end}:${original}`)).slice(0, 10)}`, file, op,
      line: node.loc.start.line, start: node.start, end: node.end, original, replacement });
  });
}
const suites = [...base.suites, 'u049-final-strict.test.cjs'];
const frozen = [...suites, 'u049-final-worker.cjs', 'u049-final-supplement.cjs', 'u049-mutation.cjs', 'dom-stub.cjs']
  .map((file) => ({ file, rawSha256: sha(fs.readFileSync(path.join(__dirname, file))) }));
const inventory = {
  schema: 'X001-U049-all-statement-supplement/1', baseInventorySha256: sha(baseBytes), baseCampaignSha256: sha(campaignBytes),
  sources: base.files.map((file) => ({ file: file.file, rawSha256: file.rawSha256 })), retestedAllUnresolved: retested.length,
  scope: 'Whole-file AST census including every block container, use-strict directive and empty statement, supplementing every executable statement and single condition already recorded by the full campaign. No AST statement class is silently excluded.',
  allStatements, mutants, suites, frozen, maximumWorkers: 1, priority: 'Normal', timeoutKills: 0,
};
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx' });
function trial(file, mutated) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const child = fork(path.join(__dirname, 'u049-final-worker.cjs'), [], { cwd: repository, env, windowsHide: true,
      execArgv: ['--max-old-space-size=512'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let result = null; let stdout = ''; let stderr = '';
    child.stdout.on('data', (bytes) => { stdout += bytes; });
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    child.once('message', (message) => { result = message; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve(result && code === 0 && result.priority === 0 ? { ...result, stdout, stderr }
      : { status: 'undecided', code, signal, stdout, stderr, reason: 'No named assertion outcome; not a kill.' }));
    child.send({ repository, file, mutated, suites });
  });
}
async function main() {
  const pristine = await trial(null, null);
  fs.writeFileSync(path.join(output, 'pristine.json'), JSON.stringify(pristine, null, 2) + '\n', { flag: 'wx' });
  assert.equal(pristine.status, 'survived');
  for (const [file, source] of Object.entries(sources)) {
    const result = await trial(file, bounded(source));
    fs.writeFileSync(path.join(output, `bounded-pristine-${file}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    assert.equal(result.status, 'survived');
  }
  const rows = [];
  for (const mutant of mutants) {
    for (const item of frozen) assert.equal(sha(fs.readFileSync(path.join(__dirname, item.file))), item.rawSha256);
    for (const [file, source] of Object.entries(sources)) assert.equal(fs.readFileSync(path.join(repository, 'capability', 'X001', file), 'utf8'), source);
    const changed = sources[mutant.file].slice(0, mutant.start) + mutant.replacement + sources[mutant.file].slice(mutant.end);
    let outcome;
    try { parses(changed); outcome = await trial(mutant.file, bounded(changed)); }
    catch (error) { outcome = { status: error.name === 'SyntaxError' ? 'invalid' : 'undecided', reason: `${error.name}: ${error.message}` }; }
    const row = { ...mutant, mutatedSha256: sha(Buffer.from(changed)), ...outcome };
    rows.push(row);
    fs.appendFileSync(path.join(output, 'outcomes.jsonl'), JSON.stringify(row) + '\n');
    if (row.status !== 'killed') console.log(JSON.stringify({ id: row.id, line: row.line, status: row.status, original: row.original, replacement: row.replacement }));
    const lock = process.env.X001_U049_MUTATION_LOCK;
    const owner = process.env.X001_U049_MUTATION_OWNER;
    assert.ok(lock && owner && fs.readFileSync(lock, 'utf8').startsWith(`${owner} `));
    fs.utimesSync(lock, new Date(), new Date());
  }
  const report = { schema: 'X001-U049-all-statement-supplement-result/1', inventorySha256: sha(fs.readFileSync(path.join(output, 'inventory.json'))),
    generated: rows.length, killed: rows.filter((row) => row.status === 'killed').length,
    survived: rows.filter((row) => row.status === 'survived').map((row) => row.id), undecided: rows.filter((row) => row.status === 'undecided').map((row) => row.id),
    invalid: rows.filter((row) => row.status === 'invalid').map((row) => row.id), maximumWorkers: 1, priority: 'Normal', timeoutKills: 0, mutants: rows };
  fs.writeFileSync(path.join(output, 'campaign.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ generated: report.generated, killed: report.killed, survived: report.survived.length, undecided: report.undecided.length, invalid: report.invalid.length }));
  process.exitCode = report.survived.length || report.undecided.length ? 1 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
