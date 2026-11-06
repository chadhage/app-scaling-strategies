'use strict';

// Evidence-phase tooling of the third fix (NOT a test, NOT run by the suite, not pinned by any capture): the Node facts the equivalence argument for the
// generated mutant G084 rests on (server.close on a server that is not listening). usage: node capability\C017\evidence\by-hand-04\eq-checks.cjs
const http = require('node:http');

function closeCall(server) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ resolved: false }), 3000);
    server.close((error) => { clearTimeout(timer); resolve({ resolved: true, argument: error ? error.code : null }); });
  });
}

(async () => {
  const never = http.createServer(() => {});
  const first = await closeCall(never);
  const used = http.createServer(() => {});
  await new Promise((resolve) => used.listen(0, '127.0.0.1', resolve));
  await closeCall(used);
  const again = await closeCall(used);
  console.log(JSON.stringify({ node: process.version, neverListened: first, closedTwice: again }));
})();
