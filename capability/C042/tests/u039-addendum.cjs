'use strict';

// Test tooling, not production code (U039): writes the chained, append-only evidence addenda of the sealed card C042 (flag wx:
// an addendum is never rewritten). Usage (repository root): node capability\C042\tests\u039-addendum.cjs <1|2> [--reason "<text>"]
//   1: the amendment. Pins every file of the ACCEPTED tree (commit 6e088f54, read from git once, here) and supersedes EXACTLY
//      server.cjs and README.md; indexes the evidence archived before it (the retained first RED and the retained accepted bytes).
//   2: evidence-only. Pins addendum 1 by its raw SHA-256, indexes every evidence file archived after it and pins the files U039 added.
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
  const listed = new Set(JSON.parse(fs.readFileSync(path.join(repository, first), 'utf8')).evidence.map((item) => item.path));
  return {
    ...common, base: { commit: COMMIT, tag: TAG }, previous: { path: first, rawSha256: sha(raw(first)), canonicalLfSha256: lf(raw(first)) },
    evidence: indexed(evidenceFiles().filter((file) => !listed.has(file))), added: indexed(['capability/C042/U039.md']),
  };
}

const sequence = Number(process.argv[2]);
if (![1, 2].includes(sequence)) { console.error('usage: node u039-addendum.cjs <1|2> [--reason "<text>"]'); process.exit(2); }
const at = process.argv.indexOf('--reason');
const reason = at > 0 ? process.argv[at + 1] : `Addendum ${sequence} of U039.`;
const target = path.join(root, `evidence-addendum-${sequence}.json`);
fs.writeFileSync(target, `${JSON.stringify(addendum(sequence, reason), null, 2)}\n`, { flag: 'wx' });
console.log(`wrote ${rel(target)} (${fs.statSync(target).size} bytes)`);
