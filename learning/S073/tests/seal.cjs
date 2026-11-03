'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const put = (file, data) => fs.writeFileSync(path.join(root, file), data, { flag: 'wx' });
const json = (file, data) => put(file, `${JSON.stringify(data, null, 2)}\n`);
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Owned evidence cannot contain symbolic links');
    return entry.isDirectory() ? files(target) : [path.relative(root, target)];
  }).sort();
const git = (args) => {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
};

if (['qualify', 'qualify-final'].includes(process.argv[2])) {
  const finalQualification = process.argv[2] === 'qualify-final';
  const syntax = files().filter((file) => /\.(?:js|cjs)$/.test(file)).map((file) => {
    const run = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
    const result = {
      file, command: `node --check ${file}`, exitCode: run.status, stdout: run.stdout, stderr: run.stderr,
      canonicalSha256: sha(canonical(fs.readFileSync(path.join(root, file)))),
    };
    assert.equal(run.status, 0, `${file}: ${run.stderr}`);
    return result;
  });
  json(finalQualification ? 'evidence\\syntax-final.json' : 'evidence\\syntax.json',
    { cardId: 'A-S073', runtime: process.version, outcome: 'PASS', runs: syntax });

  const browser = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((file) => path.isAbsolute(file) && fs.existsSync(file));
  assert.ok(browser, 'The existing signed Edge must be present; never download a fallback');
  const command = `$ErrorActionPreference='Stop'; $p='${browser.replace(/'/g, "''")}'; $s=Get-AuthenticodeSignature -FilePath $p; [ordered]@{path=$p;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress; if($s.Status -ne 'Valid'){exit 1}`;
  const signatureRun = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: repo, encoding: null, timeout: 60000,
  });
  const signatureStdoutPath = finalQualification ? 'evidence\\tooling-signature-verified.raw' : 'evidence\\tooling-signature.raw';
  put(signatureStdoutPath, signatureRun.stdout || Buffer.alloc(0));
  assert.equal(signatureRun.status, 0, String(signatureRun.stderr));
  const signature = JSON.parse(signatureRun.stdout.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.match(signature.version, /^156\./);
  const helperFile = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperHash = sha(fs.readFileSync(helperFile));
  assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const packageFile = path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json');
  const packageData = JSON.parse(fs.readFileSync(packageFile));
  assert.equal(packageData.version, '1.56.1');
  const provenance = path.join(repo, 'testing', 'browser', 'evidence', 'offline-provenance.json');
  json('evidence\\tooling.json', {
    cardId: 'A-S073', outcome: 'PASS', qualifiedAtUtc: new Date().toISOString(),
    node: process.version, playwright: packageData.version, playwrightPackageSha256: sha(fs.readFileSync(packageFile)),
    browser: signature, signatureVerifier: 'Existing pwsh 7.6.9 / Microsoft.PowerShell.Security 7.0.0.0',
    signatureCommand: command, signatureStdoutPath, signatureStdoutSha256: sha(signatureRun.stdout),
    offlineProvenance: {
      path: 'testing\\browser\\evidence\\offline-provenance.json',
      sha256: sha(fs.readFileSync(provenance)),
      registrySignaturesIndependentlyVerified: false,
    },
    helper: {
      path: 'testing\\browser\\isolated.cjs', sha256: helperHash,
      publication: git(['log', '-1', '--format=%H', '--', 'testing\\browser\\isolated.cjs']),
      api: 'openIsolatedLesson', cleanup: 'await session.close() in finally',
    },
    downloads: 0, installs: 0, unsafeBrowserFlags: false, foregroundLease: false,
    limits: 'Existing offline Node22/PW1.56.1/signed Edge156 pair only; no Node24, native cache recovery, Azure or unattended lifecycle certification.',
  });

  const raw = files().filter((file) => /\.(?:raw|snapshot)$/.test(file)).map((file) => {
    const relative = `learning\\S073\\${file}`;
    const attributes = git(['check-attr', 'text', 'eol', '--', relative]);
    assert.match(attributes, /: text: unset/);
    const rawGitObject = git(['hash-object', '--no-filters', '--', relative]);
    const filteredGitObject = git(['hash-object', `--path=${relative.replace(/\\/g, '/')}`, '--', relative]);
    assert.equal(filteredGitObject, rawGitObject, `Raw bytes would be rewritten: ${file}`);
    return { file, attributes, rawGitObject, filteredGitObject, rawSha256: sha(fs.readFileSync(path.join(root, file))) };
  });
  json('evidence\\attribute-qualification.json', {
    cardId: 'A-S073', outcome: 'PASS', scope: 'Owned .gitattributes only; no root/shared attribute changes',
    distinction: 'Raw source/log bytes remain exact, including CRLF; regular code/doc integrity uses canonical LF Git-source bytes.',
    raw,
  });
  console.log(`Syntax PASS (${syntax.length} files), signed tooling PASS, raw attributes PASS (${raw.length} files).`);
} else if (process.argv[2] === 'index') {
  const entries = files().filter((file) => file !== 'evidence\\content-index.json').map((file) => {
    const raw = fs.readFileSync(path.join(root, file));
    const mode = /\.(?:raw|snapshot)$/.test(file) ? 'raw' : 'canonical-lf';
    const bytes = mode === 'raw' ? raw : canonical(raw);
    return { file, mode, bytes: bytes.length, sha256: sha(bytes) };
  });
  json('evidence\\content-index.json', {
    schemaVersion: 1, cardId: 'A-S073', algorithm: 'SHA-256',
    excluded: ['evidence\\content-index.json'],
    policy: 'Raw provenance is byte-exact. Text/code are qualified against canonical LF Git-source bytes, not volatile checkout CRLF.',
    entries,
  });
  console.log(`Sealed ${entries.length} owned files; index excludes only itself.`);
} else throw new Error('Use explicit qualify, qualify-final or index; ordinary verification never calls this writer.');
