'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, ...file.replaceAll('\\', '/').split('/')));
function historical(readFile = read) {
  const pins = JSON.parse(readFile('evidence/final/pins.json'));
  const files = pins.files.map((entry) => entry.path).concat('evidence/final/pins.json');
  const source = new Set(JSON.parse(readFile('evidence/final/source-freeze.json')).files.map((entry) => entry.path));
  const old = require('../evidence/u068/history/predecessor-sources/tests/evidence-verify.cjs');
  return old.verify({
    read: (file) => source.has(file)
      ? readFile('evidence/u068/history/predecessor-sources/' + file) : readFile(file),
    dependency: (file) => fs.readFileSync(path.join(repository, ...file.split('/'))),
    files: () => files
  });
}
function freshEpoch(epoch) {
  const problems = [];
  if (epoch.schema !== 'U068-honest-fresh-epoch/1') return ['UNKNOWN_FRESH_EPOCH'];
  if (epoch.originalChronologyCertified !== false) problems.push('ORIGINAL_CHRONOLOGY_MUST_REMAIN_UNCERTIFIED');
  if (!Array.isArray(epoch.activeProductionBeforeRed) || epoch.activeProductionBeforeRed.length) problems.push('IMPLEMENTATION_PRESENT_BEFORE_FRESH_RED');
  for (const name of ['coreRed', 'historyRed']) {
    const record = epoch[name];
    const installed=Date.parse(epoch.reusedImplementationInstalledAtUtc),started=Date.parse(record?.startedAtUtc),completed=Date.parse(record?.completedAtUtc);
    if (!record || record.exitCode !== 1 || record.timedOut || record.signal || record.moduleFaults || record.syntaxFaults
      || record.assertionFailures <= 0 || ![installed,started,completed].every(Number.isFinite)
      || started>completed || completed>=installed) problems.push('FRESH_RED_NOT_BEFORE_REUSE:' + name);
  }
  if (epoch.coreRed?.assertionFailures !== 65 || epoch.historyRed?.assertionFailures !== 6) problems.push('FRESH_BEHAVIORAL_COUNTS_DIFFER');
  return problems;
}
function transition() {
  const metadata = JSON.parse(read('evidence/u068/history/wrong-test-transition.json'));
  const old = read(metadata.retainedSource);
  const current = read(metadata.originalPath);
  const replacement=read('evidence/u068/history/frozen-source-epoch-01/'+metadata.originalPath);
  const lf=Buffer.from(replacement.toString('utf8').replace(/\r\n/g,'\n'));
  const allowed=[replacement,lf,Buffer.from(lf.toString('utf8').replace(/\n/g,'\r\n'))].map(sha);
  const problems = [];
  if (sha(old) !== metadata.originalSha256 || sha(replacement)!==metadata.replacementSha256||!allowed.includes(sha(current))) problems.push('EXPLICIT_WRONG_TEST_TRANSITION_SHA_DIFFERS');
  if (metadata.claimedUnchangedGreen !== false) problems.push('WRONG_TEST_MUST_NOT_BE_CALLED_UNCHANGED_GREEN');
  if (!old.toString('utf8').includes('a trimmed key is forgotten and reserves again')) problems.push('ORIGINAL_WRONG_ASSERTION_NOT_RETAINED');
  if (!current.toString('utf8').includes('U068 corrects the retained wrong forgotten-key assertion')) problems.push('CORRECTION_NOT_EXPLICITLY_VERSIONED');
  return problems;
}
module.exports = { historical, freshEpoch, transition, root, read, sha };
