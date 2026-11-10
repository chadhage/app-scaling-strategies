'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, originalInput, verifyBaseline, captureOptions } = require('./final-base.cjs');
const { verifySource, verifyCurrentSeal, SEAL } = require('./final-phase.cjs');
const { sealedNames, verifySeal } = require('./seal.cjs');
const { finalCapture, checkManifest } = require('./evidence-check.cjs');
assert.deepEqual(verifySource(), []);
assert.deepEqual(verifyBaseline(), []);
assert.deepEqual(verifyCurrentSeal(), []);
const seal = JSON.parse(fs.readFileSync(SEAL));
const names = [...sealedNames(), 'evidence/seal.json'];
const read = (name) => fs.existsSync(path.join(ROOT, name)) ? fs.readFileSync(path.join(ROOT, name)) : undefined;
let sealCases = 0;
for (const target of ['README.md', 'canon.cjs', 'redact.cjs', 'tests/final-review.test.cjs', 'imports.final.json',
  'evidence/seal.json', 'evidence/final-20261110/baseline-index.json', 'evidence/mutants/equivalents-final.json']) {
  const problems = verifySeal(seal, { names, read: (name) => {
    const bytes = read(name);
    if (name !== target) return bytes;
    const altered = Buffer.from(bytes);
    altered[Math.min(7, altered.length - 1)] ^= 1;
    return altered;
  } });
  assert.ok(problems.some((problem) => problem === `seal: ${target} differs from its pin`), target);
  sealCases += 1;
}
assert.ok(verifySeal(seal, { names: [...names, 'tests/unlisted.cjs'], read }).some((problem) => problem === 'seal: tests/unlisted.cjs is not sealed'));
assert.ok(verifySeal(seal, { names, read: (name) => name === 'README.md' ? undefined : read(name) }).some((problem) => problem === 'seal: README.md is missing'));
sealCases += 2;
let baselineCases = 0;
for (const target of ['capability/C014/evidence/seal.json', 'capability/C014/README.md']) {
  const problems = verifyBaseline({ read: (name) => {
    const bytes = originalInput(name);
    if (name !== target) return bytes;
    const altered = Buffer.from(bytes);
    altered[7] ^= 1;
    return altered;
  } });
  assert.ok(problems.some((problem) => problem.includes(target.slice('capability/C014/'.length))));
  baselineCases += 1;
}
const manifestFile = finalCapture('green-suite');
assert.ok(manifestFile);
const manifest = JSON.parse(fs.readFileSync(manifestFile));
const base = path.join(process.env.C014_PRIVATE_EVIDENCE, `tamper-work-${process.pid}`);
assert.equal(fs.existsSync(base), false);
const copied = path.join(base, 'capture');
fs.mkdirSync(copied, { recursive: true });
const copy = path.join(copied, path.basename(manifestFile));
fs.copyFileSync(manifestFile, copy);
for (const stream of ['stdout', 'stderr']) {
  const target = path.join(copied, manifest.transcripts[stream].path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(path.dirname(manifestFile), manifest.transcripts[stream].path), target);
}
const options = captureOptions(manifestFile);
for (const input of manifest.inputs) {
  assert.ok(!path.isAbsolute(input.path) && !input.path.split(/[\\/]/).includes('..'));
  const target = path.join(base, input.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, options.readInput ? options.readInput(input.path) : fs.readFileSync(path.join(ROOT, '..', '..', input.path)));
}
let captureCases = 0;
try {
  assert.deepEqual(checkManifest(copy, { repository: base }), []);
  const cases = [
    [path.join(copied, manifest.transcripts.stdout.path), 'stdout transcript changed'],
    [path.join(base, manifest.inputs[0].path), 'changed after the capture']
  ];
  for (const [target, expected] of cases) {
    const bytes = fs.readFileSync(target);
    const altered = Buffer.from(bytes);
    altered[Math.min(7, altered.length - 1)] ^= 1;
    fs.writeFileSync(target, altered);
    assert.ok(checkManifest(copy, { repository: base }).some((problem) => problem.includes(expected)), expected);
    fs.writeFileSync(target, bytes);
    captureCases += 1;
  }
  for (const [target, expected] of [[path.join(copied, manifest.transcripts.stderr.path), 'stderr transcript is missing'], [path.join(base, manifest.inputs[0].path), 'is missing']]) {
    const bytes = fs.readFileSync(target);
    fs.rmSync(target);
    assert.ok(checkManifest(copy, { repository: base }).some((problem) => problem.includes(expected)), expected);
    fs.writeFileSync(target, bytes);
    captureCases += 1;
  }
  fs.writeFileSync(copy, JSON.stringify({ ...manifest, exitCode: 1 }));
  assert.ok(checkManifest(copy, { repository: base }).some((problem) => problem.includes('exit code 1 is not the expected 0')));
  captureCases += 1;
} finally { fs.rmSync(base, { recursive: true, force: true }); }
assert.deepEqual(verifyBaseline(), []);
assert.deepEqual(verifySource(), []);
assert.deepEqual(verifyCurrentSeal(), []);
console.log(JSON.stringify({ schema: 'C014-final-tamper/1', ok: true, sealCases, baselineCases, captureCases, originalBytesUnchanged: true }));
