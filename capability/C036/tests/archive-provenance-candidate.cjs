'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact deliberate candidate archive required.');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const directory = path.join(root, 'evidence', 'raw', `provenance-candidate-${randomUUID()}`);
fs.mkdirSync(directory);
const save = (name, bytes) => {
  fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
  return { path: path.relative(root, path.join(directory, name)), rawSha256: hash(bytes) };
};
const names = ['publisher-provenance.cjs', 'tests\\publisher-controls.cjs', 'tests\\publisher-current.ps1',
  'tests\\publisher-provenance.test.cjs', 'tests\\integrity.test.cjs', 'tests\\record.cjs',
  'tests\\finalize-provenance.cjs', 'tests\\report-provenance.cjs', 'README.md'];
const snapshots = Object.fromEntries(names.map((name, i) => [name, save(`candidate-${i}.snapshot`, fs.readFileSync(path.join(root, name)))]));
const index = save('qualified-v1-index.snapshot', fs.readFileSync(path.join(root, 'publisher-recovery-index.json')));
const manifest = { schemaVersion: 1, cardId: 'C036', role: 'preserved-qualified-candidate-before-opaque-marker-fix',
  snapshots, index, reason: 'An opaque historical C016 candidate marker is not a current authorization invariant.',
  archivedAtUtc: new Date().toISOString(), extraCredits: 0 };
fs.writeFileSync(path.join(root, 'publisher-candidate-history.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const stdout = Buffer.from(`${JSON.stringify({ role: manifest.role, originalIndexRawSha256: index.rawSha256 })}\n`);
save('stdout.raw.gz', gzipSync(stdout));
save('stderr.raw.gz', gzipSync(Buffer.alloc(0)));
save('run.json', Buffer.from(`${JSON.stringify({ cardId: 'C036', workerId: 'worker-C036', stage: 'provenance-candidate',
  exitCode: 0, startedAtUtc: manifest.archivedAtUtc, completedAtUtc: new Date().toISOString(),
  stdoutSha256: hash(stdout), stderrSha256: hash(Buffer.alloc(0)) }, null, 2)}\n`));
process.stdout.write(stdout);
