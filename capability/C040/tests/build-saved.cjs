'use strict';

// Deterministic generator for saved.js (no clock, no randomness). `--check` compares instead of writing.
// A saved set holds the SAVED output of the three accepted producers (slimmed to the fields the inspector reads) and says where each
// output came from. The generator reads the accepted producers directly; tests\source.test.cjs verifies every pin and replays this
// generator over the pinned producers, so a changed or forged producer byte cannot hide here.
const fs = require('node:fs');
const path = require('node:path');
const f = require('.\\fixtures.cjs');

const target = path.join(__dirname, '..', 'saved.js');
const listKeys = { cohort: 'clients', effect: 'originals', latency: 'originals' };
const tableIds = ['cohort', 'effect', 'latency'];

async function buildSets(p) {
  const { slim } = f;
  const saved = (producer, id, output) => ({ origin: { kind: 'producer-saved-output', producer, id }, output });
  const closed = {
    cohort: saved('C031', 'c034-closed-history', slim.cohort(p.cohort.evaluateSaved('c034-closed-history'))),
    effect: saved('C030', 'history-closed', slim.effect(p.effect.inspectSource('history-closed'))),
    latency: saved('C029', 'closed-history', slim.latency(p.latency.evaluateSaved('closed-history')))
  };
  const held = {
    cohort: saved('C031', 'c034-held-snapshot', slim.cohort(p.cohort.evaluateSaved('c034-held-snapshot'))),
    effect: saved('C030', 'history-held', slim.effect(p.effect.inspectSource('history-held'))),
    latency: saved('C029', 'held-snapshot', slim.latency(p.latency.evaluateSaved('held-snapshot')))
  };
  const retry = {
    cohort: saved('C031', 'fleet-baseline', slim.cohort(p.cohort.evaluateSaved('fleet-baseline'))),
    effect: saved('C030', 'control-absence-retry', slim.effect(p.effect.inspectSource('control-absence-retry'))),
    latency: { origin: { kind: 'producer-control-output', producer: 'C029', id: 'control-retry' }, output: slim.latency(await p.latency.evaluateControl('control-retry')) }
  };
  const forty = {
    cohort: { origin: { kind: 'producer-on-fictional-input', producer: 'C031', call: 'evaluateFleet', input: 'tests\\fixtures.cjs cohortFleet' },
      output: slim.cohort(p.cohortEvaluator.evaluateFleet(f.cohortFleet())) },
    effect: { origin: { kind: 'producer-on-fictional-input', producer: 'C030', call: 'inspectFiction', input: 'tests\\fixtures.cjs effectFiction' },
      output: slim.effect(p.effect.inspectFiction(f.effectFiction(p.ledger))) },
    latency: { origin: { kind: 'fictional-producer-shaped', note: 'The real C029 evaluator cannot be fed 45 journeys; built by tests\\fixtures.cjs latencyReport' },
      output: slim.latency(f.latencyReport()) }
  };
  const mutate = (name) => Object.fromEntries(tableIds.map((table) => {
    const output = f.clone(retry[table].output);
    f.mutations[name][table](output);
    return [table, { origin: { kind: 'mutation', base: 'fiction-failed-then-retry', mutation: name }, output }];
  }));
  return [
    { id: 'closed-history', role: 'historical', label: 'Saved closed history: seven originals, one of them summary-only',
      note: 'The exact saved C033/C034 history as the accepted C031, C030 and C029 outputs report it. Effects were never observed there.', reports: closed },
    { id: 'held-snapshot', role: 'historical', label: 'Saved held snapshot: two originals, one complete and one held',
      note: 'The exact earlier held snapshot as the accepted C031, C030 and C029 outputs report it.', reports: held },
    { id: 'fiction-failed-then-retry', role: 'fictional-baseline', label: 'Fictional: a failed original followed by a successful retry',
      note: 'Fictional baseline: C031 fleet-baseline, C030 control-absence-retry and C029 control-retry. The failed first original stays a failed row in every table.', reports: retry },
    { id: 'negative-3-failed-2-unknown-of-40', role: 'negative', label: 'Negative: 3 failed and 2 unknown rows among 40 successes (45 rows per table)',
      note: 'Fictional. All 5 failed and unknown rows must stay visible under every sort and the status filter "success".', reports: forty },
    { id: 'negative-unrecognised-status', role: 'negative', label: 'Negative: a producer status the inspector does not recognise',
      note: 'Fictional edit of the retry set: one row per table carries a status outside the closed vocabulary and must render as UNKNOWN.', reports: mutate('unrecognised') },
    { id: 'negative-empty', role: 'negative', label: 'Negative: an empty saved set',
      note: 'Fictional edit of the retry set: no rows. It must say no attempts recorded, never all passed.', reports: mutate('empty') },
    { id: 'negative-truncated', role: 'negative', label: 'Negative: a truncated saved set',
      note: 'Fictional edit of the retry set: fewer rows than the producer total. It must say INCOMPLETE and keep the producer total.', reports: mutate('truncated') },
    { id: 'negative-duplicated-row', role: 'negative', label: 'Negative: a duplicated row',
      note: 'Fictional edit of the retry set: rows repeated. Both copies stay and carry DUPLICATE_ROW.', reports: mutate('duplicated') }
  ];
}
function renderOutput(table, output, indent) {
  const key = listKeys[table];
  const { [key]: rows, ...rest } = output;
  const head = Object.entries(rest).map(([name, value]) => `${indent}  ${JSON.stringify(name)}: ${JSON.stringify(value)}`);
  const body = rows.length ? `[\n${rows.map((row) => `${indent}    ${JSON.stringify(row)}`).join(',\n')}\n${indent}  ]` : '[]';
  return `{\n${[...head, `${indent}  ${JSON.stringify(key)}: ${body}`].join(',\n')}\n${indent}}`;
}
function render(sets) {
  const blocks = sets.map((set) => {
    const reports = tableIds.map((table) => `        ${JSON.stringify(table)}: {\n          "origin": ${JSON.stringify(set.reports[table].origin)},\n` +
      `          "output": ${renderOutput(table, set.reports[table].output, '          ')}\n        }`);
    return `    {\n      "id": ${JSON.stringify(set.id)}, "role": ${JSON.stringify(set.role)},\n      "label": ${JSON.stringify(set.label)},\n` +
      `      "note": ${JSON.stringify(set.note)},\n      "reports": {\n${reports.join(',\n')}\n      }\n    }`;
  });
  return `(function (root) {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // Saved outputs of the accepted C031 cohort, C030 effect and C029 latency producers, slimmed to the fields the inspector reads, plus
  // fictional negatives. Each report names its origin. Generated by tests/build-saved.cjs; the raw bytes are pinned in imports.json.
  const bundle = freeze({
    "bundleVersion": 1, "cardId": "C040", "fictionalNegatives": true,
    "sets": [
${blocks.join(',\n')}
    ]
  });
  if (typeof module === 'object' && module.exports) module.exports = bundle;
  else Object.defineProperty(root, 'C040Saved', { value: bundle });
}(globalThis));
`;
}
function directProducers() {
  return {
    cohort: require('..\\..\\C031\\source.cjs').catalog(), cohortEvaluator: require('..\\..\\C031\\evaluator.js'), effect: require('..\\..\\C030\\detector.js'),
    latency: require('..\\..\\C029\\evaluator.js'), ledger: require('..\\..\\C023\\ledger.js')
  };
}
module.exports = Object.freeze({ buildSets, render, target, directProducers });
if (require.main === module) {
  buildSets(directProducers()).then((sets) => {
    const bytes = Buffer.from(render(sets), 'utf8');
    if (process.argv[2] === '--check') {
      const same = fs.existsSync(target) && fs.readFileSync(target).equals(bytes);
      console.log(same ? 'saved.js matches the generator' : 'saved.js differs from the generator');
      process.exitCode = same ? 0 : 1;
    } else {
      fs.writeFileSync(target, bytes);
      console.log(`wrote ${bytes.length} bytes, ${sets.length} saved sets`);
    }
  });
}
