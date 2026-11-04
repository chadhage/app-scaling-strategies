'use strict';

const attribution = require('./attribution.js');
const { readCurrent } = require('./current.cjs');
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === 'context') {
    const current = await readCurrent();
    console.log(JSON.stringify({
      cardId: 'C036', banner: 'Training rehearsal - synthetic data - not a live Azure result',
      mode: 'actual read-only Node C015 public restore; not browser disk or authentication',
      current
    }, null, 2));
    return;
  }
  if (args.length !== 2 || !['inspect', 'attach'].includes(args[0]) || !attribution.ids.includes(args[1])) {
    throw Object.assign(new Error('CLOSED_COMMAND_AND_EVIDENCE_ID_REQUIRED'), { code: 'CLOSED_COMMAND_AND_EVIDENCE_ID_REQUIRED' });
  }
  const gate = await attribution.open();
  const candidate = gate.getEvidence(args[1]);
  const text = JSON.stringify(candidate);
  const result = await (args[0] === 'inspect' ? gate.inspectText(text) : gate.attachText(text));
  console.log(JSON.stringify({
    cardId: 'C036', banner: 'Training rehearsal - synthetic data - not a live Azure result',
    operation: args[0], evidenceId: args[1], result, state: gate.snapshot()
  }, null, 2));
  if (result.outcome === 'rejected') process.exitCode = 2;
}
main().catch((error) => {
  console.error(JSON.stringify({ cardId: 'C036', outcome: 'rejected', code: error.code || 'CURRENT_CONTEXT_UNAVAILABLE',
    attachedRecords: 0, nativeCorrelationVerified: false, authenticatedIdentityVerified: false }));
  process.exitCode = 2;
});
