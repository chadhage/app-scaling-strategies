'use strict';

// Test tooling, not production code: writes evidence-index-addendum-2.json (flag wx: an addendum is never rewritten; a later change needs
// addendum 3). It chains to addendum 1 by the SHA-256 of its raw bytes (the pin that addendum 1 itself never had: its informational fields
// were not covered by any hash), names for server.cjs, README.md and tests\coverage-gate.cjs the SHA-256 of the bytes it replaces (read from
// the byte-exact copy under evidence\u040-2\superseded, equal to the bytes that addendum 1 names as live) and of the live bytes that replace
// them, and lists every archived manifest, the mutation report and the superseded copies of fix 2.
// Usage, after every capture exists: node capability\C026\tests\u040-addendum-2.cjs
const fs = require('node:fs');
const path = require('node:path');
const chain = require('./u040-chain.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const resolve = (relative) => path.join(repository, ...relative.split('\\'));
const hashOf = (relative) => chain.sha(fs.readFileSync(resolve(relative)));
const DIRECTORY = 'capability\\C026\\evidence\\u040-2';
const EDITS = Object.freeze({
  'capability\\C026\\server.cjs': ['server.cjs.txt', 'U040 fix 2: a drop budget per marked connection (a WeakMap next to closing; 16 requests are dropped quietly, the 17th destroys the connection and announces the limit DROPPED_REQUEST_BACKLOG once) and the mark of a connection whose answer Node forced to close (response.shouldKeepAlive false after writeHead: Expect: 100-continue answered without 100).'],
  'capability\\C026\\README.md': ['README.md.txt', 'The first U040 paragraph no longer says that nothing is ever destroyed, and the last section states fix 2: the drop budget and what bounds the work, the Expect mark, what was measured, the documented limits m2 to m4 and what is not covered. The figures that the earlier sections state about the archives are unchanged.'],
  'capability\\C026\\tests\\coverage-gate.cjs': ['coverage-gate.cjs.txt', 'The three suites of fix 2 (u040-flood, u040-budget, u040-expect) join TESTS, so tests\\coverage.cjs measures the new code of server.cjs.']
});
const list = (folder, accept) => fs.readdirSync(resolve(`${DIRECTORY}\\${folder}`), { withFileTypes: true }).flatMap((entry) => {
  if (entry.isDirectory()) return list(`${folder}\\${entry.name}`, accept);
  return accept(entry.name) ? [`${DIRECTORY}\\${folder}\\${entry.name}`] : [];
}).sort();

const amendments = Object.entries(EDITS).map(([file, [copy, edit]]) => {
  const supersededCopy = `${DIRECTORY}\\superseded\\${copy}`;
  return { path: file, status: 'applied', previousRawSha256: hashOf(supersededCopy), rawSha256: hashOf(file), supersededCopy, edit };
});
const evidence = [...list('red', (name) => name.endsWith('.json')), ...list('green', (name) => name.endsWith('.json')), ...list('mutants', () => true), ...list('superseded', () => true)]
  .map((relative) => ({ path: relative, rawSha256: hashOf(relative) }));
const addendum = {
  schema: chain.SCHEMA, cardId: 'C026', sequence: 2, createdAtUtc: new Date().toISOString(), item: 'U040',
  reason: 'Fix 2 of the defect fix U040 after the independent review of its first publication (finding F1: the requests that fix 1 dropped were never answered and never stopped the socket, so a flood behind a refusal or a pending transcript killed a child with a 48 MB heap at 3 sockets; minor m1: an answer that Node forces to close did not mark its connection). The archived runs of fix 1 hashed the bytes that this addendum replaces; the replaced bytes stay under evidence\\u040-2\\superseded and the earlier archives are unchanged.',
  note: 'previous pins evidence-index-addendum-1.json by the SHA-256 of its raw bytes, which no hash inside the repository covered before (an edit of its informational fields went undetected). U040.md and U040.feature are pinned by the captures of fix 1 and are not edited: U040.md still names the 8-way below-normal loop of the first attempt, evidence\\u040\\COMMANDS.md states the corrected rule (normal priority, at most 4 workers, nothing else of the item running); fix 2 states its own commands in evidence\\u040-2\\COMMANDS.md and U040-fix2.feature.',
  base: { path: chain.SEALED_INDEX, rawSha256: hashOf(chain.SEALED_INDEX) },
  previous: { path: chain.addendumPath(1), rawSha256: hashOf(chain.addendumPath(1)) },
  amendments, evidence
};
fs.writeFileSync(path.join(root, 'evidence-index-addendum-2.json'), `${JSON.stringify(addendum, null, 2)}\n`, { flag: 'wx' });
console.log(`addendum 2 written: ${amendments.length} amendments, ${evidence.length} evidence files`);
