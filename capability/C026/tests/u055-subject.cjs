'use strict';

const fs = require('node:fs');
const path = require('node:path');
const legacy = require('./u040-chain.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const prefix = 'capability\\C026\\';
const baseline = JSON.parse(fs.readFileSync(path.join(repository, prefix, 'evidence\\u055\\baseline.json'), 'utf8'));
const retained = new Map(baseline.files.filter((entry) => entry.retainedCopy).map((entry) => [entry.path, entry.retainedCopy]));
const baselineMode = process.env.C026_U055_BASELINE === '1';
const read = (relative) => {
  if (baselineMode && relative === `${prefix}evidence-index-addendum-3.json`) return null;
  const file = baselineMode ? retained.get(relative) ?? relative : relative;
  try { return fs.readFileSync(path.join(repository, file)); } catch { return null; }
};
const authorityFile = path.join(__dirname, 'u055-authority.cjs');
const authority = !baselineMode && fs.existsSync(authorityFile) ? require(authorityFile) : null;
const verify = (reader) => authority ? authority.verifyAuthority(reader) : legacy.verifyChain(reader);
const headSequence = baselineMode || authority === null ? 2 : authority.HEAD_SEQUENCE;

module.exports = Object.freeze({
  read, verify, headPath: legacy.addendumPath(headSequence),
  text: (relative) => read(`${prefix}${relative}`).toString('utf8').replace(/\r\n/g, '\n')
});
