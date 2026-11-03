'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helper = 'testing\\browser\\isolated.cjs';
const helperSha256 = hash(fs.readFileSync(path.join(root, helper)));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const playwrightVersion = JSON.parse(fs.readFileSync(
  path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'), 'utf8',
)).version;
assert.equal(playwrightVersion, '1.56.1');
assert.equal(process.version, 'v22.23.4');
const signatureCommand = "$f=Get-Item -LiteralPath 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $f.FullName; [pscustomobject]@{path=$f.FullName;version=$f.VersionInfo.ProductVersion;status=$s.Status.ToString();signer=$s.SignerCertificate.Subject;powerShell=$PSVersionTable.PSVersion.ToString()} | ConvertTo-Json -Compress";
const signature = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', signatureCommand], {
  cwd: root, encoding: 'utf8',
});
assert.equal(signature.status, 0, signature.stderr);
const edge = JSON.parse(signature.stdout);
assert.equal(edge.status, 'Valid');
assert.match(edge.signer, /CN=Microsoft Corporation/);
assert.equal(edge.version, '156.0.4314.50');
const sourceFiles = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
const source = sourceFiles.map((relative) => {
  const bytes = fs.readFileSync(path.join(root, relative));
  const lines = bytes.toString('utf8').split(/\r?\n/);
  return {
    path: relative,
    sha256: hash(bytes),
    exactRows: lines.filter((line) => /^\| (S027|D-S027|A-S027|B-S027) \|/.test(line)),
  };
});
assert.equal(source[0].exactRows.length, 1);
assert.equal(source[1].exactRows.length, 1);
assert.equal(source[2].exactRows.length, 2);
const inventory = JSON.parse(fs.readFileSync(
  path.join(root, '.git', 'kanban-orchestrator', 'inventory.json'), 'utf8',
));
const packet = inventory.cards.filter((card) => card.packet === 'SC-S027');
assert.deepEqual(packet.map((card) => card.id), ['A-S027', 'B-S027']);
console.log(JSON.stringify({
  node: process.version,
  playwrightVersion,
  edge,
  helper,
  helperSha256,
  helperPublishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
  helperAPI: 'openIsolatedLesson; awaited close() in finally',
  qualificationLimit: 'Existing offline pairing only; helper lifecycle limitation remains; abandoned prototype is unqualified.',
  source,
  packet,
  sourceReadSequence: 'Exact source rows and portable contract were read before BDD; this later capture is not a backdated read timestamp.',
  cloudOperations: 0,
  installedOrDownloaded: false,
  productionNode24Validated: false,
}, null, 2));
