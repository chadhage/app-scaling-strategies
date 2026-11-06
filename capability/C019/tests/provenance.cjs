'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inventory(target = root, skip = new Set(['publication.json', 'test-scratch'])) {
  const result = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(target, full);
      if (skip.has(relative)) continue;
      assert.equal(entry.isSymbolicLink(), false, 'Verification will not follow unexpected links.');
      if (entry.isDirectory()) walk(full);
      else {
        assert.equal(entry.isFile(), true);
        result[relative] = sha(fs.readFileSync(full));
      }
    }
  }
  walk(target);
  return result;
}

// The sealed evidence-index.json is never rewritten. The accepted dependency list is pinned in the append-only addenda
// evidence-index-addendum-N.json, each chained to its predecessor by an LF-canonical hash, so the chain also holds in a CRLF checkout.
const lfSha = (bytes) => sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const addendumName = /^evidence-index-addendum-([1-9][0-9]*)\.json$/;
const acceptedRoots = Object.freeze(['capability\\C001\\', 'capability\\C002\\', 'capability\\C015\\']);
const acceptedHelper = 'testing\\browser\\isolated.cjs';

function acceptedName(name) {
  return typeof name === 'string' && (name === acceptedHelper || acceptedRoots.some((prefix) => name.startsWith(prefix))) &&
    !/[:/\0]/.test(name) && name.split('\\').every((piece) => piece !== '' && piece !== '.' && piece !== '..');
}

function acceptedDependencies(directory = root) {
  const names = fs.readdirSync(directory).map((name) => addendumName.exec(name)).filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  assert.ok(names.length > 0, 'The accepted dependency list is pinned in evidence-index-addendum-1.json.');
  assert.deepEqual(names.map((match) => Number(match[1])), names.map((_, index) => index + 1), 'Consecutive addendum numbers only.');
  const files = {};
  let previous = 'evidence-index.json';
  for (const [position, match] of names.entries()) {
    const value = JSON.parse(fs.readFileSync(path.join(directory, match[0]), 'utf8'));
    assert.equal(value.schema, 'C019-evidence-index-addendum/1', 'Unknown addendum schema.');
    assert.equal(value.cardId, 'C019');
    assert.equal(value.sequence, position + 1, 'Each addendum states its own sequence number.');
    assert.equal(value.previousIndex?.path, previous, 'Each addendum names its predecessor.');
    assert.equal(value.previousIndex.rawSha256, lfSha(fs.readFileSync(path.join(directory, previous))),
      'The predecessor changed since this addendum was sealed.');
    if (value.dependencyScope !== undefined) {
      const scope = value.dependencyScope.files;
      assert.ok(scope !== null && typeof scope === 'object' && !Array.isArray(scope), 'dependencyScope.files must be an object.');
      assert.equal(value.dependencyScope.count, Object.keys(scope).length, 'The addendum count does not match its files.');
      for (const [file, digest] of Object.entries(scope)) {
        assert.ok(acceptedName(file), `Pinned dependency path is outside the accepted dependency roots: ${file}`);
        assert.match(digest, /^[0-9a-f]{64}$/, `Pinned digest must be a lower-case SHA-256: ${file}`);
        assert.equal(Object.hasOwn(files, file), false, `Dependency file is already pinned by an earlier addendum: ${file}`);
        files[file] = digest;
      }
    }
    previous = match[0];
  }
  return Object.freeze({ files: Object.freeze(files), addenda: Object.freeze(names.map((match) => match[0])) });
}

// Exactly the pinned accepted files are hashed. A file added next to them changes nothing; a changed byte or a missing file does.
function dependencies(base = repo, accepted = acceptedDependencies().files) {
  const result = {};
  for (const file of Object.keys(accepted)) {
    const full = path.join(base, file);
    assert.equal(fs.existsSync(full), true, `Accepted dependency file is missing: ${file}`);
    const stat = fs.lstatSync(full);
    assert.equal(stat.isSymbolicLink(), false, 'Verification will not follow unexpected links.');
    assert.equal(stat.isFile(), true, `Accepted dependency is not a regular file: ${file}`);
    result[file] = sha(fs.readFileSync(full));
  }
  return result;
}

module.exports = Object.freeze({ root, repo, sha, lfSha, inventory, dependencies, acceptedDependencies });
