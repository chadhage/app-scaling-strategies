'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
assert.equal(process.env.CAPTURE_SOURCE_INTEGRITY, '1', 'Re-sealing proof requires deliberate CAPTURE_SOURCE_INTEGRITY=1.');
const folder = __dirname;
const evidence = path.join(folder, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const previous = fs.readdirSync(evidence).filter((file) => /^content-hashes-\d{3}\.json$/.test(file));
const nextNumber = Math.max(0, ...previous.map((file) => Number(file.match(/(\d{3})/)[1]))) + 1;
assert.ok(nextNumber <= 999);
const active = `content-hashes-${String(nextNumber).padStart(3, '0')}.json`;
const excluded = [path.join(evidence, 'content-hashes.json'), path.join(evidence, active)];
const files = walk(folder).filter((file) => !excluded.includes(file)).map((file) => {
  const relative = path.relative(folder, file);
  const raw = fs.readFileSync(file);
  const proof = relative.startsWith(`evidence${path.sep}`);
  const bytes = proof ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
  const gitBlobSha1 = execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
    cwd: path.dirname(file), encoding: 'utf8',
  }).trim();
  const expectedBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlobSha1, expectedBlob, `${relative}: Git attributes must preserve raw proof and canonical LF source.`);
  return { path: relative, mode: proof ? 'raw-proof-bytes' : 'canonical-lf-git-source', bytes: bytes.length, sha256: hash(bytes), gitBlobSha1 };
});
const index = {
  cardId: 'A-S058', kanoUnit: 'A-S058', createdAtUtc: new Date().toISOString(),
  contract: 'Entire owned scope except the derived active pointer and this self-referencing index; earlier indexes remain included and immutable.',
  files,
};
const raw = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(evidence, active), raw, { flag: 'wx' });
fs.writeFileSync(path.join(evidence, 'content-hashes.json'), `${JSON.stringify({ active, sha256: hash(raw) }, null, 2)}\n`);
console.log(JSON.stringify({ cardId: 'A-S058', active, files: files.length, sha256: hash(raw), deliberateCapture: true }));
