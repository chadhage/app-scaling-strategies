'use strict';

const fs = require('node:fs');
function main(args) {
  const usage = 'C030: inspect <closed-id> | compare <closed-retry-id> | json <closed-id> | inspect-copy <closed-id> (stdin) | inspect-unbound (fictional JSON stdin). No paths, URLs or authority overrides.';
  if (args.length === 1 && args[0] === 'help') { console.log(usage); return 0; }
  const command = args[0];
  if (!['inspect', 'compare', 'json', 'inspect-copy', 'inspect-unbound'].includes(command) ||
      args.length !== (command === 'inspect-unbound' ? 1 : 2)) throw Object.assign(new Error(usage), { code: 'CLOSED_COMMAND_REQUIRED' });
  const source = require('.\\source.cjs');
  source.preflight();
  const detector = require('.\\detector.js');
  if (command !== 'inspect-unbound' && !detector.sourceIds.includes(args[1])) throw Object.assign(new Error('Closed source ID required.'), { code: 'UNKNOWN_SOURCE_ID' });
  if (command === 'json') { console.log(detector.sourceJson(args[1])); return 0; }
  let text;
  if (command === 'inspect-copy' || command === 'inspect-unbound') {
    const buffer = Buffer.alloc(detector.MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = fs.readSync(0, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > detector.MAX_BYTES) throw Object.assign(new Error('Bounded JSON stdin required.'), { code: 'JSON_OVERSIZE' });
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  }
  const result = command === 'inspect' ? detector.inspectSource(args[1]) : command === 'compare' ? detector.compare(args[1]) :
    command === 'inspect-copy' ? detector.inspectCandidate(text, args[1]) : detector.inspectFictionJson(text);
  console.log(JSON.stringify(result, null, 2));
  return !result.valid ? 3 : result.decision === 'PASS' ? 0 : result.decision === 'FAIL' ? 1 : 2;
}
try { process.exitCode = main(process.argv.slice(2)); }
catch (error) {
  console.error(JSON.stringify({ cardId: 'C030', valid: false, decision: 'HOLD', code: error.code || 'UNAVAILABLE', message: error.message,
    eligibleForLiveRun: false, actualExternalEffectsObserved: false }));
  process.exitCode = 3;
}
