'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const approved = [
  ['playwright', 'sha512-aFi5B0WovBHTEvpM3DzXTUaeN6eN0qWnTkKx4NQaH4Wvcmc153PdaY2UBdSYKaGYw+UyWXSVyxDUg5DoPEttjw=='],
  ['playwright-core', 'sha512-hutraynyn31F+Bifme+Ps9Vq59hKuUCz7H1kDOcBs+2oGguKkWTU50bBWrtz34OUWmIwpBTWDxaRPXrIXkgvmQ=='],
];
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const comparable = value => value.toLowerCase();

function regular(expected) {
  const actual = fs.realpathSync(expected);
  if (comparable(actual) !== comparable(expected) || !fs.statSync(actual).isFile()) {
    throw new Error('Approved package/cache must be an unredirected regular file');
  }
  return fs.readFileSync(actual);
}
function archiveFiles(compressed) {
  const bytes = gunzipSync(compressed, { maxOutputLength: 80 * 1024 * 1024 });
  const entries = new Map();
  let pax = {};
  let longName = null;
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length).toString().replace(/\0.*$/s, '');
    const size = parseInt(text(124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length) throw new Error('Invalid approved tar member size');
    const data = bytes.subarray(offset + 512, offset + 512 + size);
    const type = text(156, 1);
    let name = longName || pax.path || [text(345, 155), text(0, 100)].filter(Boolean).join('/');
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      pax = {};
      let cursor = 0;
      while (cursor < data.length) {
        const space = data.indexOf(32, cursor);
        const length = Number(data.subarray(cursor, space).toString());
        if (space < 0 || !Number.isInteger(length) || length <= 0 || cursor + length > data.length) throw new Error('Invalid PAX member');
        const pair = data.subarray(space + 1, cursor + length - 1).toString();
        const equals = pair.indexOf('=');
        if (equals > 0) pax[pair.substring(0, equals)] = pair.substring(equals + 1);
        cursor += length;
      }
      continue;
    }
    if (type === 'L') { longName = data.toString().replace(/\0.*$/s, ''); continue; }
    pax = {};
    longName = null;
    if (type === '5') continue;
    if (type !== '0' && type !== '') throw new Error('Unsupported approved tar member type; no fallback');
    if (!name.startsWith('package/')) throw new Error('Package archive path prefix mismatch');
    name = name.substring(8);
    const parts = name.split('/');
    if (!name || parts.some(part => !part || part === '.' || part === '..' || /[:\\\0]/.test(part)) || entries.has(name)) {
      throw new Error('Unsafe or duplicate public package member');
    }
    entries.set(name, data);
  }
  if (!entries.size) throw new Error('Empty package archive');
  return entries;
}
function installedFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Redirected installed package member');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return installedFiles(path.join(directory, entry.name), relative);
    if (!entry.isFile()) throw new Error('Unexpected installed package member');
    return [relative];
  });
}
function verifyPackages() {
  const lock = JSON.parse(regular(path.join(repo, 'testing', 'browser', 'package-lock.json')));
  const provenance = JSON.parse(regular(path.join(repo, 'testing', 'browser', 'evidence', 'offline-provenance.json')));
  return approved.map(([name, integrity]) => {
    const metadata = lock.packages[`node_modules/${name}`];
    const published = provenance.packages.find(entry => entry.name === name);
    if (metadata?.version !== '1.56.1' || metadata.integrity !== integrity
        || published?.version !== '1.56.1' || published.integrity !== integrity
        || metadata.resolved !== `https://registry.npmjs.org/${name}/-/${name}-1.56.1.tgz`) {
      throw new Error('Approved public cache metadata mismatch; no install/download/fallback');
    }
    const hex = Buffer.from(integrity.substring(7), 'base64').toString('hex');
    const cacheFile = path.join(repo, '.git', 'kanban-orchestrator', 'npm-cache', '_cacache', 'content-v2', 'sha512',
      hex.substring(0, 2), hex.substring(2, 4), hex.substring(4));
    const compressed = regular(cacheFile);
    if (digest('sha512', compressed) !== hex) throw new Error('Public tarball exact digest mismatch');
    const archive = archiveFiles(compressed);
    const installed = path.join(repo, 'testing', 'browser', 'node_modules', name);
    const actual = installedFiles(installed).sort();
    if (actual.join('\n') !== [...archive.keys()].sort().join('\n')) throw new Error('Installed package file inventory differs from approved public tarball');
    for (const [file, expected] of archive) {
      const bytes = regular(path.join(installed, ...file.split('/')));
      if (!bytes.equals(expected)) throw new Error(`Installed public package bytes differ: ${name}/${file}`);
    }
    const pkg = JSON.parse(archive.get('package.json'));
    if (pkg.version !== '1.56.1' || pkg.license !== 'Apache-2.0') throw new Error('Public package identity mismatch');
    return { name, version: pkg.version, integrity, tarballBytes: compressed.length,
      installedFilesVerified: archive.size, cacheFile: path.relative(repo, cacheFile),
      registrySignaturesIndependentlyVerified: false };
  });
}
function verifyPins() {
  if (process.version !== 'v22.23.4') throw new Error('Only the existing approved Node 22.23.4 test runtime is selected');
  const helper = regular(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  if (digest('sha256', helper) !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') {
    throw new Error('Published helper changed; do not widen or replace it');
  }
  const packages = verifyPackages();
  const command = "$ErrorActionPreference='Stop'; $p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; [ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress";
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: root, timeout: 30000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.toString());
  const edge = JSON.parse(result.stdout.toString().replace(/^\uFEFF/, ''));
  if (edge.version !== '156.0.4314.50' || edge.signatureStatus !== 'Valid' || !edge.signer.includes('CN=Microsoft Corporation')) {
    throw new Error('Only the already-approved installed Microsoft-signed Edge 156 pairing is selected');
  }
  return { node: process.version, packages, edge, edgeCommand: command,
    edgeStdout: result.stdout.toString('base64'), edgeStderr: result.stderr.toString('base64'),
    helperWorkingSHA256: digest('sha256', helper), publicCacheReadOnly: true,
    installs: 0, downloads: 0, broaderLifecycleQualified: false };
}

if (require.main === module) console.log(JSON.stringify(verifyPins(), null, 2));
module.exports = { verifyPins, verifyPackages, archiveFiles };
