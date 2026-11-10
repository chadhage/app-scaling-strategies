'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { inventory, bounded, apply, parses, sha } = require('.\\u049-mutation.cjs');
const { catalog } = require('.\\mutant-list.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const output = process.env.X001_U049_CAMPAIGN;
assert.equal(require('node:os').getPriority(), 0, 'the actual campaign process runs at Normal priority');
if (!output || process.argv.length !== 2) throw new Error('Set the unique owned X001_U049_CAMPAIGN directory; no scope, limit or only option is accepted');
if (fs.existsSync(output)) throw new Error('Campaign output must be fresh');
fs.mkdirSync(output, { recursive: true });
delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const sources = Object.fromEntries(['timeline.js', 'page.js'].map((file) => [file, fs.readFileSync(path.join(repository, 'capability', 'X001', file), 'utf8')]));
const sets = Object.entries(sources).map(([file, source]) => inventory(file, source, catalog.named));
const selected = sets.flatMap((set) => set.mutants);
assert.equal(new Set(selected.map((item) => item.id)).size, selected.length);
const suites = ['u049-module.test.cjs', 'u049-page.test.cjs', 'timeline.test.cjs', 'guards.test.cjs', 'aliasing.test.cjs',
  'describe.test.cjs', 'killers.test.cjs', 'page.test.cjs', 'totality.test.cjs', 'u049-work-budget.test.cjs',
  'exhaustive.test.cjs', 'properties.test.cjs'];
const inventories = { schema: 'X001-U049-systematic-inventory/1', files: sets, generated: selected.length,
  sourceScope: 'Entire timeline.js and page.js: every executable statement, every single condition and logical operand, plus all original generator operators. No line ranges, limits, only selectors or operator skips.',
  structuralNodes: 'Block and empty statements and use-strict directives are structural/directive nodes; their executable children are inventoried. Require arguments are not mutated, matching the retained generator.',
  suites: suites.map((file) => ({ file, rawSha256: sha(fs.readFileSync(path.join(__dirname, file))) })),
  generatorSha256: sha(fs.readFileSync(path.join(__dirname, 'u049-mutation.cjs'))),
  runnerSha256: sha(fs.readFileSync(path.join(__dirname, 'u049-mutation-worker.cjs'))),
  maximumWorkers: 2, priority: 'Normal', countedLoopLimitPerInvocation: 210000, timeoutKills: false };
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(inventories, null, 2) + '\n', { flag: 'wx' });

function trial(file, mutated, testFiles) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const child = fork(path.join(__dirname, 'u049-mutation-worker.cjs'), [], {
      cwd: repository, env, windowsHide: true, execArgv: ['--max-old-space-size=512'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stdout = '';
    let stderr = '';
    let result = null;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('message', (message) => { result = message; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(result && code === 0 && result.priority === 0 ? { ...result, stdout, stderr }
      : { status: 'undecided', code, signal, stdout, stderr, reason: 'Child did not return a named assertion result; never counted as a kill.' }));
    child.send({ repository, file, mutated, suites: testFiles });
  });
}

async function main() {
  const pristine = await trial(null, null, suites);
  fs.writeFileSync(path.join(output, 'pristine.json'), JSON.stringify(pristine, null, 2) + '\n', { flag: 'wx' });
  assert.equal(pristine.status, 'survived', 'every selected pristine assertion must pass before mutants');
  const boundedPristine = [];
  for (const file of ['timeline.js', 'page.js']) {
    const result = await trial(file, bounded(sources[file]), suites);
    boundedPristine.push({ file, ...result });
    assert.equal(result.status, 'survived', 'counted instrumentation must preserve the pristine behavior');
  }
  fs.writeFileSync(path.join(output, 'bounded-pristine.json'), JSON.stringify(boundedPristine, null, 2) + '\n', { flag: 'wx' });
  let next = 0;
  let done = 0;
  const rows = [];
  const heartbeat = process.env.X001_U049_HEARTBEAT;
  const timer = heartbeat ? setInterval(() => {
    fs.writeFileSync(heartbeat, `${new Date().toISOString()} worker-U049 private systematic mutation ${done}/${selected.length}; live X001 read-only; no application authorization\n`);
  }, 600000) : null;
  try {
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < selected.length) {
      const mutant = selected[next++];
      let outcome;
      try {
        const changed = apply(sources[mutant.file], mutant);
        parses(changed);
        outcome = await trial(mutant.file, bounded(changed), suites);
      } catch (error) {
        outcome = { status: error.name === 'SyntaxError' ? 'invalid' : 'undecided', reason: `${error.name}: ${error.message}` };
      }
      const row = { ...mutant, ...outcome };
      rows.push(row);
      fs.appendFileSync(path.join(output, 'outcomes.jsonl'), JSON.stringify(row) + '\n');
      done += 1;
      if (row.status !== 'killed') console.error(JSON.stringify({ id: row.id, status: row.status, line: row.line, original: row.original.slice(0, 100), replacement: row.replacement.slice(0, 100), failures: row.failures || [] }));
      if (done % 50 === 0) console.error(`# progress ${done}/${selected.length}`);
    }
  }));
  } finally {
    if (timer) clearInterval(timer);
  }
  rows.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const report = { schema: 'X001-U049-systematic-campaign/1', inventorySha256: sha(fs.readFileSync(path.join(output, 'inventory.json'))),
    priority: 'Normal', maximumWorkers: 2, environmentRemoved: ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'], pristinePassed: true,
    generated: rows.length, killed: rows.filter((row) => row.status === 'killed').length,
    surviving: rows.filter((row) => row.status === 'survived').map((row) => row.id),
    undecided: rows.filter((row) => row.status === 'undecided').map((row) => row.id),
    invalid: rows.filter((row) => row.status === 'invalid').map((row) => row.id),
    timeoutsCountedAsKills: 0, mutants: rows };
  fs.writeFileSync(path.join(output, 'campaign.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ generated: report.generated, killed: report.killed, surviving: report.surviving.length, undecided: report.undecided.length, invalid: report.invalid.length }));
  process.exitCode = report.surviving.length || report.undecided.length || report.invalid.length ? 1 : 0;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
