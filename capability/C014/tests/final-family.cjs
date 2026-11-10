'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, REPOSITORY, SNAPSHOTS, PREDECESSOR, sha, lf, index } = require('./final-base.cjs');
const PRODUCTION = ['canon.cjs', 'redact.cjs', 'vault.cjs', 'evidence.cjs', 'service.cjs', 'server.cjs', 'page.js'];
const ASSETS = ['index.html', 'style.css'];
const TESTS = ['final-review.test.cjs', 'final-overlap.test.cjs', 'process-flood.test.cjs', 'harness.cjs', 'canaries.cjs', 'scanner.cjs',
  'dom-stub.cjs', 'child.cjs', 'child-server.cjs', 'flood-attacker.cjs', 'pending-attacker.cjs', 'scratch-cwd.cjs'];
function prepare(label) {
  assert.ok(['old', 'green'].includes(label));
  const directory = path.join(ROOT, 'evidence', 'final-20261110', `family-${label}`);
  assert.equal(fs.existsSync(directory), false, 'a subject fixture is immutable once created');
  const subject = path.join(directory, 'capability', 'C014');
  const imported = path.join(directory, 'capability', 'C009');
  fs.mkdirSync(path.join(subject, 'tests', 'scratch'), { recursive: true });
  fs.mkdirSync(imported, { recursive: true });
  const files = [];
  for (const name of [...PRODUCTION, ...ASSETS]) {
    const source = path.join(label === 'old' ? SNAPSHOTS : ROOT, name);
    const bytes = fs.readFileSync(source);
    if (label === 'old') assert.equal(sha(lf(bytes)), index().files[name].canonicalLfSha256, `${name}: actual rejected predecessor bytes`);
    const target = path.join(subject, name);
    fs.writeFileSync(target, bytes, { flag: 'wx' });
    files.push(path.relative(REPOSITORY, target));
  }
  for (const name of TESTS) {
    const source = label === 'old' && name === 'child-server.cjs' ? path.join(SNAPSHOTS, 'tests', name) : path.join(ROOT, 'tests', name);
    const target = path.join(subject, 'tests', name);
    fs.writeFileSync(target, fs.readFileSync(source), { flag: 'wx' });
    files.push(path.relative(REPOSITORY, target));
  }
  const imports = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json')));
  for (const relative of Object.keys(imports.imports)) {
    const bytes = fs.readFileSync(path.join(REPOSITORY, relative));
    assert.equal(sha(lf(bytes)), imports.imports[relative].canonicalLfSha256, 'the read-only C009 producer matches its existing pin');
    const target = path.join(imported, path.basename(relative));
    fs.writeFileSync(target, bytes, { flag: 'wx' });
    files.push(path.relative(REPOSITORY, target));
  }
  fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify(files.sort(), null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'subject.json'), JSON.stringify({ schema: 'C014-final-behavioral-subject/1', label,
    predecessor: label === 'old' ? PREDECESSOR : null,
    description: label === 'old' ? 'Actual rejected production bytes with the final unchanged assertion family; missing behavior must fail by assertion.'
      : 'Current production bytes and observer with byte-identical tests; the same assertions must pass.',
    files: Object.fromEntries(files.map((file) => [file.replace(/\\/g, '/'), sha(fs.readFileSync(path.join(REPOSITORY, file)))])) }, null, 2) + '\n', { flag: 'wx' });
  return path.relative(REPOSITORY, directory);
}
if (require.main === module) for (const label of ['old', 'green']) console.log(prepare(label));
module.exports = { prepare };
