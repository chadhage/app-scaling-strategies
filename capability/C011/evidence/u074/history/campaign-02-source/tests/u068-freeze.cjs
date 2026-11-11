'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, list, sha } = require('./u068-seal.cjs');
const repository = process.env.C011_GIT_REPOSITORY;
const candidate = path.resolve(root, '..', '..');
assert.ok(repository && path.isAbsolute(repository), 'the accepted dependency repository must be explicit');
const destination = path.join(root, 'evidence', 'current');
const target = path.join(destination, 'source-freeze.json');
assert.equal(fs.existsSync(target), false, 'a source freeze is immutable, never repinned');
const accepted = (bytes, convert = true) => {
  const hashes = [sha(bytes)];
  if (convert) {
    const lf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    hashes.push(sha(lf), sha(Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))));
  }
  return [...new Set(hashes)];
};
const files = list().filter((file) => !file.startsWith('evidence/')).map((file) => {
  const bytes = fs.readFileSync(path.join(root, ...file.split('/')));
  return { path: file, bytes: bytes.length, sha256: sha(bytes), acceptedSha256: accepted(bytes) };
});
const PRODUCTION = ['codes.cjs', 'config.cjs', 'contract.js', 'json.cjs', 'page.js', 'server.cjs', 'store.cjs'];
const actual = fs.readdirSync(root).filter((file) => /\.c?js$/.test(file)).sort();
assert.deepEqual(actual, [...PRODUCTION].sort(), 'the whole production set is enumerated without exclusions');
fs.mkdirSync(path.join(destination, 'subjects'), { recursive: true });
const production = PRODUCTION.map((file) => {
  const bytes = fs.readFileSync(path.join(root, file));
  const subject = 'evidence/current/subjects/' + sha(bytes) + '.source.txt';
  fs.writeFileSync(path.join(root, ...subject.split('/')), bytes, { flag: 'wx' });
  return { path: file, subject, rawSha256: sha(bytes) };
});
const context = JSON.parse(fs.readFileSync(path.join(root, 'dependency-context.json')));
const browser = JSON.parse(fs.readFileSync(path.join(candidate, 'private', 'browser-imports.json')));
const inherited = JSON.parse(fs.readFileSync(path.join(candidate, 'private', 'old-original-inherited-manifest.json')));
const paths = [...new Set([...context.sources.map((entry) => entry.path.replaceAll('\\', '/')), ...browser.files.map((entry) => entry.path.replaceAll('\\', '/'))])].sort();
const gitEnv = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete gitEnv[name];
const batch = execFileSync('git', ['-C', repository, '--no-pager', 'cat-file', '--batch'], {
  env: gitEnv, input: paths.map((file) => inherited.parentHead + ':' + file).join('\n') + '\n', windowsHide: true, maxBuffer: 8 * 1024 * 1024
});
let at = 0;
const gitObjects = new Map(paths.map((file) => {
  const end = batch.indexOf('\n', at);
  const [oid, type, length] = batch.subarray(at, end).toString('utf8').split(' ');
  assert.equal(type, 'blob', 'every read-only dependency exists at the fixed accepted parent commit');
  const bytes = batch.subarray(end + 1, end + 1 + Number(length));
  at = end + 2 + Number(length);
  return [file, { oid, bytes }];
}));
const dependencies = paths.map((file) => {
  const bytes = fs.readFileSync(path.join(repository, ...file.split('/')));
  const blob = gitObjects.get(file);
  assert.equal(sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
    sha(Buffer.from(blob.bytes.toString('utf8').replace(/\r\n/g, '\n'))), 'current dependency content matches its accepted Git object');
  const copied = path.join(candidate, ...file.split('/'));
  if (fs.existsSync(copied)) assert.equal(sha(fs.readFileSync(copied)), sha(bytes), 'the private helper/dependency copy is the actual current accepted byte set');
  return { path: file, bytes: bytes.length, sha256: sha(bytes), acceptedSha256: accepted(bytes, !/qualified\.(?:json|addendum\.jsonl)$/.test(file)),
    gitCommit: inherited.parentHead, gitBlobOid: blob.oid, gitBlobSha256: sha(blob.bytes) };
});
const historicalSealBytes=fs.readFileSync(path.join(root,'evidence','final','pins.json'));
const historicalFreezeBytes=fs.readFileSync(path.join(root,'evidence','final','source-freeze.json'));
assert.equal(sha(historicalSealBytes),'168fa6ddf23476df4873e61dcb5031f16852a6fee0a9551a2f14c6f5d2d61dec');
assert.equal(sha(historicalFreezeBytes),'2d9de9701398c2d9d309a04f71e8b4086eabda0647a297c0774063d8b1b10587');
const historicalSeal=JSON.parse(historicalSealBytes),historicalSource=new Set(JSON.parse(historicalFreezeBytes).files.map(entry=>entry.path));
const historical=historicalSeal.files.map(entry=>{
  const file=historicalSource.has(entry.path)?'evidence/u068/history/predecessor-sources/'+entry.path:entry.path;
  assert.equal(sha(fs.readFileSync(path.join(root,...file.split('/')))),entry.sha256,'every old source/evidence byte precedes this freeze unchanged');
  return{path:file,sha256:entry.sha256};
});
historical.push({path:'evidence/final/pins.json',sha256:sha(historicalSealBytes)});
const failedFreezeBytes=fs.readFileSync(path.join(root,'evidence','joint','source-freeze.json'));
assert.equal(sha(failedFreezeBytes),'51d73dd62600b2d1563c8b79ae1b32fe2e2c32f0f56a5efb00ec406ba727d1d1');
for(const entry of JSON.parse(failedFreezeBytes).files){
  const file='evidence/u068/history/frozen-source-epoch-01/'+entry.path;
  assert.equal(sha(fs.readFileSync(path.join(root,...file.split('/')))),entry.sha256);
  historical.push({path:file,sha256:entry.sha256});
}
for(const file of list().filter(file=>file.startsWith('evidence/joint/')||file==='evidence/u069/current-report.json')){
  historical.push({path:file,sha256:sha(fs.readFileSync(path.join(root,...file.split('/'))))});
}
const v2Bytes=fs.readFileSync(path.join(root,'evidence','u069','v3-history','v2-current','source-freeze.json'));
assert.equal(sha(v2Bytes),'47c276a35ae4ef94c7ab61fb6bfa453fd6e4d9b5853757900acbc006f1b43a7f');
const v2=JSON.parse(v2Bytes);
for(const entry of v2.production)assert.equal(sha(fs.readFileSync(path.join(root,entry.path))),entry.rawSha256,'V3 is test/proof correction only: no production edit');
for(const entry of v2.files)assert.equal(sha(fs.readFileSync(path.join(root,'evidence','u069','v3-history','v2-sources',...entry.path.split('/')))),entry.sha256);
for(const file of list().filter(file=>file.startsWith('evidence/u069/v3-history/'))){
  historical.push({path:file,sha256:sha(fs.readFileSync(path.join(root,...file.split('/'))))});
}
fs.writeFileSync(path.join(destination, 'inherited-files.json'), JSON.stringify({
  schema: 'U068-U069-inherited-files/1', policy: 'Exact original untracked byte inventory, not rewritten or republished historical proof',
  files: inherited.files
}, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(target, JSON.stringify({
  schema: 'U068-U069-source-freeze/1', frozenAtUtc: new Date().toISOString(),
  files, production, dependencies, historical, gitIndexOrHeadWritten: false,
  sourcePolicy: 'exact raw/LF/CRLF representations only; no mixed-ending normalization at acceptance'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ frozenSourceFiles: files.length, production: production.length, readOnlyDependencies: dependencies.length, inheritedFiles: inherited.files.length }));
