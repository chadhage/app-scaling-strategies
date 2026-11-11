'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm');
const { sources, inventory } = require('./ast.cjs');
const { observe } = require('./probes.cjs');
const { sha } = require('./integrity.cjs');
const { remaining, write } = require('./budget.cjs');
const { classify } = require('./verdict.cjs');
const { record } = require('./journal.cjs');
const output = process.env.C012_MUTATION_OUTPUT;
assert.ok(output && path.isAbsolute(output), 'exclusive owned mutation output required');
fs.mkdirSync(output, { recursive: false });
async function main() {
  remaining(60000);
  record([process.pid], 'normal-mutation-controller-before-census-work');
  const input = sources(), domain = inventory(input), baseline = await observe(input);
  assert.deepEqual(baseline.failures, [], 'pristine named assertion baseline');
  assert.deepEqual(baseline.faults, [], 'pristine module/runtime/environment baseline');
  assert.ok(baseline.assertions.length > 300);
  write(path.join(output, 'inventory.json'), domain);
  const controls = [];
  for (const [kind, changed] of [
    ['explicit-authorization-defect', input['model.js'].replace('executionAuthorized: false', 'executionAuthorized: true')],
    ['module-fault', "throw new Error('C012 deliberate module fault');\n" + input['model.js']],
    ['permission-fault', "throw Object.assign(new Error('C012 deliberate environment fault'), {code:'EACCES'});\n" + input['model.js']]
  ]) {
    const observed = await observe({ ...input, 'model.js': changed });
    const classification = classify({ identity: false, syntax: null }, observed);
    controls.push({ kind, classification, faults: observed.faults, failures: observed.failures });
    assert.equal(classification, kind === 'explicit-authorization-defect' ? 'named-assertion-kill' : 'nonkill-runtime-module-environment-fault', kind);
  }
  let timeout;
  try { new vm.Script('while (true) {}').runInNewContext({}, { timeout: 20 }); } catch (error) { timeout = error; }
  assert.equal(timeout.code, 'ERR_SCRIPT_EXECUTION_TIMEOUT');
  controls.push({ kind: 'actual-vm-timeout', classification: classify({}, { faults: [{ code: timeout.code }], failures: [] }) });
  assert.equal(controls.at(-1).classification, 'nonkill-runtime-module-environment-fault');
  controls.push({ kind: 'identity', classification: classify({ identity: true }, baseline) });
  controls.push({ kind: 'syntax', classification: classify({ syntax: { name: 'SyntaxError' } }, baseline) });
  write(path.join(output, 'controls.json'), controls);
  const outcomes = [], startedAtUtc = new Date().toISOString();
  for (const definition of domain.definitions) {
    remaining(60000);
    const source = input[definition.file];
    const changed = source.slice(0, definition.start) + definition.replacement + source.slice(definition.end);
    assert.equal(sha(changed), definition.mutantSha256);
    let observed = { assertions: [], failures: [], faults: [], trace: [] }, control = baseline;
    if (!definition.identity && !definition.syntax) {
      control = await observe(input);
      assert.deepEqual(control.failures, [], 'same-environment pristine for position ' + definition.id);
      assert.deepEqual(control.faults, [], 'same-environment pristine faults for position ' + definition.id);
      observed = await observe({ ...input, [definition.file]: changed });
    }
    const row = {
      id: definition.id, file: definition.file, key: definition.key, operator: definition.operator,
      sourceReadSha256: definition.sourceSha256, executedSourceSha256: definition.mutantSha256,
      classification: classify(definition, observed), assertions: observed.assertions.length,
      assertionNames: observed.assertions, failures: observed.failures, faults: observed.faults,
      actualTraceSha256: sha(JSON.stringify(observed.trace)), sameEnvironmentPristineTraceSha256: sha(JSON.stringify(control.trace)),
      pristineAsserted: control.assertions.length, pristineFailures: 0, pristineFaults: 0
    };
    fs.appendFileSync(path.join(output, 'outcomes.original.ndjson'), JSON.stringify(row) + '\n');
    outcomes.push({ id: row.id, key: row.key, file: row.file, operator: row.operator, classification: row.classification,
      assertionNames: row.failures.map(failure => failure.name), sourceReadSha256: row.sourceReadSha256, executedSourceSha256: row.executedSourceSha256 });
    if (definition.id % 50 === 0) {
      fs.writeFileSync(path.join(process.env.C012_METADATA, 'heartbeat.txt'), new Date().toISOString() + ' C012 AST discovery ' + definition.id + '/' + domain.definitions.length);
      if (global.gc) global.gc();
    }
  }
  const counts = Object.fromEntries([...new Set(outcomes.map(row => row.classification))].map(kind => [kind, outcomes.filter(row => row.classification === kind).length]));
  const report = { schema: 'C012-complete-generated-mutation-discovery/1', startedAtUtc, completedAtUtc: new Date().toISOString(),
    domainSha256: sha(fs.readFileSync(path.join(output, 'inventory.json'))), pristine: { assertions: baseline.assertions.length, traceSha256: sha(JSON.stringify(baseline.trace)) },
    raw: { path: 'outcomes.original.ndjson', sha256: sha(fs.readFileSync(path.join(output, 'outcomes.original.ndjson'))) },
    counts, outcomes, discoveryOnly: true, acceptanceClosed: false, noFaultIdentityTimeoutOrSurvivorKillCredit: true };
  write(path.join(output, 'report.json'), report);
  console.log(JSON.stringify({ definitions: domain.definitions.length, counts, discoveryOnly: true, output }));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { classify };
