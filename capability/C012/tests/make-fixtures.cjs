'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { remaining } = require('./budget.cjs');
const { createStore } = require('../../C011/store.cjs');
const { resolveConfig } = require('../../C011/config.cjs');
const reservationContract = require('../../C011/contract.js');
const { buildPlan } = require('../../C004/plan-model.js');
const plans = require('../../C004/plan-fixtures.js');
const { approval } = require('../../C001/approved-contract.js');
const matrix = require('../../C003/matrix-data.js');
const { validateMatrix } = require('../../C003/matrix-contract.js');
const imports = require('../imports.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function build() {
  remaining();
  if (!validateMatrix(matrix).valid) throw new Error('Actual C003 matrix refused');
  const config = resolveConfig({
    pool: { units: 12, spend: 96 },
    caps: { 'conductor-a': { units: 8, spend: 48 }, 'conductor-b': { units: 8, spend: 64 } }
  });
  const provenance = Object.fromEntries(['C003', 'C004', 'C011'].map(card => [card, {
    commit: imports.accepted[card][0], tag: imports.accepted[card][1],
    sources: imports.entries.filter(item => item.path.startsWith('capability\\' + card + '\\') && /\.(js|cjs)$/.test(item.path))
      .map(item => ({ path: item.path, lfSha256: item.lf, gitBlobSha256: item.git, oid: item.oid }))
  }]));
  const records = {};
  for (const name of ['held', 'released', 'expired', 'refused', 'unknown', 'native', 'unverified', 'missing', 'absent']) {
    remaining();
    let at = 1000, next = 0;
    const store = createStore({ config, now: () => at, newId: () => 'rsv-' + (++next).toString(16).padStart(8, '0') });
    const first = reservationContract.validateBody('reserve', { key: 'held-key1', tier: 'standard', units: 3 });
    if (!first.ok || !store.reserve('conductor-a', first.value).ok) throw new Error('Producer held fixture refused');
    const other = reservationContract.validateBody('reserve', { key: 'otherkey1', tier: 'burst', units: 2 });
    if (!other.ok || !store.reserve('conductor-b', other.value).ok) throw new Error('Producer neighbor fixture refused');
    const estimateRequest = { key: 'proposed1', tier: 'standard', units: name === 'refused' ? 6 : 2 };
    const estimateChecked = reservationContract.validateBody('reserve', estimateRequest);
    if (!estimateChecked.ok) throw new Error('Producer estimate shape refused');
    let producerRefusal = null;
    if (name === 'refused') {
      const before = store.snapshot();
      const attempt = store.reserve('conductor-a', estimateChecked.value);
      if (attempt.ok || JSON.stringify(before) !== JSON.stringify(store.snapshot())) throw new Error('Real C011 refusal changed books');
      producerRefusal = attempt.code;
    }
    if (name === 'released') store.release('conductor-a', 'rsv-00000001');
    if (name === 'expired') at += config.ttlMs;
    const request = structuredClone(['native', 'unverified'].includes(name) ? plans.native : plans.local);
    if (name === 'unknown') request.pricing.status = 'unknown';
    if (name === 'unverified') request.pricing = {
      status: 'unverified-estimate', currency: 'USD', totalMinorUnits: 125,
      basis: 'Synthetic declared proposal only; rate, tax, scope and billing duration unverified.',
      source: { reference: 'local-declared-example-not-a-quote', capturedAtUtc: '2026-11-03T00:00:00Z', configurationId: request.configurationId }
    };
    const planResult = await buildPlan(request, approval);
    if (!planResult.valid) throw new Error('Actual C004 fixture refused: ' + JSON.stringify(planResult.errors));
    const subject = name === 'missing' ? 'visitor' : 'conductor-a';
    const id = name === 'absent' ? 'rsv-ffffffff' : 'rsv-00000001';
    const packet = {
      schema: 'C012-producer-snapshot/1', scenario: name, scope: 'bounded-synthetic-in-memory',
      observedAtMs: at, freshnessMs: 1000, subject, reservationId: id,
      estimate: { request: estimateRequest, validation: estimateChecked, units: estimateChecked.value.units,
        spend: estimateChecked.value.units * config.prices[estimateChecked.value.tier],
        rate: config.prices[estimateChecked.value.tier], priceVersion: reservationContract.priceVersion },
      allowance: store.allowance(subject), reservation: store.read(subject, id), producerRefusal,
      request, planResult, provenance,
      matrixCounts: {
        rows: matrix.rows.length,
        planned: matrix.rows.filter(row => row.status === 'planned').length,
        documented: matrix.rows.filter(row => row.status === 'documented-supported').length,
        unsupported: matrix.rows.filter(row => row.status === 'unsupported').length,
        unknown: matrix.rows.filter(row => row.status === 'unknown').length,
        qualified: matrix.rows.filter(row => row.qualified).length
      }
    };
    const text = JSON.stringify(packet);
    records[name] = { sha256: sha(text), text };
  }
  return records;
}
function render(records) {
  const entries = Object.entries(records).map(([name, value]) => '    ' + JSON.stringify(name) + ': Object.freeze(' + JSON.stringify(value) + ')').join(',\n');
  return `(function (root, factory) {\n  'use strict';\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else Object.defineProperty(root, 'C012Fixtures', { value: factory() });\n}(globalThis, function () {\n  'use strict';\n  return Object.freeze({\n${entries}\n  });\n}));\n`;
}
module.exports = { build, render, sha };
if (require.main === module) build().then(records => {
  const file = path.join(__dirname, '..', 'fixtures.js');
  fs.writeFileSync(file, render(records), { flag: 'wx' });
  console.log(JSON.stringify({ generatedFromActualAcceptedProducers: Object.keys(records), sizes: Object.fromEntries(Object.entries(records).map(([name, value]) => [name, value.text.length])) }));
}).catch(error => { console.error(error); process.exitCode = 1; });
