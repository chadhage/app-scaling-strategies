'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), zlib = require('node:zlib');
const { sources, inventory } = require('./ast.cjs');
const { paired, RULES } = require('./pairs.cjs');
const { classify } = require('./verdict.cjs');
const { sha } = require('./integrity.cjs');
const { remaining, write } = require('./budget.cjs');
async function main() {
  remaining(60000);
  const inputPath = process.env.C012_MUTATION_INPUT, output = process.env.C012_PAIR_OUTPUT;
  assert.ok(inputPath && output && path.isAbsolute(inputPath) && path.isAbsolute(output));
  fs.mkdirSync(output, { recursive: false });
  const source = sources(), current = inventory(source);
  const saved = JSON.parse(fs.readFileSync(path.join(inputPath, 'inventory.json')));
  assert.deepEqual(current, saved, 'complete independent current AST and exact generated specimens');
  const history = JSON.parse(fs.readFileSync(path.join(inputPath, 'report.json')));
  const raw = fs.readFileSync(path.join(inputPath, history.raw.path));
  assert.equal(sha(raw), history.raw.sha256);
  const outcomes = raw.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(outcomes.length, current.definitions.length);
  const proofs = [], decisions = [];
  for (const definition of current.definitions) {
    remaining(60000);
    const outcome = outcomes.find(row => row.id === definition.id);
    assert.ok(outcome);
    assert.equal(outcome.sourceReadSha256, definition.sourceSha256);
    assert.equal(outcome.executedSourceSha256, definition.mutantSha256);
    assert.equal(classify(definition, outcome), outcome.classification);
    assert.ok(outcome.pristineAsserted > 300);
    assert.equal(outcome.pristineFailures, 0); assert.equal(outcome.pristineFaults, 0);
    if (outcome.classification === 'named-assertion-kill') {
      assert.equal(outcome.faults.length, 0); assert.equal(outcome.failures.length, 1);
      assert.equal(outcome.failures[0].code, 'ERR_ASSERTION'); assert.ok(outcome.failures[0].name.length > 10);
      decisions.push({ id: definition.id, decision: 'named-assertion-kill', name: outcome.failures[0].name });
    } else if (outcome.classification === 'survivor-unresolved') {
      const proof = await paired(definition, source);
      const bytes = Buffer.from(JSON.stringify(proof));
      const gzip = zlib.gzipSync(bytes);
      const file = 'pair-' + definition.id + '.actual-observations.json.gz';
      fs.writeFileSync(path.join(output, file), gzip, { flag: 'wx' });
      proofs.push({ ...Object.fromEntries(Object.entries(proof).filter(([key]) => !['pristineTrace', 'counterfactualTrace', 'extra'].includes(key))),
        artifact: file, originalJsonSha256: sha(bytes), gzipSha256: sha(gzip) });
      decisions.push({ id: definition.id, decision: 'specific-runnable-scoped-pair', rule: proof.rule });
    } else {
      assert.ok(outcome.classification.startsWith('nonkill-'));
      decisions.push({ id: definition.id, decision: outcome.classification, noKillCredit: true, fault: outcome.faults[0] || definition.syntax || null });
    }
  }
  assert.deepEqual(proofs.map(row => row.definitionId).sort((a, b) => a - b), Object.values(RULES).flat().sort((a, b) => a - b), 'no hidden default pairing or missing explicit survivor');
  const counts = Object.fromEntries([...new Set(decisions.map(row => row.decision))].map(kind => [kind, decisions.filter(row => row.decision === kind).length]));
  const report = {
    schema: 'C012-complete-AST-outcomes-and-specific-pairs/1', inventorySha256: sha(fs.readFileSync(path.join(inputPath, 'inventory.json'))),
    originalOutcomeSha256: sha(raw), files: current.files, domain: current.domains.map(row => ({ file: row.file, sourceSha256: row.sourceSha256,
      statements: row.statements.length, conditions: row.conditions.length, initializers: row.initializers.length, modulesAndExports: row.modules.length })),
    totalDefinitions: decisions.length, counts, proofs, decisions, semanticUnresolved: 0,
    noFaultIdentitySyntaxTimeoutOrUnexecutedKillCredit: true, defaultEquivalence: false,
    compiledNonIdentityExecuted: current.definitions.filter(row => !row.syntax && !row.identity).length,
    constructionNonkills: current.definitions.filter(row => row.syntax || row.identity).length,
    historicalDiscoveryRole: 'Every prior outcome stream and probe version remains original history; this census refers to the current source, not historical test credit',
    pass: true
  };
  write(path.join(output, 'report.json'), report);
  console.log(JSON.stringify({ definitions: report.totalDefinitions, counts, semanticUnresolved: 0, pass: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
