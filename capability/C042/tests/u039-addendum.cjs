'use strict';

// Test tooling, not production code (U039): writes the chained, append-only evidence addenda of the sealed card C042 (flag wx:
// an addendum is never rewritten once it is published; an unpublished one is deleted and written again). Usage (repository root):
//   node capability\C042\tests\u039-addendum.cjs <1|2|3> [--reason "<text>"] [--retained <name,name,...>]
//   1: the amendment. Pins every file of the ACCEPTED tree (commit 6e088f54, read from git once, here) and supersedes EXACTLY
//      server.cjs and README.md; indexes the evidence archived before it (the retained first RED and the retained accepted bytes).
//   2: evidence-only. Pins addendum 1 by its raw SHA-256, indexes every evidence file archived after it and pins the files U039 added.
//   3: the fourth fix (a client error for a request that is still reading its body). Pins addendum 2 byte for byte, SUPERSEDES by name every pinned file
//      the fix changed (the hashes it replaces, a retained copy of the replaced bytes kept before the edit, the new hashes), indexes the new evidence
//      directory and pins the files the fix added. A pinned file that changed without a supersession is an error of this tool.
// The test tests\u039-evidence.test.cjs verifies the chain without git. Paths are repository-relative with forward slashes.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const COMMIT = '6e088f54beed052bba20e0910f49aca1d583d293';
const TAG = 'kanban/C042/6e088f54beed';
const EVIDENCE = 'capability/C042/evidence/u039-pipelining';
const EVIDENCE_3 = 'capability/C042/evidence/u039-incomplete-bodies';
// Every file the chain pinned before addendum 3 that the fourth fix changes: the copy of the replaced bytes (kept in EVIDENCE_3 BEFORE the edit) and what changed.
const SUPERSEDED = [
  ['capability/C042/server.cjs', 'server.v3-published-146d8f0.cjs.txt', 'A client error Node reports for the request it is still receiving (request.complete is false: a bad chunk size, a body cut by the request timeout or by the client FIN) is answered at once after the requests BEFORE it; the refusal no longer waits for that request own lane entry (a body that cannot end). A request that Node never finished receiving is dropped after its own turn, so it never answers twice. A complete request still waits for its own answer.'],
  ['capability/C042/README.md', 'README.v3-published-146d8f0.md.txt', 'The Responses and Connections bullets state what is true for incomplete bodies (typed 400 or 408 and a closed connection), and one line per wait says what it waits for, what finishes it and why it can never wait for the request being refused; the limits of U039.md are named.'],
  ['capability/C042/U039.md', 'U039.v2-published-146d8f0.md.txt', 'The fourth fix, its evidence and its limits (an Upgrade-flagged request drops what follows it, strict per-connection order, a refusal lost to a reset, the fifth pipelined request).'],
  ['capability/C042/tests/u039-mutants.cjs', 'u039-mutants.v2-published-146d8f0.cjs.txt', 'The mutants follow the changed lines; M29 to M31 (the three named mutants of the fourth fix) are added and M11 is killed by a deterministic test.'],
  ['capability/C042/tests/u039-mutants.test.cjs', 'u039-mutants.test.v2-published-146d8f0.cjs.txt', 'The mutant list is tied to the titles of the new tests.'],
  ['capability/C042/tests/u039-mutate-gen.cjs', 'u039-mutate-gen.v2-published-146d8f0.cjs.txt', 'The systematic generator also mutates the lines of the fourth fix (with two more operators) and judges them with the new tests.'],
  ['capability/C042/tests/u039-evidence.test.cjs', 'u039-evidence.test.v2-published-146d8f0.cjs.txt', 'The chain check knows supersessions: the pin in force is the one of the last addendum that names a path.'],
  ['capability/C042/tests/u039-addendum.cjs', 'u039-addendum.v2-published-146d8f0.cjs.txt', 'Writes addendum 3.'],
];
const AMENDABLE = ['capability/C042/README.md', 'capability/C042/server.cjs'];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => sha(Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
const rel = (file) => path.relative(repository, file).split(path.sep).join('/');
const raw = (relative) => fs.readFileSync(path.join(repository, relative));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [rel(file)];
  });
}

const git = (...args) => execFileSync('git', args, { cwd: repository, maxBuffer: 256 * 1024 * 1024 });

function acceptedTree() {
  const names = git('ls-tree', '-r', '--name-only', COMMIT, '--', 'capability/C042').toString('utf8').split('\n').filter(Boolean);
  const blobs = names.map((name) => [name, git('cat-file', 'blob', `${COMMIT}:${name}`)]);
  return { raw: Object.fromEntries(blobs.map(([name, bytes]) => [name, sha(bytes)])), lf: Object.fromEntries(blobs.map(([name, bytes]) => [name, lf(bytes)])) };
}

const indexed = (files) => files.sort().map((file) => ({ path: file, rawSha256: sha(raw(file)), canonicalLfSha256: lf(raw(file)) }));
const evidenceFiles = () => walk(path.join(repository, EVIDENCE.replaceAll('/', path.sep)));

function addendum(sequence, reason) {
  const at = process.argv.indexOf('--retained');
  const retainedAttempts = at > 0 ? process.argv[at + 1].split(',') : [];
  const common = { schema: 'C042-evidence-addendum/1', cardId: 'C042', sequence, item: 'U039', reason, retainedAttempts };
  if (sequence === 1) {
    const base = acceptedTree();
    const amendments = AMENDABLE.map((file) => ({
      path: file, previousRawSha256: base.raw[file], previousCanonicalLfSha256: base.lf[file],
      retained: `${EVIDENCE}/${path.basename(file) === 'server.cjs' ? 'server.v1.cjs.txt' : 'README.v1.md.txt'}`, rawSha256: sha(raw(file)), canonicalLfSha256: lf(raw(file)),
      edit: file.endsWith('server.cjs')
        ? 'Every refusal (status 300 or above, or an unread body) marks its connection synchronously with request.socket and closes it after the flush; an ordered per-connection queue makes a pipelined request start only after the answer before it; checkContinue, checkExpectation, clientError and connect listeners and requireHostHeader false route the answers Node gives itself through the same rule; a refusal Node decides at parse time (a parse error, CONNECT) is written once, after the answers of the requests pipelined before it, and does not mark the connection closing.'
        : 'The Resource bounds bullet on responses now says that EVERY refusal closes the connection and that a request pipelined behind it never runs (it said only unread bodies were closed).',
    }));
    const added = walk(path.join(root, 'tests')).filter((file) => /\/tests\/u039-[^/]+$/.test(file)).concat(['capability/C042/U039.feature']);
    return { ...common, base: { commit: COMMIT, tag: TAG, files: base.raw, canonicalLfFiles: base.lf }, previous: null, amendable: AMENDABLE, amendments, evidence: indexed(evidenceFiles()), added: indexed(added) };
  }
  const first = 'capability/C042/evidence-addendum-1.json';
  if (sequence === 3) return third(common);
  const listed = new Set(JSON.parse(fs.readFileSync(path.join(repository, first), 'utf8')).evidence.map((item) => item.path));
  return {
    ...common, base: { commit: COMMIT, tag: TAG }, previous: { path: first, rawSha256: sha(raw(first)), canonicalLfSha256: lf(raw(first)) },
    evidence: indexed(evidenceFiles().filter((file) => !listed.has(file))), added: indexed(['capability/C042/U039.md']),
  };
}

// The pin in force before addendum 3 for every path the chain names: the amendments and the index entries of addenda 1 and 2.
function pinsBefore() {
  const pins = new Map();
  const one = JSON.parse(raw('capability/C042/evidence-addendum-1.json').toString('utf8'));
  const two = JSON.parse(raw('capability/C042/evidence-addendum-2.json').toString('utf8'));
  for (const item of one.amendments) pins.set(item.path, { raw: item.rawSha256, lf: item.canonicalLfSha256 });
  for (const item of [...one.evidence, ...one.added, ...two.evidence, ...two.added]) pins.set(item.path, { raw: item.rawSha256, lf: item.canonicalLfSha256 });
  return pins;
}

function third(common) {
  const second = 'capability/C042/evidence-addendum-2.json';
  const pins = pinsBefore();
  const changed = [...pins.keys()].filter((file) => !fs.existsSync(path.join(repository, file)) || sha(raw(file)) !== pins.get(file).raw).sort();
  const named = SUPERSEDED.map(([file]) => file).sort();
  if (JSON.stringify(changed) !== JSON.stringify(named)) throw new Error(`the pinned files that changed (${changed.join(', ')}) are not exactly the files named for supersession (${named.join(', ')})`);
  const supersedes = SUPERSEDED.map(([file, kept, edit]) => {
    const retained = `${EVIDENCE_3}/${kept}`;
    const before = raw(retained);
    if (sha(before) !== pins.get(file).raw || lf(before) !== pins.get(file).lf) throw new Error(`${retained} is not the replaced bytes of ${file}`);
    return { path: file, previousRawSha256: pins.get(file).raw, previousCanonicalLfSha256: pins.get(file).lf, retained, rawSha256: sha(raw(file)), canonicalLfSha256: lf(raw(file)), edit };
  });
  const superseded = new Set(named);
  const fresh = walk(path.join(root, 'tests')).filter((file) => /\/tests\/u039-[^/]+$/.test(file) && !pins.has(file) && !superseded.has(file))
    .concat(['capability/C042/U039-incomplete.feature'].filter((file) => !pins.has(file)));
  return {
    ...common, base: { commit: COMMIT, tag: TAG }, previous: { path: second, rawSha256: sha(raw(second)), canonicalLfSha256: lf(raw(second)) },
    supersedes, evidence: indexed(walk(path.join(repository, EVIDENCE_3.replaceAll('/', path.sep)))), added: indexed(fresh),
  };
}

const sequence = Number(process.argv[2]);
if (![1, 2, 3].includes(sequence)) { console.error('usage: node u039-addendum.cjs <1|2|3> [--reason "<text>"] [--retained <name,...>]'); process.exit(2); }
const at = process.argv.indexOf('--reason');
const reason = at > 0 ? process.argv[at + 1] : `Addendum ${sequence} of U039.`;
const target = path.join(root, `evidence-addendum-${sequence}.json`);
fs.writeFileSync(target, `${JSON.stringify(addendum(sequence, reason), null, 2)}\n`, { flag: 'wx' });
console.log(`wrote ${rel(target)} (${fs.statSync(target).size} bytes)`);
