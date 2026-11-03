'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
assert.equal(playwrightVersion, '1.56.1');
assert.equal(process.version, 'v22.23.4');
const command = "$ErrorActionPreference='Stop'; $p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'; if(-not(Test-Path $p)){$p=Join-Path $env:ProgramFiles 'Microsoft\\Edge\\Application\\msedge.exe'}; $s=Get-AuthenticodeSignature -FilePath $p; [ordered]@{path=$p;version=(Get-Item $p).VersionInfo.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject;sha256=(Get-FileHash $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress";
const raw = execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
const edge = JSON.parse(raw);
assert.equal(edge.signatureStatus, 'Valid');
assert.match(edge.signer, /^CN=Microsoft Corporation,/);
assert.equal(edge.version, '156.0.4314.50');
console.log(JSON.stringify({
  verifier: 'PASS', recordedAtUtc: new Date().toISOString(), node: process.version,
  playwrightVersion, helperSha256, helperCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
  signatureExecutable: 'pwsh.exe', signatureCommand: command, signatureRawOutput: raw, edge,
  scope: 'Existing offline test tooling only; not production Node.js 24, native gRPC, or unattended browser lifecycle certification.',
  downloads: 0, dependencyChanges: 0, unsafeFlags: [],
}, null, 2));
