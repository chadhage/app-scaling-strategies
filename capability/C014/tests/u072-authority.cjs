'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const AREA = path.join(ROOT, 'evidence', 'u072');
const CATALOG = path.join(AREA, 'catalog.json');
const FREEZE = path.join(AREA, 'source-freeze.json');
const SEAL = path.join(AREA, 'public-seal.json');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const normal = (name) => name.replace(/\\/g, '/');
const catalog = () => JSON.parse(fs.readFileSync(CATALOG));
function inside(file) {
  const name = path.relative(ROOT, file);
  return name !== '..' && !name.startsWith(`..${path.sep}`) && !path.isAbsolute(name);
}
function projectedStream(entry, directory = ROOT) {
  const file = path.resolve(directory, entry.path);
  if (!inside(file)) throw new Error('PUBLIC_STREAM_PATH_OUTSIDE_NAMESPACE');
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== entry.gzipSha256) throw new Error('PUBLIC_STREAM_GZIP_CHANGED');
  const raw = zlib.gunzipSync(bytes);
  if (raw.length !== entry.bytes || sha(raw) !== entry.sha256) throw new Error('PUBLIC_STREAM_CONTENT_CHANGED');
  if (entry.role && (entry.role !== 'path-projected UTF-8 stream, not original raw' || !/^[a-f0-9]{64}$/.test(entry.origin?.sha256 || '')
    || !/^[a-f0-9]{64}$/.test(entry.origin?.gzipSha256 || '') || entry.origin.role !== 'immutable private original')) throw new Error('PUBLIC_STREAM_ROLE_CHANGED');
  return raw;
}
function sourceMatches(entries, repository = REPO) {
  const problems = [];
  for (const entry of entries || []) {
    const file = path.join(repository, entry.path);
    if (!fs.existsSync(file)) { problems.push(`source input ${entry.path} is missing`); continue; }
    const expected = entry.crlfToLfSha256 || entry.canonicalLfSha256;
    if (sha(lf(fs.readFileSync(file))) !== expected) problems.push(`source input ${entry.path} changed after the capture`);
  }
  return problems;
}
function verifyPublicCapture(file, repository = REPO) {
  const problems = [];
  const manifest = JSON.parse(fs.readFileSync(file));
  const name = path.basename(file);
  for (const label of ['stdout', 'stderr']) {
    try { projectedStream(manifest.transcripts[label], path.dirname(file)); } catch (error) { problems.push(`${name}: ${label} ${error.message}`); }
  }
  if (!manifest.origin || !/^[a-f0-9]{64}$/.test(manifest.origin.manifestSha256 || '')) problems.push(`${name}: private-origin digest/role is missing`);
  if (manifest.role === 'source-exact reused execution' || manifest.role === 'new source-complete execution') {
    problems.push(...sourceMatches(manifest.inputs, repository).map((text) => `${name}: ${text}`));
    for (const entry of manifest.dataInputs || []) {
      const target = path.join(ROOT, entry.sourceWitness);
      if (!fs.existsSync(target) || sha(lf(fs.readFileSync(target))) !== entry.crlfToLfSha256) problems.push(`${name}: versioned public data witness ${entry.sourceWitness} changed`);
    }
    if (manifest.timedOut || manifest.exitCode !== manifest.expectedExitCode) problems.push(`${name}: qualifying exit state changed`);
  } else if (manifest.role === 'private historical attempt projection, not source-qualified') {
    if (manifest.inputs.length || manifest.historicalInputs.some((entry) => entry.role !== 'private historical input digest, not a public filesystem requirement')) problems.push(`${name}: private history was relabeled public source`);
    if (manifest.exitCode !== manifest.origin.exitCode || manifest.expectedExitCode !== manifest.origin.expectedExitCode) problems.push(`${name}: historical exit observation changed`);
  } else problems.push(`${name}: unrecognized public capture role`);
  return problems;
}
function retainedManifests() {
  const old = require('./final-base.cjs').index().files;
  return Object.keys(old).filter((name) => name.endsWith('.json')).filter((name) => {
    try { return Boolean(JSON.parse(fs.readFileSync(path.join(ROOT, name))).transcripts); } catch { return false; }
  }).map((name) => path.join(ROOT, name));
}
function verifyRetainedCapture(file, declaration) {
  const problems = [];
  const name = path.basename(file);
  const bytes = fs.readFileSync(file);
  const data = JSON.parse(bytes);
  if (sha(bytes) !== declaration.sha256) problems.push(`${name}: retained historical manifest changed`);
  if (declaration.sourceQualified !== false || !['inherited tracked historical capture', 'retained private-build historical byte-copy'].includes(declaration.role)) problems.push(`${name}: historical role changed`);
  if (data.exitCode !== declaration.observedExitCode || data.expectedExitCode !== declaration.expectedExitAtOriginalAttempt || data.timedOut !== declaration.timedOutAtOriginalAttempt) problems.push(`${name}: historical exit observation changed`);
  for (const label of ['stdout', 'stderr']) {
    try { projectedStream(data.transcripts[label], path.dirname(file)); } catch (error) { problems.push(`${name}: ${label} historical public bytes changed: ${error.message}`); }
  }
  if ((declaration.inputDigests || []).some((entry) => entry.role !== 'original historical input digest; not an assumed current public file')) problems.push(`${name}: historical input was relabeled current public`);
  return problems;
}
function publicManifests() {
  const data = catalog();
  return [...new Set([...(data.retained || []).map((entry) => path.join(ROOT, entry.path)), ...data.manifests.map((entry) => path.join(ROOT, entry.path))])].sort();
}
function current(stem) {
  const name = catalog().current[stem];
  return name ? path.join(ROOT, name) : null;
}
function readDocument(file) {
  const data = JSON.parse(fs.readFileSync(file));
  const text = projectedStream(data.transcripts.stdout, path.dirname(file)).toString('utf8').replace(/\r\n/g, '\n');
  const first = text.search(/^\{$/m);
  const last = text.lastIndexOf('\n}\n');
  return JSON.parse(text.slice(first, last + 2));
}
function mutationEvidence() {
  const data = catalog();
  return { reports: [JSON.parse(fs.readFileSync(path.join(ROOT, data.mutation.systematic)))], reruns: [],
    equivalents: JSON.parse(fs.readFileSync(path.join(ROOT, data.mutation.equivalents))) };
}
function verifyMutationTransport() {
  const data = catalog();
  const problems = [];
  function verifyRun(run) {
    if (!run?.streams) { problems.push('a current mutation has no public stream witness'); return; }
    try {
      const text = projectedStream(run.streams.stdout).toString('utf8').replace(/\r\n/g, '\n');
      projectedStream(run.streams.stderr);
      if (run.killed) {
        if (run.timedOut || run.invalid || run.crash || !run.failing.length) problems.push('a mutation fault/timeout was relabeled a kill');
        for (const name of run.failing) if (!text.includes(name)) problems.push(`mutation named assertion missing: ${name}`);
      }
      if (run.workBarrier) verifyRun(run.workBarrier);
    } catch (error) { problems.push(error.message); }
  }
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, data.mutation.systematic)));
  problems.push(...sourceMatches(report.transport.consumedInputs));
  if (report.transport.role !== 'source-exact reused actual campaign, not a fresh run') problems.push('mutation source role changed');
  for (const entry of Object.values(report.files)) { verifyRun(entry.control); for (const run of entry.results) verifyRun(run); }
  const curated = JSON.parse(fs.readFileSync(path.join(ROOT, data.mutation.curated)));
  problems.push(...sourceMatches(curated.transport.consumedInputs));
  for (const run of [...Object.values(curated.controls), ...curated.results]) verifyRun(run);
  if (curated.unresolved.length || curated.undecided || curated.killed + curated.equivalent !== curated.total) problems.push('curated mutation closure changed');
  return problems;
}
function sourceNames() {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? entry.name === 'scratch' ? [] : walk(path.join(dir, entry.name)) : [normal(path.relative(ROOT, path.join(dir, entry.name)))]);
  return [...fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name), ...walk(path.join(ROOT, 'tests'))].sort();
}
function verifyProduction() {
  const problems = [];
  const data = catalog();
  for (const [name, pin] of Object.entries(data.production)) if (sha(lf(fs.readFileSync(path.join(ROOT, name)))) !== pin.canonicalLfSha256) problems.push(`FROZEN_PRODUCTION_CHANGED: ${name}`);
  return problems;
}
function freeze() {
  const data = { schema: 'U072-public-source-freeze/1', sources: {}, production: catalog().production,
    rule: 'Public source and current role catalogue are frozen; final validation raw stays private. No production behavior change.' };
  for (const name of sourceNames()) {
    const bytes = fs.readFileSync(path.join(ROOT, name));
    data.sources[name] = { rawSha256: sha(bytes), canonicalLfSha256: sha(lf(bytes)) };
  }
  data.catalogSha256 = sha(fs.readFileSync(CATALOG));
  fs.writeFileSync(FREEZE, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  return Object.keys(data.sources).length;
}
function verifySource() {
  if (!fs.existsSync(FREEZE)) return ['PUBLIC_SOURCE_FREEZE_MISSING'];
  const data = JSON.parse(fs.readFileSync(FREEZE));
  const problems = verifyProduction();
  if (JSON.stringify(Object.keys(data.sources).sort()) !== JSON.stringify(sourceNames())) problems.push('PUBLIC_SOURCE_FILE_SET_CHANGED');
  for (const [name, pin] of Object.entries(data.sources)) if (!fs.existsSync(path.join(ROOT, name)) || sha(lf(fs.readFileSync(path.join(ROOT, name)))) !== pin.canonicalLfSha256) problems.push(`PUBLIC_SOURCE_CHANGED: ${name}`);
  if (sha(fs.readFileSync(CATALOG)) !== data.catalogSha256) problems.push('PUBLIC_CATALOG_CHANGED');
  return problems;
}
function seal() {
  const names = require('./seal.cjs').sealedNames(ROOT);
  const files = {};
  const lfs = {};
  for (const name of names) { const bytes = fs.readFileSync(path.join(ROOT, name)); files[name] = sha(bytes); lfs[name] = sha(lf(bytes)); }
  fs.writeFileSync(SEAL, JSON.stringify({ schemaVersion: 1, schema: 'U072-complete-public-namespace-seal/1', files, lf: lfs,
    sourceFreezeSha256: sha(fs.readFileSync(FREEZE)), description: 'Only bytes actually present in this exact public namespace. Private original history has digest/role references and labelled public projections, not assumed filesystem inputs.' }, null, 2) + '\n', { flag: 'wx' });
  return names.length;
}
function verifyCurrentSeal() {
  if (!fs.existsSync(SEAL)) return ['PUBLIC_SEAL_MISSING'];
  const sealed = JSON.parse(fs.readFileSync(SEAL));
  const problems = require('./seal.cjs').verifySeal(sealed, { names: require('./seal.cjs').sealedNames(ROOT),
    read: (name) => fs.existsSync(path.join(ROOT, name)) ? fs.readFileSync(path.join(ROOT, name)) : undefined });
  if (sealed.sourceFreezeSha256 !== sha(fs.readFileSync(FREEZE))) problems.push('PUBLIC_SOURCE_ANCHOR_CHANGED');
  return problems;
}
module.exports = { ROOT, REPO, AREA, CATALOG, FREEZE, SEAL, sha, lf, catalog, projectedStream, sourceMatches, verifyPublicCapture,
  retainedManifests, verifyRetainedCapture, publicManifests, current, readDocument, mutationEvidence, verifyMutationTransport, sourceNames, verifyProduction, freeze, verifySource, seal, verifyCurrentSeal };
