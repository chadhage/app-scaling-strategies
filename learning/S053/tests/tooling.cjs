'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const playwright = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwright, '1.56.1');
assert.equal(process.version, 'v22.23.4');
const edgePath = path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const command = `$ErrorActionPreference='Stop'; $p='${edgePath.replace(/'/g, "''")}'; $s=Get-AuthenticodeSignature -LiteralPath $p; [pscustomobject]@{Version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;Status=[string]$s.Status;Signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress`;
const shell = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
const edge = JSON.parse(execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' }));
assert.match(edge.Version, /^156\./);
assert.equal(edge.Status, 'Valid');
assert.match(edge.Signer, /Microsoft Corporation/);
console.log(JSON.stringify({
  node: process.version, purpose: 'Existing test tooling, not production Node.js 24',
  playwright, edge, signatureShell: shell, helper: path.relative(root, helper), helperSha256, publishedHelper: '53c0c0d',
  dependenciesInstalled: false, browserDownloaded: false, unsafeFlags: false,
  foregroundLease: false, abandonedLifecyclePrototypeQualified: false,
}, null, 2));
