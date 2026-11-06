'use strict';

const source = require('.\\source.cjs');
const usage = 'usage: node capability\\C031\\cli.cjs list | evaluate <saved-id> | compare <negative-saved-id>';

// Saved IDs only: no paths, URLs, verdicts or provenance can be supplied. Prints JSON; exit 0 valid, 1 rejected, 2 usage.
function main(argv, io) {
  const [command, id, ...rest] = argv;
  try {
    if (command === 'list' && id === undefined) {
      const catalog = source.catalog();
      io.stdout(`${JSON.stringify(catalog.ids.map(catalog.describe), null, 2)}\n`);
      return 0;
    }
    if ((command === 'evaluate' || command === 'compare') && typeof id === 'string' && !rest.length) {
      const catalog = source.catalog();
      const result = command === 'evaluate' ? catalog.evaluateSaved(id) : catalog.compare(id);
      io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      return result.valid ? 0 : 1;
    }
    io.stderr(`${usage}\n`);
    return 2;
  } catch (error) {
    io.stderr(`${error.code || 'CLI_UNAVAILABLE'}\n`);
    return 1;
  }
}
module.exports = Object.freeze({ main, usage });
if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text)
  });
}
