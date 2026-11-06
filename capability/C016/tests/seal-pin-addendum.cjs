'use strict';

// U019 sealer: writes dependency-pins-addendum-1.json once (flag wx, so an existing addendum is never rewritten). It rebuilds the accepted bytes of C015
// tests\surface.test.cjs from Git history at the pinned observedHead, applies the one-line K-C015 edit and records the exact replaced bytes as an
// authorized step. Run from the repository root with no arguments: node capability\C016\tests\seal-pin-addendum.cjs
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, repo } = require('./provenance.cjs');
const authority = require('./pin-authority.cjs');
const edit = require('./surface-edit.cjs');

if (process.argv.length !== 2) throw new Error('The sealer takes no arguments; it writes addendum 1 once.');
const pinsBytes = fs.readFileSync(path.join(root, 'dependency-pins.json'));
const pins = JSON.parse(pinsBytes);
const entry = pins.records.find((item) => item.file === edit.FILE);
const blob = execFileSync('git', ['--no-pager', 'show', `${pins.observedHead}:${edit.FILE.split('\\').join('/')}`], { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
const accepted = Buffer.from(blob.toString('utf8').replace(/\n/g, '\r\n'));
if (authority.hash(accepted) !== entry.rawSha256) throw new Error('The Git history bytes in CRLF form differ from the sealed record.');
const edited = edit.applySurfaceEdit(accepted);
const canonical = Buffer.from(edited.toString('utf8').replace(/\r\n/g, '\n'));
const addendum = authority.buildAddendum({
  schema: authority.SCHEMA, cardId: 'C016', sequence: 1, createdAtUtc: new Date().toISOString(), item: 'U019',
  reason: 'Owned amendment path for the pinned bytes of C015 tests. dependency-pins.json stays the immutable history of the accepted bytes; this chain is the current authority. ' +
    'It authorizes the one-line K-C015 pin edit of tests\\surface.test.cjs as exact bytes and nothing else.',
  base: { path: 'dependency-pins.json', lfSha256: authority.lfHash(pinsBytes) },
  previous: null,
  replacements: [{
    file: edit.FILE, status: 'authorized',
    edit: 'K-C015 pin edit, exact bytes only: line 70 reads the archived approved publisher snapshot named by publisher-boundary.json (path.join(root, \'evidence\', boundary.approvedSourceSnapshot)) ' +
      'instead of the live private publisher .git\\kanban-orchestrator\\publish.ps1; the line keeps its CRLF ending and nothing else changes.',
    previous: { rawBytes: entry.rawBytes, rawSha256: entry.rawSha256, rawCRLF: entry.rawCRLF },
    current: { rawBytes: edited.length, rawSha256: authority.hash(edited), rawCRLF: authority.crlfCount(edited), gitCanonicalBytes: canonical.length, gitCanonicalSha256: authority.hash(canonical) },
  }],
});
fs.writeFileSync(path.join(root, authority.addendumName(1)), addendum, { flag: 'wx' });
console.log(JSON.stringify({ written: authority.addendumName(1), bytes: addendum.length, lfSha256: authority.lfHash(addendum), replacedRawSha256: authority.hash(edited) }));
