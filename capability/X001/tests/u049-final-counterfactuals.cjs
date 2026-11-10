'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { observed } = require('.\\u049-observed.cjs');
const { consoleRun, shared, boundedReducer } = require('.\\u049-fixtures.cjs');
const source = fs.readFileSync(path.join(__dirname, '..', 'timeline.js'), 'utf8');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rows = [];
for (const [name, change] of [
  ['removed production work guard', (text) => text.replace("if (nodes > MAX_NODES) throw new Refusal('SAVED_RUN_TOO_LARGE');", ';')],
  ['hidden raw property enumeration', (text) => text.replace('onPath.add(source);', 'Object.values(source); onPath.add(source);')],
]) {
  const changed = change(source);
  assert.notEqual(changed, source);
  const measured = observed(changed);
  let folds = 0;
  const model = measured.model.using({ reducer: boundedReducer(() => { folds += 1; }) });
  const target = model.build(consoleRun({}));
  assert.equal(target.ok, true);
  measured.metrics.calls.length = 0;
  folds = 0;
  const raw = { reads: 0 };
  const result = model.verify(consoleRun(shared(40, raw)), target);
  const work = measured.metrics.calls.at(-1);
  let failure;
  try {
    if (name === 'removed production work guard') {
      assert.equal(measured.metrics.boundHit, false, 'G1 production guard must refuse before 210000 actual ownership iterations');
    } else {
      assert.ok(raw.reads + work.allocated <= 200000, 'G1 actual raw getter reads plus allocations must fit the occurrence budget');
    }
  } catch (error) {
    assert.equal(error.code, 'ERR_ASSERTION');
    failure = { code: error.code, name: error.name, message: error.message };
  }
  assert.ok(failure, `${name}: actual work evidence must distinguish this counterfactual`);
  assert.equal(folds, 0, 'neither controlled excessive-work case reached the reducer');
  if (name === 'removed production work guard') {
    assert.equal(measured.metrics.boundHit, true);
    assert.equal(work.steps, 210001);
  } else {
    assert.equal(measured.metrics.boundHit, false);
    assert.equal(result.code, 'SAVED_RUN_TOO_LARGE');
    assert.ok(raw.reads + work.allocated > 200000);
  }
  rows.push({ name, changedSourceSha256: sha(Buffer.from(changed)), result, actual: { ...work, rawGetterReads: raw.reads, folds },
    boundHit: measured.metrics.boundHit, namedFailingAssertion: failure });
}
const report = { schema: 'X001-U049-final-work-counterfactuals/1', sourceRawSha256: sha(Buffer.from(source)),
  observationToolSha256: sha(fs.readFileSync(path.join(__dirname, 'u049-observed.cjs'))), budget: 200000, safetyIterationBound: 210000,
  wallClockAcceptance: false, rows, passed: true };
if (process.env.X001_U049_COUNTERFACTUAL_OUT) fs.writeFileSync(process.env.X001_U049_COUNTERFACTUAL_OUT, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
