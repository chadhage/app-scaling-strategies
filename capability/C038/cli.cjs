'use strict';

const inspector = require('./readiness.js');
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === 'list') {
    console.log(JSON.stringify({ cardId: 'C038', fixtures: inspector.ids, ...inspector.flags }, null, 2));
    return;
  }
  if (!((args.length === 1 && args[0] === 'context') ||
      (args.length === 2 && args[0] === 'inspect') ||
      (args.length === 3 && args[0] === 'compare'))) throw Object.assign(new Error('CLOSED_COMMAND_REQUIRED'), { code: 'CLOSED_COMMAND_REQUIRED' });
  const session = await inspector.open();
  const results = [];
  for (const id of args.slice(1)) results.push(await session.inspectText(JSON.stringify(session.getEvidence(id))));
  console.log(JSON.stringify({
    cardId: 'C038', banner: 'Training rehearsal - synthetic data - not a live Azure result',
    mode: 'actual read-only current C015 through unchanged C036; fictional inventory and clock; actual C034 history stays unlinked',
    results, snapshot: session.snapshot()
  }, null, 2));
}
main().catch((error) => {
  console.error(JSON.stringify({ decision: 'UNKNOWN', action: 'HOLD', syntheticPoolReady: false,
    code: error.code || 'CONTEXT_OR_INSPECTION_UNAVAILABLE', ...inspector.flags }));
  process.exitCode = 2;
});
