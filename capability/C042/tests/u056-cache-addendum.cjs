'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const NS = 'capability/C042';
const EVIDENCE = `${NS}/evidence/u056-cache-invalidation`;
const CHANGED = ['README.md', 'U039.md', 'tests/u039-evidence.test.cjs', 'tests/u056-evidence.test.cjs'].map((name) => `${NS}/${name}`).sort();
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => sha(Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
const read = (name) => fs.readFileSync(path.join(repository, name));
const pin = (name) => ({ path: name, rawSha256: sha(read(name)), canonicalLfSha256: canonical(read(name)) });
function walk(directory, prefix = NS) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}/${entry.name}`;
    assert.equal(entry.isSymbolicLink(), false);
    if (name === `${NS}/tests/scratch` || name === `${NS}/data`) return [];
    return entry.isDirectory() ? walk(path.join(directory, entry.name), name) : [name];
  });
}
const pins = new Map();
const authorities = new Set();
for (let sequence = 1; sequence <= 4; sequence += 1) {
  const name = `${NS}/evidence-addendum-${sequence}.json`;
  authorities.add(name);
  const json = JSON.parse(read(name).toString('utf8'));
  for (const [file, rawSha256] of Object.entries(json.base?.files ?? {})) if (!pins.has(file)) pins.set(file, { rawSha256, canonicalLfSha256: json.base.canonicalLfFiles[file] });
  for (const item of [...(json.amendments ?? []), ...(json.supersedes ?? []), ...(json.evidence ?? []), ...(json.added ?? [])]) pins.set(item.path, item);
}
const previous = `${NS}/evidence-addendum-4.json`;
assert.equal(sha(read(previous)), '1375060ff63fe1c40750d7767139c3c9407f3399c60ec735a365324d5952c574');
assert.deepEqual([...pins.keys()].filter((name) => sha(read(name)) !== pins.get(name).rawSha256).sort(), CHANGED);
const supersedes = CHANGED.map((name) => {
  const prior = pins.get(name);
  const retained = `${EVIDENCE}/retained/${path.posix.basename(name)}.txt`;
  assert.equal(sha(read(retained)), prior.rawSha256);
  assert.equal(canonical(read(retained)), prior.canonicalLfSha256);
  return { ...pin(name), previousRawSha256: prior.rawSha256, previousCanonicalLfSha256: prior.canonicalLfSha256, retained,
    edit: 'Independent-review cache regression: validate mutable Buffer content before cache reuse, preserve historical manifest versions and document the witnessed repair.' };
});
const files = walk(root);
const production = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort();
assert.equal(production.length, 8);
for (const name of production) assert.equal(sha(read(`${NS}/${name}`)), pins.get(`${NS}/${name}`).rawSha256);
const result = {
  schema: 'C042-evidence-addendum/1', cardId: 'C042', item: 'U056', sequence: 5,
  reason: 'Correct the independent-review regression in addendum-4 mutable Buffer caches; zero credit, no production or live change.',
  previous: pin(previous), supersedes, evidence: files.filter((name) => name.startsWith(`${EVIDENCE}/`)).sort().map(pin),
  added: files.filter((name) => !pins.has(name) && !authorities.has(name) && name !== `${NS}/evidence-addendum-5.json` && !name.startsWith(`${EVIDENCE}/`)).sort().map(pin),
  retainedAttempts: [], priorCandidateIdentitySha256: '117ceb4817c1687897a5a33fbbb16c115aa9a16945cbe2f6fe5c921009581351',
  coverage: { status: 'not-applicable', productionFiles: production, proof: `${EVIDENCE}/production-unchanged.json`, reason: 'All eight production files remain byte-exact; changed and added executable files are verification-only tests/tools.' },
  systematicAllFourFixesGenerator: 'Explicitly absent; no new all-four-fixes campaign claimed.',
  reviewerMutantJ: { manifest: `${EVIDENCE}/mutant-02-reviewer-J.json`, timeoutAsKill: false },
  liveApplication: false, publication: false, qualification: false
};
fs.writeFileSync(path.join(root, 'evidence-addendum-5.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log('Wrote append-only addendum 5; addenda 1-4 and all production bytes remain unchanged.');
