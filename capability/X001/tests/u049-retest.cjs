'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const walk = require('internal/deps/acorn/acorn-walk/dist/walk');
const { sha, bounded, apply, parses } = require('.\\u049-mutation.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const priorDirectory = process.env.X001_U049_PRIOR_CAMPAIGN;
const output = process.env.X001_U049_RETEST;
if (!priorDirectory || !output || process.argv.length !== 2 || fs.existsSync(output)) throw new Error('Set prior campaign and a fresh owned retest output');
assert.equal(require('node:os').getPriority(), 0);
delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
fs.mkdirSync(output, { recursive: true });
const first = JSON.parse(fs.readFileSync(path.join(priorDirectory, 'campaign.json'), 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(priorDirectory, 'inventory.json'), 'utf8'));
const sources = Object.fromEntries(inventory.files.map((entry) => {
  const source = fs.readFileSync(path.join(repository, 'capability', 'X001', entry.file), 'utf8');
  assert.equal(sha(Buffer.from(source)), entry.rawSha256, 'the full-campaign subject remains frozen');
  return [entry.file, source];
}));
const selected = first.mutants.filter((row) => ['survived', 'undecided'].includes(row.status));
const supplements = [];
for (const [file, source] of Object.entries(sources)) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  walk.full(ast, (node) => {
    if (node.type !== 'ClassDeclaration') return;
    supplements.push({ id: `${file}:class-declaration-removed:${sha(Buffer.from(source.slice(node.start, node.end))).slice(0, 10)}`,
      file, op: 'class-declaration-removed', line: node.loc.start.line, start: node.start, end: node.end,
      original: source.slice(node.start, node.end), replacement: ';' });
  });
}
selected.push(...supplements);
const suites = ['u049-module.test.cjs', 'u049-killers.test.cjs', 'u049-page.test.cjs', 'u049-work-budget.test.cjs',
  'timeline.test.cjs', 'guards.test.cjs', 'aliasing.test.cjs', 'describe.test.cjs', 'killers.test.cjs', 'page.test.cjs',
  'totality.test.cjs', 'exhaustive.test.cjs', 'properties.test.cjs'];
fs.writeFileSync(path.join(output, 'scope.json'), JSON.stringify({
  schema: 'X001-U049-complete-retest-scope/1', firstCampaignSha256: sha(fs.readFileSync(path.join(priorDirectory, 'campaign.json'))),
  firstInventorySha256: sha(fs.readFileSync(path.join(priorDirectory, 'inventory.json'))), selected: selected.map((row) => row.id),
  supplements, maximumWorkers: 2, priority: 'Normal', suites: suites.map((file) => ({ file, rawSha256: sha(fs.readFileSync(path.join(__dirname, file))) })),
}, null, 2) + '\n', { flag: 'wx' });

function trial(file, mutated) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const child = fork(path.join(__dirname, 'u049-mutation-worker.cjs'), [], {
      cwd: repository, env, windowsHide: true, execArgv: ['--max-old-space-size=512'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let result = null;
    let stderr = '';
    child.stdout.on('data', (bytes) => process.stdout.write(bytes));
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    child.once('message', (value) => { result = value; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(result && code === 0 && result.priority === 0 ? { ...result, stderr }
      : { status: 'undecided', code, signal, stderr, reason: 'No named assertion result; not a kill.' }));
    child.send({ repository, file, mutated, suites });
  });
}

async function main() {
  const pristine = await trial(null, null);
  fs.writeFileSync(path.join(output, 'pristine.json'), JSON.stringify(pristine, null, 2) + '\n', { flag: 'wx' });
  assert.equal(pristine.status, 'survived', 'every retest assertion passes on the pristine candidate');
  const rows = [];
  let next = 0;
  let done = 0;
  const timer = process.env.X001_U049_HEARTBEAT ? setInterval(() => fs.writeFileSync(process.env.X001_U049_HEARTBEAT,
    `${new Date().toISOString()} worker-U049 private mutation closure ${done}/${selected.length}; live X001 read-only\n`), 600000) : null;
  try {
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (next < selected.length) {
        const mutant = selected[next++];
        const changed = apply(sources[mutant.file], mutant);
        parses(changed);
        const result = await trial(mutant.file, bounded(changed));
        const row = { id: mutant.id, ...result };
        rows.push(row);
        fs.appendFileSync(path.join(output, 'outcomes.jsonl'), JSON.stringify(row) + '\n');
        done += 1;
        if (row.status !== 'killed') console.error(JSON.stringify({ id: row.id, status: row.status, failures: row.failures || [] }));
      }
    }));
  } finally { if (timer) clearInterval(timer); }
  const report = { schema: 'X001-U049-retest/1', supplements, maximumWorkers: 2, priority: 'Normal', mutants: rows,
    generated: rows.length, killed: rows.filter((row) => row.status === 'killed').length,
    survived: rows.filter((row) => row.status === 'survived').map((row) => row.id),
    undecided: rows.filter((row) => row.status === 'undecided').map((row) => row.id), timeoutKills: 0 };
  fs.writeFileSync(path.join(output, 'retest.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ generated: report.generated, killed: report.killed, survived: report.survived.length, undecided: report.undecided.length }));
  process.exitCode = report.survived.length || report.undecided.length ? 1 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
