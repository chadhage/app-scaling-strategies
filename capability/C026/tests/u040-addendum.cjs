'use strict';

// Test tooling, not production code: writes evidence-index-addendum-1.json (flag wx: an addendum is never rewritten; a later change
// needs addendum 2). It names, for each of the four amended files, the SHA-256 of the bytes superseded (read from the byte-exact copy
// under evidence\u040\superseded) and of the live bytes that replace them, and lists every archived manifest of this item.
// Usage, after every capture exists: node capability\C026\tests\u040-addendum.cjs
const fs = require('node:fs');
const path = require('node:path');
const chain = require('./u040-chain.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const resolve = (relative) => path.join(repository, ...relative.split('\\'));
const hashOf = (relative) => chain.sha(fs.readFileSync(resolve(relative)));
const EDITS = Object.freeze({
  'capability\\C026\\server.cjs': ['server.cjs.txt', 'U040: closing WeakSet marked in fail() with request.socket and checked in the request handler and the upgrade listener (drop, never destroy); checkExpectation, checkContinue, requireHostHeader:false and clientError routed through the same refusal path; /transcript.json marks its connection at dispatch and answers Connection: close; refuseUpgrade renamed refuseSocket.'],
  'capability\\C026\\tests\\evidence-final.test.cjs': ['evidence-final.test.cjs.txt', 'Accepts a production file whose bytes this addendum replaced (the archived final runs hashed the old bytes) and reads the chain through the pinned tests\\u040-chain.cjs; every original assertion and the test name are kept.'],
  'capability\\C026\\tests\\coverage-gate.cjs': ['coverage-gate.cjs.txt', 'The two U040 behaviour suites join TESTS, so tests\\coverage.cjs measures the new code of server.cjs.'],
  'capability\\C026\\README.md': ['README.md.txt', 'The routes sentence and the last section (U040: what changed, what was probed, what was not); not pinned by any test of the sealed card, listed for transparency.']
});

const listJson = (folder) => fs.readdirSync(path.join(root, 'evidence', 'u040', folder)).filter((name) => name.endsWith('.json')).sort()
  .map((name) => `capability\\C026\\evidence\\u040\\${folder}\\${name}`);

const amendments = Object.entries(EDITS).map(([file, [copy, edit]]) => {
  const supersededCopy = `capability\\C026\\evidence\\u040\\superseded\\${copy}`;
  return { path: file, status: 'applied', previousRawSha256: hashOf(supersededCopy), rawSha256: hashOf(file), supersededCopy, edit };
});
const evidence = [...listJson('red'), ...listJson('green'), 'capability\\C026\\evidence\\u040\\mutants\\mutants-01.report.json', 'capability\\C026\\evidence\\u040\\mutants\\mutants-01.stdout.txt']
  .map((relative) => ({ path: relative, rawSha256: hashOf(relative) }));
const addendum = {
  schema: chain.SCHEMA, cardId: 'C026', sequence: 1, createdAtUtc: new Date().toISOString(), item: 'U040',
  reason: 'Defect fix after audit U038 on the accepted, sealed card: nothing pipelined behind a refused request may upgrade or run. The archived final runs of the first publication and of the review fix hashed the old server.cjs, so the sealed verifier is amended to accept exactly the replaced bytes; the old bytes stay under evidence\\u040\\superseded.',
  base: { path: chain.SEALED_INDEX, rawSha256: hashOf(chain.SEALED_INDEX) }, previous: null, amendments, evidence
};
fs.writeFileSync(path.join(root, 'evidence-index-addendum-1.json'), `${JSON.stringify(addendum, null, 2)}\n`, { flag: 'wx' });
console.log(`addendum 1 written: ${amendments.length} amendments, ${evidence.length} evidence files`);
