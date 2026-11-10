'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const OUT = path.join(ROOT, 'evidence', 'u072');
const old = path.resolve(process.argv[2]);
const oldNS = path.join(old, 'capability', 'C014');
const oldPrivate = path.join(old, 'private-evidence');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const base = JSON.parse(fs.readFileSync(path.join(oldNS, 'evidence', 'final-20261110', 'baseline-index.json')));
const ids = JSON.parse(process.env.C014_PRIVATE_IDENTIFIERS || '[]');
const user = /[\\/]Users[\\/]([^\\/]+)/i.exec(old)?.[1];
assert.ok(user && ids.some((entry) => entry.id === 'parent-session'));
const roots = [[old, '<PRIVATE-C014>'], [process.env.C014_GIT_ANCHOR, '<REPO>']].filter(([value]) => value);
function project(text) {
  for (const [value, replacement] of roots) {
    text = text.split(value.replace(/\\/g, '\\\\')).join(replacement).split(value).join(replacement)
      .split(value.replace(/\\/g, '/')).join(replacement);
  }
  text = text.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/g, '<HOME>');
  for (const { id, value } of [...ids, { id: 'local-user', value: user }, { id: 'execution-prefix', value: /execution-\d+-([a-f0-9]+)/i.exec(old)?.[1] }]) {
    if (value) text = text.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `<LOCAL:${id}>`);
  }
  return text;
}
function projectedObject(value) {
  if (typeof value === 'string') return /^[a-f0-9]{40,64}$/i.test(value) ? value : project(value);
  if (Array.isArray(value)) return value.map(projectedObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [project(key), projectedObject(child)]));
  return value;
}
const relative = (file) => path.relative(ROOT, file).replace(/\\/g, '/');
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
const streams = new Map();
function stream(file, namespace, label) {
  const key = `${namespace}:${file}`;
  if (streams.has(key)) return streams.get(key);
  const compressed = fs.readFileSync(file);
  const original = zlib.gunzipSync(compressed);
  const projection = Buffer.from(project(original.toString('utf8')), 'utf8');
  const output = zlib.gzipSync(projection, { level: 9 });
  const id = hash(Buffer.from(key)).slice(0, 24);
  const target = path.join(OUT, 'streams', `${id}.${label}.projection.gz`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output, { flag: 'wx' });
  const result = { role: 'path-projected UTF-8 stream, not original raw', path: relative(target), bytes: projection.length,
    sha256: hash(projection), gzipSha256: hash(output), origin: { role: 'immutable private original', bytes: original.length,
      sha256: hash(original), gzipSha256: hash(compressed), privateReference: namespace } };
  streams.set(key, result);
  return result;
}
function inputs(entries) {
  return (entries || []).map((entry) => ({ path: entry.path.replace(/\\/g, '/'), bytes: entry.bytes,
    rawSha256: entry.rawSha256, crlfToLfSha256: entry.crlfToLfSha256 }));
}
const catalog = { schema: 'C014-public-transport/1', status: 'public source-complete build; not parent acceptance',
  baseCommit: base.commit, preservedTrackedFiles: Object.keys(base.files).length,
  production: {}, origins: [], manifests: [], current: {}, mutation: {}, inheritedIdentifierPolicy: 'Five already-tracked original identifier streams remain exact at their original paths only. No whole-history privacy claim.' };
for (const name of ['canon.cjs','redact.cjs','vault.cjs','evidence.cjs','service.cjs','server.cjs','page.js']) {
  const bytes = fs.readFileSync(path.join(ROOT, name));
  assert.ok(bytes.equals(fs.readFileSync(path.join(oldNS, name))));
  catalog.production[name] = { rawSha256: hash(bytes), canonicalLfSha256: hash(lf(bytes)) };
}
function capture(file, role, name) {
  const originalBytes = fs.readFileSync(file);
  const original = JSON.parse(originalBytes);
  const projected = projectedObject(original);
  const target = path.join(OUT, 'captures', `${name}.json`);
  const data = { schemaVersion: 1, schema: 'C014-public-capture-projection/1', name, role,
    origin: { manifestSha256: hash(originalBytes), role: 'immutable private capture; not executed anew',
      expectedExitCode: original.expectedExitCode, exitCode: original.exitCode, timedOut: original.timedOut,
      commandProjection: projected.command },
    exitCode: original.exitCode, expectedExitCode: original.expectedExitCode, timedOut: original.timedOut,
    summary: projected.summary, inputs: role === 'source-exact reused execution' ? inputs(original.inputs) : [],
    historicalInputs: role === 'source-exact reused execution' ? [] : inputs(original.inputs).map((entry) => ({ ...entry, role: 'private historical input digest, not a public filesystem requirement' })),
    transcripts: {} };
  for (const label of ['stdout', 'stderr']) {
    const entry = stream(path.join(path.dirname(file), original.transcripts[label].path), `capture:${name}:${label}`, label);
    data.transcripts[label] = { ...entry, path: path.relative(path.dirname(target), path.join(ROOT, entry.path)).replace(/\\/g, '/') };
  }
  write(target, data);
  catalog.manifests.push({ path: relative(target), role, originManifestSha256: hash(originalBytes) });
  return relative(target);
}
const privateNames = ['red-final-behavior-01','red-final-flood-01','green-final-focused-01'];
for (const name of privateNames) {
  const dir = path.join(oldNS, 'evidence', 'final-20261110', name);
  for (const entry of fs.readdirSync(dir).filter((entry) => entry.endsWith('.json'))) {
    const bytes = fs.readFileSync(path.join(dir, entry));
    const projection = { schema: 'C014-private-attempt-document-projection/1', role: 'historical private attempt document; not a current public execution',
      origin: { sha256: hash(bytes), privateReference: `C014-final/${name}/${entry}` },
      documentProjection: projectedObject(JSON.parse(bytes)) };
    const target = path.join(OUT, 'private-attempt-documents', name, entry);
    write(target, projection);
    catalog.origins.push({ role: projection.role, originSha256: hash(bytes), publicProjection: relative(target) });
  }
  capture(path.join(dir, `${name}.json`), 'private historical attempt projection, not source-qualified', `history-${name}`);
}
const reused = {
  'coverage-focused': 'coverage-focused-06', 'browser-run': 'browser-run-07', 'browser-cleanup': 'browser-cleanup-04',
  'loop-load': 'loop-load-06', 'review-repro': 'review-repro-final-01', 'review-flood': 'review-flood-final-01',
  'red-family': 'red-family-final-03', 'green-family': 'green-family-final-04', 'equivalences': 'equivalences-final-01'
};
for (const [kind, name] of Object.entries(reused)) catalog.current[kind] = capture(path.join(oldPrivate, 'final-captures', name, `${name}.json`), 'source-exact reused execution', name);
function runProjection(run, prefix) {
  if (!run?.streams) return run;
  const out = { ...projectedObject(run), streams: {} };
  for (const label of ['stdout','stderr']) out.streams[label] = stream(path.join(oldPrivate, run.streams[label].privatePath || run.streams[label].path), `${prefix}:${label}`, label);
  if (run.workBarrier) out.workBarrier = runProjection(run.workBarrier, `${prefix}:work`);
  return out;
}
const reportFile = path.join(oldPrivate, 'systematic-06-final.json');
const reportBytes = fs.readFileSync(reportFile);
const report = JSON.parse(reportBytes);
const publicReport = projectedObject(report);
publicReport.transport = { schema: 'C014-public-mutation-witness-transport/1', role: 'source-exact reused actual campaign, not a fresh run',
  originalReportSha256: hash(reportBytes), consumedInputs: report.inputs };
for (const [file, entry] of Object.entries(report.files)) {
  publicReport.files[file].control = runProjection(entry.control, `mutation:${file}:control`);
  publicReport.files[file].results = entry.results.map((run) => runProjection(run, `mutation:${file}:${run.index}`));
}
write(path.join(OUT, 'mutations', 'systematic.json'), publicReport);
catalog.mutation.systematic = 'evidence/u072/mutations/systematic.json';
const curatedBytes = fs.readFileSync(path.join(oldPrivate, 'curated-final.json'));
const curated = JSON.parse(curatedBytes);
const publicCurated = projectedObject(curated);
publicCurated.transport = { role: 'source-exact reused actual curated campaign, not a fresh run', originalReportSha256: hash(curatedBytes) };
publicCurated.controls = Object.fromEntries(Object.entries(curated.controls).map(([file, run]) => [file, runProjection(run, `curated:${file}:control`)]));
publicCurated.results = curated.results.map((run, index) => runProjection(run, `curated:${index}`));
write(path.join(OUT, 'mutations', 'curated.json'), publicCurated);
catalog.mutation.curated = 'evidence/u072/mutations/curated.json';
catalog.mutation.equivalents = 'evidence/mutants/equivalents-final.json';
catalog.mutation.consumedInputs = report.inputs;
catalog.documentation = { current: 'PUBLIC-TRANSPORT.md', 'README.md': 'retained byte-exact private-source documentation, including its explicitly historical figures; not the U072 publication protocol' };
catalog.streamCount = streams.size;
write(path.join(OUT, 'catalog.json'), catalog);
console.log(JSON.stringify({ moduleHashesFrozen: 7, historicalPrivateDocuments: catalog.origins.length, publicCaptureProjections: catalog.manifests.length, projectedOriginalStreams: streams.size }));
