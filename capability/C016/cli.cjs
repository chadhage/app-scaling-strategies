'use strict';

const { conduct } = require('./conduct.cjs');
const [action, selection, ...extra] = process.argv.slice(2);
async function main() {
  if (extra.length) throw new Error('No extra arguments, namespace, payload or authority overrides.');
  if (action === 'conduct' && selection) return conduct(selection);
  if (action === 'inspect' && selection === undefined) {
    const bundled = require('./observations.js');
    return { source: 'bundled historical observations', filesystemOperationNow: false, observations: bundled };
  }
  throw new Error('Use conduct retry|unknown|conflict|hold|duplicates|all, or inspect.');
}
main().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  process.stderr.write(`${JSON.stringify({ code: 'CLI_REJECTED', message: error.message, filesystemAcknowledgment: null })}\n`);
  process.exitCode = 1;
});
