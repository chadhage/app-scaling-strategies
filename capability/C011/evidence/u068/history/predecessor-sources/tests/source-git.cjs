'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const namespace = path.resolve(__dirname, '..');
const root = path.resolve(namespace, '..', '..');
const repository = process.env.C011_GIT_REPOSITORY;
const output = process.env.C011_SOURCE_OUTPUT;
assert.ok(repository && path.isAbsolute(repository) && output && path.isAbsolute(output));
assert.equal(fs.existsSync(output), false);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(namespace, ...file.split('/')));
const freeze = JSON.parse(read('evidence/final/source-freeze.json'));
const inherited = JSON.parse(read('evidence/final/inherited-files.json'));
const failures = [];
const blobs = [];
for (const pin of freeze.files) {
  const bytes = read(pin.path);
  if (!pin.acceptedSha256.includes(sha(bytes))) failures.push('FROZEN_SOURCE_DIFFERS:' + pin.path);
}
for (const pin of inherited.files) {
  const file = path.join(repository, 'capability', 'C011', pin.path);
  if (sha(fs.readFileSync(file)) !== pin.sha256) failures.push('INHERITED_LIVE_BYTE_DIFFERS:' + pin.path);
}
for (const pin of freeze.dependencies) {
  const bytes = fs.readFileSync(path.join(repository, ...pin.path.split('/')));
  if (!pin.acceptedSha256.includes(sha(bytes))) failures.push('CURRENT_DEPENDENCY_DIFFERS:' + pin.path);
}
const env = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[name];
for (const production of freeze.production) {
  const bytes = read(production.path);
  const oid = execFileSync('git', ['-C', repository, '--no-pager', 'hash-object', '--no-filters', '--stdin'], { env, input: bytes, windowsHide: true }).toString('utf8').trim();
  assert.match(oid, /^[0-9a-f]{40}$/);
  blobs.push({ path: production.path, rawSha256: sha(bytes), gitBlobOid: oid, committedClaimed: false });
}
const empty = path.join(root, 'private', 'whitespace-' + randomUUID());
fs.mkdirSync(empty);
let whitespace;
try {
  whitespace = spawnSync('git', ['-C', repository, '-c', 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol', '-c', 'core.autocrlf=false', '--no-pager',
    'diff', '--no-index', '--check', '--', empty, namespace], { env, windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (whitespace.error || ![0, 1].includes(whitespace.status) || whitespace.stdout.length || whitespace.stderr.length) failures.push('GIT_WHITESPACE_CHECK_FAILED');
} finally { fs.rmdirSync(empty); }
const consumers = [];
function scan(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || ['evidence', 'node_modules', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.(?:cjs|js|mjs)$/.test(entry.name)) continue;
    const relative = path.relative(repository, file).replaceAll('\\', '/');
    if (relative.startsWith('capability/C011/')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/(?:require\s*\(\s*|from\s*)['"][^'"]*(?:[/\\]C011[/\\]|capability[/\\]C011)/.test(text)) consumers.push(relative);
  }
}
for (const directory of ['capability', 'learning', 'testing']) scan(path.join(repository, directory));
if (consumers.length) failures.push('CURRENT_EXECUTABLE_CONSUMERS_REQUIRE_EXPLICIT_REPLAY');
const result = {
  schema: 'C011-source-git-consumer/1', passed: failures.length === 0,
  frozenSourceMatches: !failures.some((value) => value.startsWith('FROZEN_SOURCE')),
  inheritedLiveBytesUnchanged: !failures.some((value) => value.startsWith('INHERITED_LIVE')),
  currentAcceptedDependenciesMatch: !failures.some((value) => value.startsWith('CURRENT_DEPENDENCY')),
  inheritedFiles: inherited.files.length, productionBlobOids: blobs,
  gitIndexOrHeadWritten: false, consumers, consumerScope: 'literal executable require/import paths in first-party source and tests; evidence, packages and private trees excluded',
  whitespace: { code: whitespace.status, differencesExpected: true, noDiagnosticsRequired: true,
    stdout: whitespace.stdout.toString('utf8'), stderr: whitespace.stderr.toString('utf8') },
  failures
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
assert.equal(result.passed, true, 'source, dependency, consumer and Git gates are real, not a bypass');
