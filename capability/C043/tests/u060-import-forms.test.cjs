'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const test = require('node:test');
const TITLE = 'every imported file is pinned and the pins are recomputed against git at the accepted commit, never trusted from the file';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const original = process.argv.includes('--original');
const sourceFile = original ? path.join(__dirname, '..', 'evidence', 'u060-final', 'superseded', 'tests', 'surface.test.cjs.txt') : path.join(__dirname, 'surface.test.cjs');
const source = fs.readFileSync(sourceFile, 'utf8');

function fixture({ workingForm = 'CRLF', drift = false, corruptAccepted = false, corruptCanonical = false } = {}) {
  const accepted = {
    C042: { tag: 'kanban/C042/fixture', commit: 'a'.repeat(40) },
    C001: { tag: 'kanban/C001/fixture', commit: 'b'.repeat(40) },
  };
  const imports = {};
  const blobs = new Map();
  const working = new Map();
  for (let index = 0; index < 6; index += 1) {
    const card = index < 4 ? 'C042' : 'C001';
    const relative = `capability/${card}/fixture-${index}.cjs`;
    const canonical = Buffer.from(`module.exports = Object.freeze({ fixture: ${index} });\n`);
    const blob = index < 4 ? Buffer.from(canonical.toString('utf8').replace(/\n/g, '\r\n')) : canonical;
    const bytes = workingForm === 'LF' ? canonical : Buffer.from(canonical.toString('utf8').replace(/\n/g, '\r\n'));
    const gitBlob = createHash('sha1').update(`blob ${blob.length}\0`).update(blob).digest('hex');
    imports[relative] = { card, gitBlob, acceptedGitSha256: sha(blob), rawSha256: sha(blob), canonicalLfSha256: sha(canonical) };
    blobs.set(`${accepted[card].commit}:${relative}`, blob);
    working.set(path.resolve(__dirname, '..', '..', '..', relative), bytes);
  }
  const first = Object.keys(imports)[0];
  if (drift) working.set(path.resolve(__dirname, '..', '..', '..', first), Buffer.from('module.exports = "changed code";\n'));
  if (corruptAccepted) imports[first].acceptedGitSha256 = '0'.repeat(64);
  if (corruptCanonical) imports[first].canonicalLfSha256 = '0'.repeat(64);
  return { pins: { accepted, imports }, blobs, working };
}

function runImportAssertion(data) {
  const callbacks = [];
  const unexpected = () => { throw new Error('UNEXPECTED_IMPORT_FIXTURE_OPERATION'); };
  const fakeFs = {
    readdirSync: () => [],
    readFileSync(file, encoding) {
      if (path.basename(file) === 'imports.json') return JSON.stringify(data.pins);
      const bytes = data.working.get(path.resolve(file));
      assert.ok(bytes, `known working fixture ${file}`);
      return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
    },
  };
  const fakeRequire = (name) => {
    if (name === 'node:test') return (title, options, callback) => { if (title === TITLE) callbacks.push(callback); };
    if (name === 'node:fs') return fakeFs;
    if (name === './evidence.cjs') return { sha, verifyManifest: unexpected };
    if (name === './support.cjs') return { assert, cleanup: unexpected, scratch: unexpected };
    if (name === 'node:child_process') return {
      spawnSync: unexpected,
      execFileSync(command, args) {
        assert.equal(command, 'git');
        assert.equal(args[0], '--no-pager');
        const [operation, ...values] = args.slice(1);
        if (operation === 'cat-file') {
          assert.equal(values[0], 'blob');
          const bytes = data.blobs.get(values[1]);
          assert.ok(bytes);
          return Buffer.from(bytes);
        }
        assert.equal(operation, 'rev-parse');
        const accepted = Object.values(data.pins.accepted).find((entry) => values[0] === `${entry.tag}^{commit}`);
        if (accepted) return Buffer.from(`${accepted.commit}\n`);
        const relative = values[0].slice(41);
        const pin = data.pins.imports[relative];
        assert.ok(pin);
        return Buffer.from(`${pin.gitBlob}\n`);
      },
    };
    return require(name);
  };
  vm.compileFunction(source, ['require', '__dirname', 'module'], { filename: 'capability\\C043\\tests\\surface.test.cjs' })(fakeRequire, __dirname, { exports: {} });
  assert.equal(callbacks.length, 1, 'the actual named import assertion is selected, not reimplemented');
  callbacks[0]();
}

test('U060 import forms admit canonical LF working bytes of an accepted CRLF blob', () => {
  assert.doesNotThrow(() => runImportAssertion(fixture({ workingForm: 'LF' })));
});
test('U060 import forms preserve accepted raw CRLF working bytes', () => {
  assert.doesNotThrow(() => runImportAssertion(fixture()));
});
test('U060 import forms reject working code drift, not merely a line-ending change', () => {
  assert.throws(() => runImportAssertion(fixture({ drift: true })), /working bytes are the accepted bytes/);
});
test('U060 import forms recompute the accepted blob identity', () => {
  assert.throws(() => runImportAssertion(fixture({ corruptAccepted: true })), /the accepted blob/);
});
test('U060 import forms recompute the canonical pin even when a raw working hash matches', () => {
  assert.throws(() => runImportAssertion(fixture({ corruptCanonical: true })), /canonical.*accepted|accepted.*canonical/);
});
