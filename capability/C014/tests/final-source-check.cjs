'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, index, sha, lf, verifyBaseline } = require('./final-base.cjs');
const { verifySource } = require('./final-phase.cjs');
const { verify, verifyGit } = require('./final-browser-imports.cjs');
const anchor = process.env.C014_GIT_ANCHOR;
assert.ok(anchor && path.isAbsolute(anchor), 'the immutable Git/live-byte observation root is explicit');
assert.deepEqual(verifyBaseline(), []);
assert.deepEqual(verifySource(), []);
assert.deepEqual(verify(), []);
assert.deepEqual(verifyGit(anchor), []);
const old = index().files;
for (const [name, pin] of Object.entries(old)) assert.equal(sha(fs.readFileSync(path.join(anchor, 'capability', 'C014', name))), pin.rawSha256, `original live C014 unchanged: ${name}`);
const imports = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json')));
for (const [name, pin] of Object.entries(imports.imports)) assert.equal(sha(lf(fs.readFileSync(path.join(anchor, name)))), pin.canonicalLfSha256, `read-only producer unchanged: ${name}`);
const references = [];
function walk(directory, relative) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['evidence', 'node_modules', 'scratch', '.git', 'C014'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) walk(file, name);
    else if (/\.(cjs|js)$/.test(entry.name)) {
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes('C014')) {
        const requireReference = /require\(\s*['"][^'"]*C014[\\/]/.test(source);
        references.push({ path: name, sha256: sha(Buffer.from(source)), requireReference });
      }
    }
  }
}
for (const name of ['capability', 'testing', 'learning']) walk(path.join(anchor, name), name);
assert.ok(references.every((entry) => !entry.requireReference), 'a newly discovered importing consumer requires separate parent disposition');
console.log(JSON.stringify({ schema: 'C014-source-git-consumer-audit/1', ok: true, originalLiveFilesUnchanged: Object.keys(old).length,
  importedProducerFilesUnchanged: Object.keys(imports.imports).length, existingOwningTagVerified: true, references,
  limits: 'Reference inventory is read-only. No consumer pin or source was rewritten; exact runtime imports were not found.' }, null, 2));
