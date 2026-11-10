'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const test = require('node:test');
const io = require('./evidence-io.cjs');
const evidence = require('./evidence-u057.cjs');
const root = path.resolve(__dirname, '..');
const problems = evidence.verify(root);
const target = (name) => path.join(root, name);
const read = (name) => evidence.read(root, name);
const edited = (name, change) => {
  const document = evidence.json(root, name);
  change(document);
  return Buffer.from(JSON.stringify(document, null, 2) + '\n');
};
const flipped = (name) => {
  const bytes = Buffer.from(read(name));
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  return bytes;
};
const named = (edits, check, pattern) => io.withEdits(new Map(edits.map(([name, bytes]) => [target(name), bytes])), () => {
  const found = [];
  try { check(root, found); } catch (error) { found.push(`${check.name}: ${error.message}`); }
  return found.some((problem) => pattern.test(problem));
});

test('U057 the exact amendment, original captures, final gates and every current file verify together', () => assert.deepEqual(problems, []));

test('U057 retained historical evidence is verified against its exact archived subjects, never current mutable sources', () => {
  const found = [];
  evidence.originalChecks(root, found);
  assert.deepEqual(found, []);
});

test('U057 TAMPER the immutable original seal, an original transcript, an original subject and its index are detected by name', () => {
  for (const name of ['evidence/seal.json', 'evidence/red/raw/red-01-ownership-behavior.stdout.raw.gz', 'evidence/u057/original/capability/C010/server.cjs']) {
    assert.ok(named([[name, flipped(name)]], evidence.originalChecks, /original:/), name);
  }
  assert.ok(named([[evidence.ORIGINAL, flipped(evidence.ORIGINAL)]], evidence.inventoryChecks, /original subject index differs/));
});

test('U057 TAMPER every new source, feature, import, README, test and added file is anchored, and an unsealed file is rejected', () => {
  for (const name of ['server.cjs', 'contract.js', 'U057.feature', 'imports.json', 'README.md', 'tests/commit.test.cjs', 'tests/u057-boundaries.test.cjs', 'tests/evidence.test.cjs', 'tests/evidence-u057.cjs']) {
    assert.ok(named([[name, flipped(name)]], evidence.inventoryChecks, /differs from its pin/), name);
  }
  assert.ok(named([['tests/unsealed.cjs', Buffer.from('new file\n')]], evidence.inventoryChecks, /is not sealed/));
});

test('U057 TAMPER either the addendum or its independent head bytes breaks the chained authority', () => {
  assert.ok(named([[evidence.ADDENDUM, edited(evidence.ADDENDUM, (document) => { document.owner = 'other'; })]], evidence.inventoryChecks, /head does not anchor/));
  assert.ok(named([[evidence.HEAD, Buffer.from('0'.repeat(64) + '\n')]], evidence.inventoryChecks, /head does not anchor/));
});

test('U057 TAMPER a raw final stream, its manifest summary and a captured input identity each fail by name', () => {
  const file = `${evidence.FINAL}green-default-limits.json`;
  const document = evidence.json(root, file);
  const stdout = path.posix.join(path.posix.dirname(file), document.transcripts.stdout.path.replaceAll('\\', '/'));
  assert.ok(named([[stdout, flipped(stdout)]], evidence.captureChecks, /green-default-limits.*gzip pin differs|green-default-limits.*not valid gzip/));
  assert.ok(named([[file, edited(file, (capture) => { capture.summary.pass += 1; })]], evidence.captureChecks, /green-default-limits.*pass differs from raw TAP/));
  assert.ok(named([[file, edited(file, (capture) => { capture.inputs[0].rawSha256 = '0'.repeat(64); capture.inputs[0].crlfToLfSha256 = '0'.repeat(64); })]], evidence.captureChecks, /green-default-limits.*no retained matching subject/));
});

test('U057 TAMPER an understated generated total is rejected by the actual generator OWN --list, even without the seal check', () => {
  assert.ok(named([[evidence.CAMPAIGN, edited(evidence.CAMPAIGN, (report) => { report.generated -= 1; report.executed -= 1; report.results.pop(); })]], evidence.mutationChecks, /generated differs from generator own --list total/));
});

test('U057 TAMPER a survivor, an undecided position, a nameless kill and a missing raw kill are never accepted', () => {
  for (const change of [
    (report) => { report.results.find((entry) => entry.killed).killed = false; report.survived = 1; },
    (report) => { report.results.find((entry) => entry.killed).undecided = 'core'; report.undecided = 1; },
    (report) => { report.results.find((entry) => entry.killed).failingTests = []; },
    (report) => { report.results.find((entry) => entry.killed).capture = null; }
  ]) assert.ok(named([[evidence.CAMPAIGN, edited(evidence.CAMPAIGN, change)]], evidence.mutationChecks, /not decided|undecided|no named kill|no unchanged equivalence proof|differs from its last actual/));
});

test('U057 TAMPER a missing original position, a fabricated extension or changed equivalence proof cannot shrink the required set', () => {
  assert.ok(named([[evidence.CAMPAIGN, edited(evidence.CAMPAIGN, (report) => { report.results.pop(); })]], evidence.mutationChecks, /position set differs/));
  const extension = 'evidence/u057/campaign-04/position-extension.json';
  assert.ok(named([[extension, edited(extension, (document) => { document.originalPositions.pop(); })]], evidence.mutationChecks, /original806 plus the explicit four-position extension/));
  const proofs = 'tests/mutants-equivalent.cjs';
  assert.ok(named([[proofs, Buffer.concat([read(proofs), Buffer.from('\n')])]], evidence.mutationChecks, /original equivalence proof bytes differ/));
});

test('U057 TAMPER a changed campaign source or generator identity is not silently repinned', () => {
  assert.ok(named([[evidence.CAMPAIGN, edited(evidence.CAMPAIGN, (report) => { report.campaign.files['server.cjs'] = '0'.repeat(64); })]], evidence.mutationChecks, /server.cjs changed after the campaign began/));
  assert.ok(named([[evidence.CAMPAIGN, edited(evidence.CAMPAIGN, (report) => { report.campaign.generator = '0'.repeat(64); })]], evidence.mutationChecks, /generator changed after the campaign began/));
});

test('U057 final default and combined-commit GREEN commands are unchanged from their genuine RED commands', () => {
  for (const [red, green] of [
    ['evidence/u057/red/red-default-limits-02.json', `${evidence.FINAL}green-default-limits.json`],
    ['evidence/u057/red/red-cancel-after-token-03.json', `${evidence.FINAL}green-commit.json`]
  ]) assert.deepEqual(evidence.json(root, red).command, evidence.json(root, green).command);
});

test('U057 TAMPER current completion prose cannot contradict the measured campaign', () => {
  const altered = Buffer.from(read('README.md').toString('utf8').replace('810 generated positions', '809 generated positions'));
  assert.ok(named([['README.md', altered]], evidence.semanticChecks, /README: current measured campaign limits\/counts/));
});

test('U057 no newly published file, including its original raw streams, carries a local user or session identifier', () => {
  const original = evidence.json(root, evidence.ORIGINAL);
  const knownOldRaw = original.files.find((entry) => entry.path === 'evidence/red/raw/red-01-ownership-behavior.stdout.raw.gz');
  const forbidden = [/[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b|Default\b|All Users\b)[^\\/\s"'`<>]+/i, /\.copilot[\\/]+session-state[\\/]+[0-9a-f]{8}-[0-9a-f]{4}-/i];
  const hits = [];
  for (const name of evidence.names(root)) {
    const bytes = read(name);
    if (name === knownOldRaw.path && evidence.sha(bytes) === knownOldRaw.rawSha256) continue;
    const text = name.endsWith('.gz') ? zlib.gunzipSync(bytes).toString('latin1') : bytes.toString('latin1');
    if (forbidden.some((pattern) => pattern.test(text))) hits.push(name);
  }
  assert.deepEqual(hits, [], 'old raw exceptions remain only at their original immutable paths');
});
