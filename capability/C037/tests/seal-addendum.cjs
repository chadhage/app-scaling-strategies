'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scan, latestGreen, evidenceFiles } = require('./evidence.cjs');
const { hash, normalize } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact explicit own evidence addendum only.');
const directory = path.resolve(process.env.C037_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^addendum-[0-9a-f-]{36}$/);
assert.deepEqual(fs.readdirSync(directory), []);
// The sealed index is never rewritten: each addendum chains to the previous index by hash and lists only files no earlier index lists.
const addenda = fs.readdirSync(root).map((name) => /^evidence-index\.addendum-([1-9][0-9]*)\.json$/.exec(name)).filter(Boolean)
  .sort((a, b) => Number(a[1]) - Number(b[1]));
assert.deepEqual(addenda.map((match) => Number(match[1])), addenda.map((_, index) => index + 1), 'Consecutive addendum numbers only.');
const chain = ['evidence-index.json', ...addenda.map((match) => match[0])];
const indexed = new Set();
for (const name of chain) for (const entry of JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')).files) indexed.add(entry.path);
// The previous index is hashed LF-canonical so the chain also holds in a CRLF checkout of the text index files.
const previousBytes = normalize(fs.readFileSync(path.join(root, chain.at(-1))));
const sequence = addenda.length + 1;
const { runs, emptyUnqualifiedDirectories: scanned } = scan();
const emptyUnqualifiedDirectories = scanned.filter((name) => name !== path.relative(root, directory));
const latest = Object.fromEntries(['coverbdd', 'coverage', 'focused', 'syntax', 'browser'].map((stage) => [stage, latestGreen(runs, stage).directory]));
const red = runs.find((run) => run.stage === 'coverred' && run.exitCode === 1);
assert.ok(red, 'The archived coverage-bar RED must exist before the addendum.');
latest.coverred = red.directory;
const files = evidenceFiles().filter((file) => !indexed.has(file.path));
const value = {
  schemaVersion: 1, cardId: 'C037', sealedAtUtc: new Date().toISOString(), role: 'append-only-evidence-addendum', sequence,
  previousIndex: { path: chain.at(-1), rawSha256: hash(previousBytes), size: previousBytes.length },
  currentAuthority: false, originalSProposed: 1, extraTestRepairCredits: 0,
  ownRunDirectory: path.relative(root, directory),
  latest, capturedRuns: runs.length, retainedNonzeroRuns: runs.filter((run) => run.exitCode !== 0).map((run) => ({
    directory: run.directory, stage: run.stage, exitCode: run.exitCode
  })),
  emptyUnqualifiedDirectories, files
};
const bytes = `${JSON.stringify(value, null, 2)}\n`;
fs.writeFileSync(path.join(root, `evidence-index.addendum-${sequence}.json`), bytes, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'addendum.json'), bytes, { flag: 'wx' });
console.log(`Addendum ${sequence} chains to ${chain.at(-1)} and lists ${files.length} newly retained evidence files across ${runs.length} raw runs; the sealed index is unchanged.`);
