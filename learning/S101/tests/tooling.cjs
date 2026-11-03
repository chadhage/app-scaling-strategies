'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..', '..');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const expectedSHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperWorkingBytes = fs.readFileSync(helper);
const canonicalHelperSHA256 = sha256(Buffer.from(helperWorkingBytes.toString('utf8').replace(/\r\n/g, '\n')));
assert.match(process.version, /^v22\./);
assert.equal(sha256(helperWorkingBytes), expectedSHA256);
require(helper);
const playwrightVersion = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
const publication = spawnSync('git', ['--no-pager', 'rev-parse', '53c0c0d^{commit}'], {
  cwd: root, encoding: 'utf8',
});
assert.equal(publication.status, 0);
const helperCommit = publication.stdout.trim();
const committedHelper = spawnSync('git', ['--no-pager', 'show', `${helperCommit}:testing/browser/isolated.cjs`], {
  cwd: root, encoding: null,
});
assert.equal(committedHelper.status, 0);
assert.equal(sha256(committedHelper.stdout), canonicalHelperSHA256);
const signatureHost = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
const signature = spawnSync(signatureHost, ['-NoProfile', '-NonInteractive', '-Command', `
  $ErrorActionPreference = 'Stop'
  $exe = Join-Path \${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'
  $signature = Get-AuthenticodeSignature -FilePath $exe
  [ordered]@{
    executable = $exe
    fileVersion = (Get-Item -LiteralPath $exe).VersionInfo.FileVersion
    signatureStatus = $signature.Status.ToString()
    signerSubject = $signature.SignerCertificate.Subject
  } | ConvertTo-Json -Compress
`], { cwd: root, encoding: 'utf8' });
assert.equal(signature.status, 0, signature.stderr);
const edge = JSON.parse(signature.stdout.trim());
assert.equal(edge.signatureStatus, 'Valid');
assert.match(edge.signerSubject, /Microsoft Corporation/);
assert.match(edge.fileVersion, /^156\./);
console.log(JSON.stringify({
  nodeVersion: process.version, playwrightVersion, edge, signatureHost,
  helperRawWorkingSHA256: expectedSHA256, helperCanonicalGitSHA256: canonicalHelperSHA256,
  helperWorkingCRLFCount: (helperWorkingBytes.toString('utf8').match(/\r\n/g) || []).length,
  helperGitCRLFCount: (committedHelper.stdout.toString('utf8').match(/\r\n/g) || []).length,
  helperCommit, publication: '53c0c0d',
  mode: 'Existing offline package and installed signed Edge; no install/download/fallback.',
  lifecycleQualified: false, productionNode24Certified: false, nativeAzureCertified: false,
}, null, 2));
