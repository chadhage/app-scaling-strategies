'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const DIRECTORY = path.join(ROOT, 'evidence', 'final-20261110');
const SNAPSHOTS = path.join(DIRECTORY, 'baseline');
const INDEX = path.join(DIRECTORY, 'baseline-index.json');
const PREDECESSOR = '0abdcb716c708cc47873b594c4d88bac1f997607';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const normal = (name) => name.replace(/\\/g, '/');

function initialize(anchor) {
  const names = execFileSync('git', ['--no-pager', 'ls-tree', '-r', '--name-only', PREDECESSOR, '--', 'capability/C014'], { cwd: anchor, encoding: 'utf8', windowsHide: true }).trim().split('\n');
  const output = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], { cwd: anchor, input: names.map((name) => `${PREDECESSOR}:${name}`).join('\n') + '\n', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  let at = 0;
  const files = {};
  for (const relative of names) {
    const end = output.indexOf(10, at);
    const [oid, type, size] = output.toString('latin1', at, end).split(' ');
    if (type !== 'blob') throw new Error('predecessor inventory is not an ordinary blob');
    const blob = output.subarray(end + 1, end + 1 + Number(size));
    at = end + 2 + Number(size);
    const name = relative.slice('capability/C014/'.length);
    const snapshot = path.join(SNAPSHOTS, name);
    const bytes = fs.readFileSync(fs.existsSync(snapshot) ? snapshot : path.join(ROOT, name));
    if (sha(lf(bytes)) !== sha(lf(blob))) throw new Error(`predecessor source witness does not match Git: ${name}`);
    files[name] = { rawSha256: sha(bytes), canonicalLfSha256: sha(lf(bytes)), gitBlob: oid, gitBlobSha256: sha(blob),
      sourceSnapshot: fs.existsSync(snapshot) ? `evidence/final-20261110/baseline/${name}` : null };
  }
  const document = { schema: 'C014-rejected-predecessor/1', commit: PREDECESSOR, tag: 'kanban/C014/0abdcb716c70',
    status: 'Rejected predecessor, preserved as history; not acceptance or current evidence.', files };
  fs.writeFileSync(INDEX, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
  return document;
}

const index = () => JSON.parse(fs.readFileSync(INDEX, 'utf8'));
function originalInput(relative) {
  const normalized = normal(relative);
  if (!normalized.startsWith('capability/C014/')) return fs.readFileSync(path.join(REPOSITORY, relative));
  const name = normalized.slice('capability/C014/'.length);
  const entry = index().files[name];
  if (!entry) throw new Error(`not a declared predecessor input: ${name}`);
  return fs.readFileSync(path.join(ROOT, entry.sourceSnapshot || name));
}
function verifyBaseline({ read = originalInput } = {}) {
  const document = index();
  const problems = [];
  if (document.commit !== PREDECESSOR || document.status !== 'Rejected predecessor, preserved as history; not acceptance or current evidence.') problems.push('predecessor identity differs');
  for (const [name, pin] of Object.entries(document.files)) {
    let bytes;
    try { bytes = read(`capability/C014/${name}`); } catch { problems.push(`predecessor: ${name} is missing`); continue; }
    if (sha(bytes) !== pin.rawSha256) problems.push(`predecessor: ${name} differs`);
    if (!pin.sourceSnapshot && sha(fs.readFileSync(path.join(ROOT, name))) !== pin.rawSha256) problems.push(`retained original: ${name} differs`);
  }
  return problems;
}
function historicalMutationEvidence() {
  const names = Object.keys(index().files).filter((name) => name.startsWith('evidence/mutants/'));
  const read = (name) => JSON.parse(originalInput(`capability/C014/${name}`));
  return {
    root: SNAPSHOTS,
    reports: names.filter((name) => /\/systematic-\d+.*\.json$/.test(name)).map(read),
    reruns: names.filter((name) => /\/rerun-\d+.*\.json$/.test(name)).map(read),
    equivalents: read('evidence/mutants/equivalents.json')
  };
}
function historicalManifests() {
  return Object.keys(index().files).filter((name) => name.endsWith('.json')).filter((name) => {
    try { return Boolean(JSON.parse(originalInput(`capability/C014/${name}`)).transcripts); } catch { return false; }
  }).map((name) => path.join(ROOT, name));
}
function historicalCapture(stem) {
  const expression = new RegExp(`^${stem}-(\\d+)$`);
  const found = historicalManifests().map((file) => ({ file, number: expression.exec(path.basename(file, '.json')) })).filter((entry) => entry.number)
    .sort((a, b) => Number(a.number[1]) - Number(b.number[1]));
  return found.length ? found.at(-1).file : null;
}
function captureOptions(file) {
  const relative = normal(path.relative(ROOT, file));
  if (Object.hasOwn(index().files, relative)) {
    const source = fs.readFileSync(path.join(SNAPSHOTS, 'tests', 'integrity.test.cjs'), 'utf8');
    const table = (name) => {
      const found = new RegExp(`const ${name} = (\\{[^]*?\\n\\});`).exec(source);
      if (!found) throw new Error('retained predecessor capture classification is missing');
      return require('node:vm').runInNewContext(`(${found[1]})`);
    };
    const key = relative.slice('evidence/'.length).replace(/\.json$/, '');
    return { readInput: originalInput, allowExit: Object.hasOwn(table('ATTEMPTS'), key), skipInputs: Object.hasOwn(table('SUPERSEDED'), key) };
  }
  const old = {
    'green-final-focused-01': { failed: true, reason: 'Rejected test attempt: the original seed phone lacked spaces; its fixture assertion failed.' },
    'green-final-canon-headers-01': { failed: true, reason: 'Rejected header oracle attempt: its independent CSP literal was wrong.' },
    'green-pre-freeze-01': { failed: true, reason: 'Retained census recorder defect: a reused Windows PID collided with an earlier immutable census filename; invocation nonces now preserve both reports.' },
    'green-replay-original-06': { failed: true, reason: 'Retained verification-only oracle defect: all original assertions and both natural named reviewer-mutant kills passed, but the wrapper rejected the legitimate closed-shape-order killer name.' }
  };
  const name = path.basename(file, '.json');
  const privateRoot = process.env.C014_PRIVATE_EVIDENCE || path.join(REPOSITORY, 'private-evidence');
  const inputs = path.join(privateRoot, 'captures', name, 'inputs');
  const retained = { 'red-final-behavior-01': 'red-subject', 'red-final-flood-01': 'red-subject', 'red-final-plus-02': 'red-plus-subject', 'red-final-tooling-01': 'red-tooling-subject' };
  const subject = fs.existsSync(inputs) ? inputs : retained[name] ? path.join(DIRECTORY, retained[name]) : null;
  if (subject) return { readInput: (relative) => fs.readFileSync(path.join(subject, relative)), allowExit: Boolean(old[name]?.failed) };
  const nonqualifying = ['green-final-focused-01', 'green-final-focused-02', 'green-final-canon-headers-01', 'green-final-canon-headers-02', 'red-final-adjacency-01'];
  if (nonqualifying.includes(name)) {
    return { skipInputs: true, allowExit: Boolean(old[name]?.failed), historyReason: old[name]?.reason || 'Retained pre-freeze development capture; not claimed as current source evidence.' };
  }
  return {};
}

if (require.main === module) {
  const document = initialize(process.env.C014_GIT_ANCHOR || REPOSITORY);
  console.log(`Preserved ${Object.keys(document.files).length} rejected predecessor blobs; no old file was rewritten.`);
}
module.exports = { ROOT, REPOSITORY, DIRECTORY, SNAPSHOTS, INDEX, PREDECESSOR, sha, lf, index, originalInput, verifyBaseline, historicalMutationEvidence, historicalManifests, historicalCapture, captureOptions };
