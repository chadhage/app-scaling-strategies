'use strict';

// Test tooling: append U056's fourth addendum from the namespace bytes, without HEAD, the index or a publisher.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const NS = 'capability/C042';
const EVIDENCE = `${NS}/evidence/u056-residuals`;
const CHANGED = ['README.md', 'U039.md', 'tests/u039-body-rows.cjs', 'tests/u039-evidence.test.cjs', 'tests/u039-incomplete-evidence.test.cjs'].map((name) => `${NS}/${name}`).sort();
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => sha(Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
const read = (name) => fs.readFileSync(path.join(repository, name));
const pin = (name) => ({ path: name, rawSha256: sha(read(name)), canonicalLfSha256: lf(read(name)) });
function walk(directory, prefix = NS) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}/${entry.name}`;
    assert.equal(entry.isSymbolicLink(), false, `${name} is not a linked input`);
    if (name === `${NS}/tests/scratch` || name === `${NS}/data`) return [];
    return entry.isDirectory() ? walk(path.join(directory, entry.name), name) : [name];
  });
}
function build() {
  const pins = new Map();
  const addendumNames = [];
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const name = `${NS}/evidence-addendum-${sequence}.json`;
    addendumNames.push(name);
    const json = JSON.parse(read(name).toString('utf8'));
    assert.equal(json.item, 'U039');
    for (const [file, rawSha256] of Object.entries(json.base.files ?? {})) {
      if (!pins.has(file)) pins.set(file, { rawSha256, canonicalLfSha256: json.base.canonicalLfFiles[file] });
    }
    for (const item of [...(json.amendments ?? []), ...(json.supersedes ?? []), ...(json.evidence ?? []), ...(json.added ?? [])]) pins.set(item.path, item);
  }
  const changed = [...pins.keys()].filter((name) => sha(read(name)) !== pins.get(name).rawSha256).sort();
  assert.deepEqual(changed, CHANGED, 'only the five named non-production paths may supersede accepted bytes');
  const supersedes = CHANGED.map((name) => {
    const previous = pins.get(name);
    const retained = `${EVIDENCE}/retained/${path.posix.basename(name)}.txt`;
    assert.equal(sha(read(retained)), previous.rawSha256, `${retained} is byte-exact`);
    assert.equal(lf(read(retained)), previous.canonicalLfSha256);
    return { ...pin(name), previousRawSha256: previous.rawSha256, previousCanonicalLfSha256: previous.canonicalLfSha256, retained,
      edit: name.endsWith('README.md') || name.endsWith('U039.md') ? 'Approved Upgrade exception, attributed pending-socket cost, strict-default evidence limits and honest residual campaign scope.' : 'Verification-only residual rows, shared immutable snapshot/digest cache or six-row nested RED selection.' };
  });
  const files = walk(root);
  const added = files.filter((name) => !pins.has(name) && !addendumNames.includes(name) && name !== `${NS}/evidence-addendum-4.json` && !name.startsWith(`${EVIDENCE}/`));
  const third = `${NS}/evidence-addendum-3.json`;
  return {
    schema: 'C042-evidence-addendum/1', cardId: 'C042', item: 'U056', sequence: 4,
    reason: 'F1-F5 residuals after U039, zero credit, approved documentation narrowing; production unchanged.',
    base: (({ commit, tag }) => ({ commit, tag }))(JSON.parse(read(`${NS}/evidence-addendum-1.json`).toString('utf8')).base),
    previous: pin(third),
    supersedes, evidence: files.filter((name) => name.startsWith(`${EVIDENCE}/`)).sort().map(pin), added: added.sort().map(pin),
    retainedAttempts: [],
    coverage: { status: 'not-applicable', proof: `${EVIDENCE}/production-unchanged.json`, productionFiles: ['contract.js', 'engine.cjs', 'input.cjs', 'journal.cjs', 'page.js', 'result.cjs', 'server.cjs', 'transcript.cjs'] },
    systematicAllFourFixesGenerator: { status: 'absent', claim: 'No new all-four-fixes campaign is claimed. Historical fix-4 and earlier campaigns remain unchanged.' },
    reviewerMutantJ: { status: 'killed-by-named-assertion', manifest: `${EVIDENCE}/mutant-01-reviewer-J.json`, test: 'mutant J: dropping a request releases its lane entry before the event-loop barrier', timeoutAsKill: false },
    limits: { browser: 'No browser started; U034 remains unmet.', qualification: false, liveApplication: false, publication: false }
  };
}
if (require.main === module) {
  const target = path.join(root, 'evidence-addendum-4.json');
  fs.writeFileSync(target, `${JSON.stringify(build(), null, 2)}\n`, { flag: 'wx' });
  console.log('Wrote capability/C042/evidence-addendum-4.json once; predecessor bytes and all historical authority stay unchanged.');
}
module.exports = { build };
