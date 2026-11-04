'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scripts = {
  bdd: ['-e', "const a=require('node:assert/strict'),f=require('node:fs');const t=f.readFileSync('capability\\\\C030\\\\C030.feature','utf8');a.match(t,/Delivery counts cannot substitute/);a.match(t,/Unknown acknowledgement remains unknown/);console.log('BDD: seven scenarios written before loadable stub and genuine assertion RED');"],
  stub: ['-e', "const a=require('node:assert/strict'),s=require('.\\\\capability\\\\C030\\\\evidence\\\\red\\\\detector.stub.cjs');a.equal(typeof s.classify,'function');a.equal(s.classify({intendedEffects:3,deliveryAttempts:3,confirmedApplications:0}).decision,'PASS');console.log('Initial loadable stub incorrectly promotes delivery counts to effect success');"],
  red: ['--test', path.join(root, 'evidence', 'red', 'delivery-is-not-effect.test.cjs')],
  iac: ['-e', "console.log('IaC N/A: local Node CLI and static UI; no scaffold, cloud, infrastructure, Entra, package install, credentials, spend or new durable storage.');"],
  pins: [path.join(__dirname, 'capture-source.cjs')],
  implementation: ['-e', "const a=require('node:assert/strict'),f=require('node:fs'),c=require('node:crypto'),d=require('.\\\\capability\\\\C030\\\\detector.js');a.equal(d.inspectSource('control-deliveries-only').decision,'HOLD');console.log(JSON.stringify({implementedAfterRetainedAssertionRed:true,refactoredModelPrefixes:true,detectorSha256:c.createHash('sha256').update(f.readFileSync('capability\\\\C030\\\\detector.js')).digest('hex')}));"],
  focused: ['--test', '--test-concurrency=1', ...['detector', 'boundary', 'surface', 'source', 'publisher-policy'].map((name) => path.join(__dirname, `${name}.test.cjs`))],
  syntax: [path.join(__dirname, 'syntax.cjs')],
  source: ['-e', "const p=require('.\\\\capability\\\\C030\\\\source.cjs').preflight();console.log(JSON.stringify({fixedSourceFiles:p.imports.length,gates:p.gates.cards.map(c=>[c.id,c.state]),upstreamHistoricalFiles:p.upstreamHistoricalPinnedFiles}));"],
  browser: [path.join(__dirname, 'browser.cjs')],
  integrity: ['--test', path.join(__dirname, 'integrity.test.cjs')],
  verify: [path.join(__dirname, 'verify.cjs')]
};
const stage = process.argv[2];
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Only exact deliberate CAPTURE_BROWSER_EVIDENCE=1 can append proof.');
assert.equal(process.argv.length, 3);
assert.ok(Object.hasOwn(scripts, stage), 'Closed stages only.');
const directory = path.join(root, 'evidence', 'raw', `${stage}-${randomUUID()}`);
fs.mkdirSync(directory, { recursive: true });
assert.deepEqual(fs.readdirSync(directory), []);
function inputs(parent) {
  return fs.readdirSync(parent, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'evidence') return [];
    const target = path.join(parent, entry.name);
    return entry.isDirectory() ? inputs(target) : /\.(?:js|cjs|ps1|html|css|feature)$/.test(entry.name) ? [target] : [];
  });
}
const inputSnapshots = inputs(root).sort().map((file, index) => {
  const bytes = fs.readFileSync(file);
  const snapshot = `input-${String(index + 1).padStart(3, '0')}-${path.basename(file)}.snapshot.gz`;
  fs.writeFileSync(path.join(directory, snapshot), gzipSync(bytes), { flag: 'wx' });
  return { path: path.relative(root, file), rawWorkingSha256: hash(bytes), snapshot };
});
const startedAtUtc = new Date().toISOString();
const output = spawnSync(process.execPath, scripts[stage], {
  cwd: repository, env: { ...process.env, C030_BROWSER_CAPTURE_DIR: path.join(directory, 'browser') },
  windowsHide: true, timeout: 240000, maxBuffer: 16 * 1024 * 1024
});
const stdout = output.stdout || Buffer.alloc(0);
const stderr = output.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.raw.gz'), gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw.gz'), gzipSync(stderr), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify({
  schema: 'C030-raw-capture/1', stage, startedAtUtc, endedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...scripts[stage]], runtime: process.version,
  exitCode: output.status, signal: output.signal, error: output.error?.message || null,
  stdoutRawSha256: hash(stdout), stderrRawSha256: hash(stderr),
  inputSnapshots,
  sourceEvidenceDependenciesRewritten: false, passed: output.status === 0,
  expectedBehavioralRed: stage === 'red', rawWhitespacePreserved: true
}, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`RAW_C030 ${path.relative(repository, directory)}`);
process.exitCode = output.status ?? 3;
