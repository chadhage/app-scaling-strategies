'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const original = require('./u005-support-evidence.cjs');
const authorityPath = path.join(__dirname, 'u006-u062-authority.cjs');
const authorityBytes = fs.readFileSync(authorityPath);
const expectedAuthority = 'b81dc5da9779267694c6310c0cb316bbb903747d5b201a5b07ebe00f2af8f6ab';
assert.equal(crypto.createHash('sha256').update(Buffer.from(authorityBytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex'), expectedAuthority, 'U062_AUTHORITY_HELPER_PIN');
const life = path.resolve(__dirname, '..');
const authority = require('./u006-u062-authority.cjs').loadAuthority(
  (file) => fs.readFileSync(path.join(life, file)),
  (file) => fs.readFileSync(path.join(original.repoRoot, file)),
);

function verifyRun(dir, name, options = {}) {
  const problems = original.verifyRun(dir, name, options);
  if (!options.pinInputs) return problems;
  let manifestBytes;
  let manifest;
  try {
    manifestBytes = fs.readFileSync(path.join(dir, `${name}.json`));
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch { return problems; }
  const permitted = new Set();
  for (const input of manifest.inputs) {
    let actual;
    try { actual = fs.readFileSync(path.join(options.root || original.repoRoot, input.path)); } catch { continue; }
    if (authority.canAmend(manifestBytes, input, actual)) permitted.add(`${name}: input ${input.path} changed after the run`);
  }
  return problems.filter((problem) => !permitted.has(problem));
}

module.exports = { verifyRun };
