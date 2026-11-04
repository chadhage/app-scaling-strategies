'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', ['--no-pager', ...args], { cwd: repository, encoding: 'buffer' });
const text = args => git(args).toString('utf8').trim();

function qualify(resultPath) {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Only exact deliberate capture appends publication qualification.');
  const input = path.resolve(repository, resultPath);
  assert.ok(input.startsWith(`${path.join(root, 'evidence', 'publication')}${path.sep}`));
  const result = JSON.parse(fs.readFileSync(input));
  assert.equal(result.cardId, 'X003');
  assert.equal(result.workerId, 'worker-X003');
  assert.equal(result.outcome, 'published');
  assert.match(result.commit, /^[a-f0-9]{40}$/);
  assert.equal(result.tag, `kanban/X003/${result.commit.slice(0, 12)}`);
  assert.equal(result.remoteVerified, true);
  assert.equal(result.remotePeeledTag, result.commit);
  const message = text(['show', '-s', '--format=%B', result.commit]);
  assert.match(message, /^\[X003\]\[L\]/);
  assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
  assert.equal(text(['cat-file', '-t', `refs/tags/${result.tag}`]), 'tag');
  assert.equal(text(['rev-parse', `${result.tag}^{}`]), result.commit);
  const refs = text(['-c', 'http.version=HTTP/1.1', 'ls-remote', 'origin', 'refs/heads/main', `refs/tags/${result.tag}`, `refs/tags/${result.tag}^{}`])
    .split(/\r?\n/).map(line => line.split(/\s+/));
  const remoteMain = refs.find(item => item[1] === 'refs/heads/main')?.[0];
  const remoteTagObject = refs.find(item => item[1] === `refs/tags/${result.tag}`)?.[0];
  const remotePeeledTag = refs.find(item => item[1] === `refs/tags/${result.tag}^{}`)?.[0];
  assert.match(remoteMain || '', /^[a-f0-9]{40}$/);
  assert.match(remoteTagObject || '', /^[a-f0-9]{40}$/);
  assert.equal(remotePeeledTag, result.commit);
  git(['merge-base', '--is-ancestor', result.commit, remoteMain]);
  const changed = text(['diff-tree', '--no-commit-id', '--name-only', '-r', result.commit]).split(/\r?\n/);
  assert.ok(changed.length > 0 && changed.every(name => name.startsWith('capability/X003/')));
  const paths = git(['ls-tree', '-r', '-z', '--name-only', result.commit, '--', 'capability/X003'])
    .toString('utf8').split('\0').filter(Boolean);
  const files = paths.map(name => {
    assert.ok(name.startsWith('capability/X003/'));
    const bytes = fs.readFileSync(path.join(repository, name));
    const canonical = git(['show', `${result.commit}:${name}`]);
    const identical = bytes.equals(canonical);
    if (!identical) {
      assert.doesNotMatch(name, /\.(?:gz|raw)$/);
      assert.deepEqual(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')), canonical,
        `Only declared text CRLF-to-LF canonical differences are allowed: ${name}`);
    }
    return {
      path: name.replaceAll('/', '\\'), rawSha256: hash(bytes), gitCanonicalSha256: hash(canonical),
      rawBytesEqualGit: identical, declaredTextCanonicalDifference: !identical,
      rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length
    };
  });
  const sourceCapture = JSON.parse(fs.readFileSync(path.join(repository, result.sourceCapture)));
  const source = zlib.gunzipSync(fs.readFileSync(path.join(repository, sourceCapture.publisherSnapshot)));
  assert.equal(hash(source), sourceCapture.approvedRawSha256);
  assert.equal(hash(source), result.usedActualPublisherRawSha256);
  assert.equal(sourceCapture.canonicalAuthorityReadUnderStateMutex, true);
  assert.equal(sourceCapture.actualSourceReverifiedUnderPublisherMutex, true);
  const index = require('./index.cjs');
  const beforeIndex = JSON.parse(fs.readFileSync(path.join(repository, result.indexBefore)));
  const afterIndex = JSON.parse(fs.readFileSync(path.join(repository, result.indexAfter)));
  const indexProof = index.verifyPreserved(beforeIndex, afterIndex);
  assert.equal(result.foreignIndexPreserved, true);
  assert.equal(result.foreignIndexEntryCount, indexProof.foreignEntryCount);
  assert.equal(result.foreignIndexMetadataSha256, indexProof.foreignMetadataSha256);
  for (const snapshot of [beforeIndex, afterIndex]) {
    const streams = Object.fromEntries(Object.entries(snapshot.streams).map(([name, stream]) => {
      const bytes = zlib.gunzipSync(fs.readFileSync(path.join(repository, stream.path)));
      assert.equal(hash(bytes), stream.sha256);
      assert.equal(bytes.length, stream.bytes);
      return [name, bytes];
    }));
    const reconstructed = index.inspectRows(index.parseIndex(streams.stage, streams.debug, streams.assume, streams.fsmonitor));
    assert.equal(reconstructed.foreignMetadataSha256, snapshot.foreignMetadataSha256);
  }
  const completeRawRecords = paths.filter(name => /\/evidence\/raw\/[^/]+\/record\.json$/.test(name));
  const rawProof = completeRawRecords.map(name => {
    const record = JSON.parse(git(['show', `${result.commit}:${name}`]));
    for (const stream of Object.values(record.streams)) {
      const bytes = zlib.gunzipSync(git(['show', `${result.commit}:${stream.path.replaceAll('\\', '/')}`]));
      assert.equal(hash(bytes), stream.sha256);
      assert.equal(bytes.length, stream.bytes);
    }
    return { path: name.replaceAll('/', '\\'), label: record.label, status: record.status };
  });
  const qualification = {
    schema: 'X003/owned-publication-qualification/1', cardId: 'X003', workerId: 'worker-X003',
    status: 'qualified', observedAtUtc: new Date().toISOString(),
    commit: result.commit, tag: result.tag, remoteMain, remoteTagObject, remotePeeledTag,
    remoteAncestryVerified: true, annotatedTagVerified: true, allCommitChangesOwned: true,
    actualPublisherRawSha256UsedForThisCommit: result.usedActualPublisherRawSha256,
    actualPublisherSourceCapture: result.sourceCapture, originalCaptureWasNotRelabeled: true,
    gitNetworkTransport: 'command-local HTTP/1.1', globalGitConfigurationChanged: false,
    publisherGitProcessEnvironmentRestored: result.priorGitProcessEnvironmentRestored,
    foreignIndexPreservation: { ...indexProof, indexBefore: result.indexBefore, indexAfter: result.indexAfter,
      rawMetadataStreamsVerified: 8 },
    fileCount: files.length, rawIdenticalFiles: files.filter(item => item.rawBytesEqualGit).length,
    declaredCanonicalDifferenceFiles: files.filter(item => item.declaredTextCanonicalDifference).length,
    files, committedCompleteRawProofRecords: rawProof,
    retainedCommittedFailures: rawProof.filter(item => item.status !== 0).length,
    qualificationIsLocalPostPublicationProof: true, additionalCompanionCredit: 0,
    parentAcceptancePending: true, nativeOrSourceParentCompletionClaimed: false
  };
  const directory = path.join(root, 'evidence', 'qualified',
    `${result.commit.slice(0, 12)}-${crypto.randomUUID()}`);
  fs.mkdirSync(directory, { recursive: true });
  const output = path.join(directory, 'qualification.json');
  fs.writeFileSync(output, `${JSON.stringify(qualification, null, 2)}\n`, { flag: 'wx' });
  console.log(`X003_QUALIFICATION ${path.relative(repository, output)}`);
  console.log(`X003 QUALIFIED ${result.commit} ${result.tag}: files=${files.length}; raw-identical=${qualification.rawIdenticalFiles}; declared-canonical-differences=${qualification.declaredCanonicalDifferenceFiles}; committed-complete-raw-records=${rawProof.length}; retained-failures=${qualification.retainedCommittedFailures}.`);
  return qualification;
}
module.exports = Object.freeze({ qualify });
if (require.main === module) qualify(process.argv[2]);
