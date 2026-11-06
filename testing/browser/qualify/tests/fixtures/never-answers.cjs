'use strict';

// Child process of outer-timeout.test.cjs (test tooling): runs the REAL qualifyEdge() with ONE adapter call that never answers
// and prints the reason codes. argv[2] is the adapter, or "sha256#2" / "statFile#2" for only the SECOND call of it.
const { qualifyEdge } = require('../../qualify.cjs');
const { fixtureAdapters, never, SHA } = require('../support.cjs');

const [target] = process.argv.slice(2);
const [name, nth] = target.split('#');
const calls = Number(nth || 1);
const normal = fixtureAdapters();
let seen = 0;
const overrides = {
  [name]: (...args) => {
    seen += 1;
    return seen >= calls ? never() : normal[name](...args);
  },
};
if (name === 'sha256') overrides.sha256 = (...args) => { seen += 1; return seen >= calls ? never() : SHA; };

qualifyEdge({ timeoutMs: 300, adapters: fixtureAdapters(overrides) }).then((report) => {
  process.stdout.write(`${JSON.stringify({ ok: report.ok, reasonCodes: report.reasonCodes })}\n`);
});
