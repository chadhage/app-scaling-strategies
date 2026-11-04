'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inventory() {
  const files = {};
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (directory === root && item.name === 'publication.json') continue;
      if (item.isSymbolicLink()) throw new Error('Source/evidence inventory will not follow a link.');
      if (item.isDirectory()) visit(target);
      else if (item.isFile()) files[path.relative(root, target)] = sha(fs.readFileSync(target));
      else throw new Error('Only owned regular source/evidence files are supported.');
    }
  }
  visit(root);
  return files;
}

function checkDependencies() {
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'dependencies.json'), 'utf8'));
  const observed = {};
  for (const pin of pins.files) {
    const file = path.join(repo, pin.path);
    const bytes = fs.readFileSync(file);
    if (sha(bytes) !== pin.rawSha256) throw new Error(`Dependency raw bytes changed: ${pin.path}`);
    const gitName = pin.path.split(path.sep).join('/');
    const blob = execFileSync('git', ['hash-object', `--path=${gitName}`, file], { encoding: 'utf8', windowsHide: true }).trim();
    if (blob !== pin.referenceGitBlob) throw new Error(`Dependency Git canonical bytes changed: ${pin.path}`);
    const canonical = execFileSync('git', ['cat-file', 'blob', blob], { windowsHide: true });
    if (sha(canonical) !== pin.canonicalSha256) throw new Error(`Dependency canonical SHA changed: ${pin.path}`);
    observed[pin.path] = sha(bytes);
  }
  for (const helper of [pins.browser]) {
    const bytes = fs.readFileSync(path.join(repo, helper.path));
    if (sha(bytes) !== helper.sha256) throw new Error(`Approved exact helper SHA changed: ${helper.path}`);
    observed[helper.path] = sha(bytes);
  }
  return observed;
}

function publisherBoundary() {
  const boundary = JSON.parse(fs.readFileSync(path.join(root, 'publisher-boundary.json'), 'utf8'));
  const actualSha256 = sha(fs.readFileSync(path.join(repo, boundary.publisher)));
  return Object.freeze({ code: actualSha256 === boundary.expectedSha256 ? 'EXACT_AUTHORIZED_PUBLISHER' : 'HOLD_UNAPPROVED_PUBLISHER',
    exactAuthorizedBytes: actualSha256 === boundary.expectedSha256,
    expectedSha256: boundary.expectedSha256, actualSha256, publicationPerformed: false });
}

module.exports = Object.freeze({ root, repo, sha, inventory, checkDependencies, publisherBoundary });
