'use strict';

const assert = require('node:assert/strict');
const source = require('.\\source.cjs');
const tables = require('.\\tables.js');
const usage = 'usage: node capability\\C040\\cli.cjs list | table <saved-set-id> <cohort|effect|latency> [all|attention|success|<status>]';
const exits = Object.freeze({ complete: 0, unavailable: 1, usage: 2, notComplete: 3 });

// Saved ids only: no paths, URLs, verdicts or provenance can be supplied. Prints JSON. Exit 0 only for a COMPLETE table (the state is
// in the JSON, so an empty, incomplete, inconsistent or rejected table is never reported as success), 1 unavailable, 2 usage, 3 not complete.
function main(argv, io) {
  const [command, id, tableId, filter, ...rest] = argv;
  try {
    if (command === 'list' && id === undefined) {
      const catalog = source.catalog();
      io.stdout(`${JSON.stringify(catalog.ids.map(catalog.describe), null, 2)}\n`);
      return exits.complete;
    }
    if (command === 'table' && typeof id === 'string' && tables.tableIds.includes(tableId) && !rest.length) {
      const view = tables.view(source.catalog().tables(id)[tableId], { filter: filter === undefined ? 'all' : filter });
      assert.ok(view.check.ok, view.check.problems.join('; '));
      io.stdout(`${JSON.stringify({
        cardId: 'C040', savedSet: id, table: tableId, state: view.state, summary: view.summary, filterNote: view.filterNote, producerLine: view.producerLine,
        statusCounts: view.statusCounts, query: view.query,
        rows: view.rows.map((row) => ({ position: row.position, id: row.id, status: row.status, kind: row.kind, attention: row.attention, flags: row.flags, text: row.text }))
      }, null, 2)}\n`);
      return view.state === 'COMPLETE' ? exits.complete : exits.notComplete;
    }
    io.stderr(`${usage}\n`);
    return exits.usage;
  } catch (error) {
    io.stderr(`${error.code || 'CLI_UNAVAILABLE'}\n`);
    return exits.unavailable;
  }
}
const run = (argv, streams = process) => main(argv, { stdout: (text) => streams.stdout.write(text), stderr: (text) => streams.stderr.write(text) });
module.exports = Object.freeze({ main, run, usage, exits });
if (require.main === module) process.exitCode = run(process.argv.slice(2));
