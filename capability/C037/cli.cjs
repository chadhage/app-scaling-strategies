'use strict';

const routing = require('./routing.js');
async function main() {
  const [operation, id] = process.argv.slice(2);
  if (!['list', 'context', 'fixture', 'inspect', 'compare'].includes(operation) ||
      (['list', 'context'].includes(operation) ? process.argv.length !== 3 :
        process.argv.length !== 4 || !routing.ids.includes(id))) {
    throw Object.assign(new Error('Usage: node capability\\C037\\cli.cjs list|context|fixture <id>|inspect <id>|compare <id>'), { code: 'CLOSED_CLI_ARGUMENTS' });
  }
  const pins = require('./pins.cjs');
  const sources = pins.checkImports();
  const state = pins.readState();
  if (operation === 'list') return console.log(JSON.stringify({ cardId: 'C037', ids: routing.ids, directSourcesVerified: sources.length }, null, 2));
  const model = await routing.open();
  if (operation === 'context') {
    console.log(JSON.stringify({
      cardId: 'C037', context: model.snapshot().currentExpectedContext,
      independentlyAcceptedC036: state.prerequisites.find((entry) => entry.id === 'C036'),
      ledgerRevision: state.ledgerRevision, directSourcesVerified: sources.length,
      interpretation: 'Actual read-only C015 restore through unchanged C036; fictional lease/user/tiers, not current traffic or authenticated association.'
    }, null, 2));
    return;
  }
  const fixture = model.getFixture(id);
  if (operation === 'fixture') return console.log(JSON.stringify(fixture, null, 2));
  const result = await model[`${operation}Text`](JSON.stringify(fixture));
  console.log(JSON.stringify({
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    cardId: 'C037', operation, result, history: model.snapshot().history
  }, null, 2));
  process.exitCode = result.disposition === 'MATCH_CONTROL' ? 0 : result.outcome === 'rejected' ? 1 :
    result.sampleDisposition === 'MISMATCH' ? 3 : 2;
}
main().catch((error) => {
  console.error(JSON.stringify({ cardId: 'C037', outcome: 'rejected', code: error.code || 'LOCAL_CONTEXT_UNAVAILABLE', message: error.message }));
  process.exitCode = 1;
});
