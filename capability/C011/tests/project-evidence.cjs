'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const namespace = path.resolve(__dirname, '..');
const root = path.resolve(namespace, '..', '..');
const repository = process.env.C011_GIT_REPOSITORY;
const destination = path.join(namespace, 'evidence', 'final');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const slash = (value) => value.replaceAll('\\', '/');
const replacements = [
  [root, '<PRIVATE-C011>'], [repository, '<REPO>'], [process.env.USERPROFILE, '<PROFILE>']
].filter(([value]) => value).sort((a, b) => b[0].length - a[0].length);
function portable(value) {
  let text = String(value);
  for (const [actual, replacement] of replacements) {
    for (const form of [actual, actual.replaceAll('\\', '/'), JSON.stringify(actual).slice(1, -1)]) text = text.split(form).join(replacement);
  }
  text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<PRIVATE-INVOCATION>');
  return text;
}
function write(relative, bytes) {
  const file = path.join(destination, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    assert.equal(sha(fs.readFileSync(file)), sha(bytes), 'an immutable existing witness must be exact');
    return;
  }
  fs.writeFileSync(file, bytes, { flag: 'wx' });
}
function projectStream(relative, bytes, originalGzipSha256 = null) {
  const projected = Buffer.from(portable(bytes.toString('utf8')));
  const compressed = gzipSync(projected, { level: 9 });
  write(relative, compressed);
  return { kind: 'public projection, NOT original raw', path: 'evidence/final/' + relative,
    privateOriginalSha256: sha(bytes), privateOriginalGzipSha256: originalGzipSha256,
    privateOriginalBytes: bytes.length, projectionBytes: projected.length,
    projectionSha256: sha(projected), projectionGzipSha256: sha(compressed) };
}
function forms(bytes) {
  const lf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  return [...new Set([sha(bytes), sha(lf), sha(Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n')))])];
}
function inputOf(input, captureName) {
  const absolute = path.resolve(repository, input.path);
  let relative = slash(path.relative(root, absolute));
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    relative = slash(path.relative(repository, absolute));
    const frozen = json(path.join(destination, 'source-freeze.json'));
    assert.ok(frozen.dependencies.some((entry) => entry.path === relative), 'only explicitly frozen read-only dependencies are accepted outside the private candidate');
  }
  let subject = relative.startsWith('capability/C011/') ? relative.slice('capability/C011/'.length) : null;
  let bytes = fs.readFileSync(absolute);
  const matches = (value) => sha(value) === input.rawSha256;
  if (!matches(bytes)) {
    const alternatives = [
      relative.startsWith('capability/C011/') ? path.join(root, 'private', 'inherited-C011', relative.slice('capability/C011/'.length)) : null,
      path.join(root, 'private', 'subjects', captureName, path.basename(absolute))
    ].filter(Boolean);
    const historical = alternatives.find((file) => fs.existsSync(file) && matches(fs.readFileSync(file)));
    assert.ok(historical, 'a historical input needs exact retained bytes, never a reconstructed pin');
    bytes = fs.readFileSync(historical);
    const witness = 'subjects/' + sha(bytes) + '.source.txt';
    write(witness, bytes);
    subject = 'evidence/final/' + witness;
  }
  return { path: relative, subject: subject ? { scope: 'C011', path: subject } : { scope: 'readonly-repository', path: relative },
    rawSha256: input.rawSha256, lfSha256: input.crlfToLfSha256, acceptedSha256: forms(bytes), bytes: input.bytes };
}
function capture(name) {
  const file = path.join(root, 'private', 'captures', name + '.json');
  const original = fs.readFileSync(file);
  const record = JSON.parse(original);
  const streams = {};
  for (const stream of ['stdout', 'stderr']) {
    const source = record.transcripts[stream];
    const compressed = fs.readFileSync(path.join(path.dirname(file), source.path));
    assert.equal(sha(compressed), source.gzipSha256);
    const bytes = gunzipSync(compressed);
    assert.equal(sha(bytes), source.sha256);
    streams[stream] = projectStream('streams/' + name + '.' + stream + '.projection.txt.gz', bytes, source.gzipSha256);
  }
  const result = {
    schema: 'C011-public-capture/1', name, kind: 'portable projection, private originals unchanged',
    privateOriginalRecordSha256: sha(original), purpose: portable(record.purpose),
    commandProjection: record.command.map(portable), nodeRuntime: record.nodeRuntime,
    startedAtUtc: record.startedAtUtc, completedAtUtc: record.completedAtUtc,
    execution: { exitCode: record.exitCode, expectedExitCode: record.expectedExitCode,
      signal: record.signal, timedOut: record.timedOut, spawnError: record.spawnError && portable(record.spawnError) },
    inputs: record.inputs.map((input) => inputOf(input, name)), summary: record.summary, transcripts: streams
  };
  write('records/' + name + '.json', Buffer.from(JSON.stringify(result, null, 2) + '\n'));
  return { name, path: 'evidence/final/records/' + name + '.json', privateOriginalRecordSha256: sha(original) };
}
function extra(name, relative) {
  assert.ok(relative.startsWith('private' + path.sep) || relative.startsWith('private/'));
  const file = path.join(root, relative);
  const bytes = fs.readFileSync(file);
  let data = json(file);
  if (data.schema === 'C011-mutation/1' || data.schema === 'C011-load-loop/1') {
    const visits = data.schema === 'C011-load-loop/1' ? data.runs : data.entries.flatMap((entry) => entry.observations);
    for (const [index, run] of visits.entries()) {
      for (const stream of ['stdout', 'stderr']) {
        const source = run.streams[stream];
        const compressed = fs.readFileSync(path.join(path.dirname(file), source.path));
        assert.equal(sha(compressed), source.gzipSha256);
        const raw = gunzipSync(compressed);
        assert.equal(sha(raw), source.sha256);
        source.publicProjection = projectStream(`${name}-streams/${String(index + 1).padStart(6, '0')}.${stream}.projection.txt.gz`, raw, source.gzipSha256);
        source.privateOriginalPath = '<PRIVATE>/' + slash(source.path);
        delete source.path;
      }
    }
  }
  data = JSON.parse(portable(JSON.stringify(data)));
  const value = { schema: 'C011-public-data/1', name, kind: 'public projection, NOT original raw',
    privateOriginalSha256: sha(bytes), data };
  write('data/' + name + '.projection.json', Buffer.from(JSON.stringify(value, null, 2) + '\n'));
  return { name, path: 'evidence/final/data/' + name + '.projection.json', privateOriginalSha256: sha(bytes) };
}
module.exports = { portable, projectStream, capture, extra, sha };
if (require.main === module) {
  assert.ok(repository && path.isAbsolute(repository), 'the owning Git repository is explicit');
  const spec = json(process.argv[2]);
  const records = spec.captures.map(capture);
  const data = spec.extras.map((entry) => extra(entry.name, entry.path));
  write('catalog.json', Buffer.from(JSON.stringify({
    schema: 'C011-final-catalog/1', records, data, privateOriginalsRetained: true,
    projectionPolicy: 'portable public derivatives are distinct from their immutable, separately hashed private originals'
  }, null, 2) + '\n'));
  console.log(JSON.stringify({ records: records.length, data: data.length }));
}
