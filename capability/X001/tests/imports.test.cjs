'use strict';

// Pins of every imported accepted file (imports.json) recomputed against git, closure completeness, tamper detection, and provenance of
// saved.js from the accepted producers. Hermetic: only `git cat-file` on accepted commits, never the live index, HEAD or publisher.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const pins = require('..\\imports.json');

const repository = path.resolve(__dirname, '..', '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 8 * 1024 * 1024, windowsHide: true });

const keyOf = (entry) => `${entry.commit}:${entry.path.replaceAll('\\', '/')}`;
let batchCache = null;
// One `git cat-file --batch` for every pinned blob (a spawn per file made the suite take minutes on a loaded machine).
function batch() {
  if (batchCache) return batchCache;
  const out = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], { cwd: repository, input: `${pins.dependencies.map(keyOf).join('\n')}\n`, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  batchCache = new Map();
  let offset = 0;
  for (const entry of pins.dependencies) {
    const eol = out.indexOf(10, offset);
    const header = /^([0-9a-f]{40}) blob (\d+)$/.exec(out.toString('latin1', offset, eol));
    assert.ok(header, `the accepted blob of ${entry.path} exists`);
    const size = Number(header[2]);
    batchCache.set(keyOf(entry), out.subarray(eol + 1, eol + 1 + size));
    offset = eol + 1 + size + 1;
  }
  return batchCache;
}

// Returns the list of problems of a pins document; `read` and `blob` are injectable so a tampered pin or file can be tested in memory.
function problems(document, read = (file) => fs.readFileSync(path.join(repository, file)), blob = (entry) => batch().get(keyOf(entry))) {
  const found = [];
  for (const entry of document.dependencies) {
    const bytes = read(entry.path);
    if (sha(bytes) !== entry.rawSha256) found.push(`${entry.path}: raw bytes differ from the pin`);
    if (sha(lf(bytes)) !== entry.crlfToLfSha256) found.push(`${entry.path}: LF form differs from the pin`);
    const accepted = sha(blob(entry));
    if (accepted !== entry.acceptedGitSha256) found.push(`${entry.path}: pin does not match the accepted git blob`);
    if (![entry.rawSha256, entry.crlfToLfSha256].includes(accepted)) found.push(`${entry.path}: bytes agree with neither the blob nor its LF form`);
  }
  for (const entry of document.own) if (sha(read(entry.path)) !== entry.rawSha256) found.push(`${entry.path}: own pin differs`);
  return found;
}

test('every imported file is byte-identical to the accepted git blob of its card tag', () => {
  assert.equal(pins.schema, 'X001-source-pins/1');
  assert.deepEqual(problems(pins), []);
  const tags = git('rev-parse', ...pins.dependencies.map((entry) => `${entry.tag}^{commit}`)).toString().trim().split(/\r?\n/);
  pins.dependencies.forEach((entry, index) => {
    assert.equal(tags[index], entry.commit, entry.path);
    assert.match(entry.tag, new RegExp(`^kanban/${entry.card}/${entry.commit.slice(0, 12)}$`));
    assert.ok(entry.path.startsWith(`capability\\${entry.card}\\`));
  });
});

test('the pin list covers exactly the files this namespace loads or reads from other namespaces', () => {
  const { closure } = require('.\\build-imports.cjs');
  assert.deepEqual(pins.dependencies.map((entry) => entry.path).sort(), closure());
  for (const must of ['C044\\cursor.js', 'C044\\reducer.js', 'C034\\trace.js', 'C020\\inspector.js', 'C033\\journey.js']) {
    assert.ok(pins.dependencies.some((entry) => entry.path.endsWith(must)), must);
  }
  assert.equal(pins.dependencies.some((entry) => entry.path.startsWith('capability\\X001')), false);
});

test('every script that index.html loads from another namespace is pinned', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const external = [...html.matchAll(/<script defer src="\.\.\/(C\d{3})\/([^"]+)"/g)].map((match) => `capability\\${match[1]}\\${match[2]}`);
  assert.equal(external.length, 6);
  for (const file of external) assert.ok(pins.dependencies.some((entry) => entry.path === file), file);
});

test('a forged pin, a changed file and a bundle that disagrees with the accepted blob are all reported', () => {
  const clone = () => JSON.parse(JSON.stringify(pins));
  const forged = clone();
  forged.dependencies[3].rawSha256 = '0'.repeat(64);
  assert.match(problems(forged).join('\n'), /raw bytes differ from the pin/);
  const resigned = clone();
  const target = resigned.dependencies[10];
  const evil = Buffer.from('module.exports = "evil";');
  Object.assign(target, { rawSha256: sha(evil), crlfToLfSha256: sha(lf(evil)) });
  const changed = problems(resigned, (file) => (file === target.path ? evil : fs.readFileSync(path.join(repository, file))));
  assert.match(changed.join('\n'), /does not match the accepted git blob|agree with neither/, 'a re-signed pin is caught by the anchor in git, not by the pin next to it');
  const own = clone();
  own.own[0].rawSha256 = sha(Buffer.from('x'));
  assert.match(problems(own).join('\n'), /own pin differs/);
  assert.deepEqual(problems(clone(), undefined, (entry) => Buffer.from(`not ${entry.path}`)).length > 0, true);
});

test('saved.js is exactly what the accepted producers record (provenance of the fixtures, not part of scrubbing)', () => {
  const { buildText } = require('.\\build-saved.cjs');
  assert.equal(buildText(), fs.readFileSync(path.join(__dirname, '..', 'saved.js'), 'utf8'));
});

test('the accepted C034 bundle holds exactly the two traces that saved.js copies', () => {
  const { bundlePath } = require('.\\scenarios-hostile.cjs');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const saved = require('..\\saved.js');
  assert.deepEqual(bundle.traces.map((trace) => trace.id), ['closed-history', 'held-snapshot']);
  for (const trace of bundle.traces) assert.deepEqual(JSON.parse(JSON.stringify(saved.runs.find((run) => run.id === `c034-${trace.id}`).snapshot)), trace.snapshot);
  assert.equal(pins.acceptedDecoderBundle, 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116');
});
