'use strict';

// Execute the unchanged shared recorder with an explicit private repository-root adapter.
// Logical commands and input names remain portable; only its disk root and child cwd are mapped.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const shared = process.env.C014_SHARED_RECORDER;
if (!shared) throw new Error('C014_SHARED_RECORDER must name the existing shared recorder');
const source = fs.readFileSync(shared, 'utf8');
const declaration = /^const repo = ('(?:\\.|[^'])*');$/m.exec(source);
if (!declaration) throw new Error('shared recorder root declaration is not recognized');
const originalRoot = vm.runInNewContext(declaration[1]);
const [name, expected, ...rest] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name) || !/^[01]$/.test(expected) || rest[0] !== '--') throw new Error('name expectedExit -- nodeArguments');
const finalMode = process.env.C014_PHASE === 'final';
let phaseAnchor = null;
if (finalMode) {
  const phase = require('./final-phase.cjs');
  const problems = [...phase.verifySource(), ...phase.verifyCurrentSeal()];
  if (problems.length) throw new Error(`Final capture refused before execution: ${problems.join(', ')}`);
  phaseAnchor = { sourceFreezeSha256: crypto.createHash('sha256').update(fs.readFileSync(phase.FREEZE)).digest('hex'),
    sealSha256: crypto.createHash('sha256').update(fs.readFileSync(phase.SEAL)).digest('hex') };
}
const directory = process.env.C014_CAPTURE_PRIVATE === '1' ? path.join(REPOSITORY, 'private-evidence', 'final-captures', name)
  : path.join(ROOT, 'evidence', 'final-20261110', name);
fs.mkdirSync(directory, { recursive: true });
function executedInputs(args) {
  const found = new Set([__filename, path.join(__dirname, 'sanitized-run.cjs')]);
  const add = (file) => { if (fs.existsSync(file) && fs.statSync(file).isFile()) found.add(path.resolve(file)); };
  for (const arg of args) if (!arg.startsWith('-')) add(path.resolve(REPOSITORY, arg));
  const entries = [...found].map((file) => path.basename(file));
  const tests = (names) => names.forEach((value) => add(path.join(__dirname, `${value}.test.cjs`)));
  if (entries.includes('suite.cjs') || entries.includes('fresh.cjs')) {
    fs.readdirSync(__dirname).filter((file) => file.endsWith('.test.cjs') && (entries.includes('fresh.cjs') || !['integrity.test.cjs', 'readme.test.cjs'].includes(file))).forEach((file) => add(path.join(__dirname, file)));
  }
  if (entries.includes('coverage.cjs')) {
    const coverage = require('./coverage.cjs');
    const names = args.includes('--focused') ? [...new Set(Object.values(coverage.FOCUSED).flat())] : coverage.SUITES.map((value) => path.basename(value, '.test.cjs'));
    tests(names);
  }
  if (entries.includes('loop.cjs')) {
    const option = args.find((value) => value.startsWith('--files='));
    tests(option ? option.slice(8).split(',') : ['process-sweep', 'process-matrix', 'process-matrix-10', 'process-flood', 'pending-flood', 'cleanup']);
  }
  if (entries.includes('browser-cleanup.cjs')) add(path.join(__dirname, 'browser.cjs'));
  if (entries.includes('final-original-replay.cjs')) {
    for (const file of ['initial-a-r2.snapshot.cjs', 'initial-b.snapshot.cjs']) add(path.join(ROOT, 'evidence', 'red', file));
    for (const file of ['f1.snapshot.cjs', 'f2.snapshot.cjs', 'f3-survivors.snapshot.cjs']) add(path.join(ROOT, 'evidence', 'red', 'fix3', file));
    fs.readdirSync(__dirname).filter((file) => file.endsWith('.test.cjs') && !/^(?:integrity|cleanup|pending-flood|process-.*)\.test\.cjs$/.test(file)).forEach((file) => add(path.join(__dirname, file)));
  }
  if (entries.includes('f3-survivors.snapshot.cjs')) fs.readdirSync(__dirname).filter((file) => file.endsWith('.test.cjs')
    && !/^(?:integrity|cleanup|pending-flood|process-.*)\.test\.cjs$/.test(file)).forEach((file) => add(path.join(__dirname, file)));
  const pending = [...found];
  for (let at = 0; at < pending.length; at += 1) {
    const file = pending[at];
    if (file === __filename) continue;
    if (!/\.(?:cjs|js)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const next = [];
    for (const match of source.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)) {
      let required = path.resolve(path.dirname(file), match[1]);
      if (!fs.existsSync(required)) required += '.js';
      next.push(required);
    }
    if ([...found].some((file) => ['final-base.cjs', 'final-phase.cjs', 'integrity.test.cjs', 'readme.test.cjs'].includes(path.basename(file)))) {
      const data = (directory) => {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) { if (entry.name !== 'scratch' && entry.name !== name) data(file); }
          else add(file);
        }
      };
      data(path.join(ROOT, 'evidence'));
      if (process.env.C014_PRIVATE_EVIDENCE) {
        data(path.join(process.env.C014_PRIVATE_EVIDENCE, 'final-captures'));
        for (const file of ['systematic-06-final.json', 'curated-final.json']) add(path.join(process.env.C014_PRIVATE_EVIDENCE, file));
      }
    }
    if (path.basename(file) === 'server.cjs') for (const name of ['index.html', 'page.js', 'style.css']) next.push(path.join(path.dirname(file), name));
    if (path.basename(file) === 'harness.cjs') next.push(path.join(ROOT, 'server.cjs'));
    if (source.includes("'README.md'")) next.push(path.join(ROOT, 'README.md'));
    if (source.includes("'imports.json'")) next.push(path.join(ROOT, 'imports.json'));
    if (path.basename(file) === 'child.cjs') for (const name of ['child-server.cjs', 'flood-attacker.cjs', 'pending-attacker.cjs']) next.push(path.join(__dirname, name));
    for (const name of ['final-census.cjs', 'mutate-preload.cjs']) if (source.includes(`'${name}'`)) next.push(path.join(__dirname, name));
    if (path.basename(file) === 'final-tooling.test.cjs') for (const name of ['integrity.test.cjs', 'readme.test.cjs']) next.push(path.join(__dirname, name));
    if (path.basename(file) === 'final-equivalences.cjs') next.push(path.join(ROOT, 'evidence', 'mutants', 'equivalents-final.json'));
    if (['final-mutations.cjs', 'final-curated.cjs'].includes(path.basename(file))) {
      for (const suite of [...new Set(Object.values(require('./mutants.cjs').SUITES).flat())]) next.push(path.join(__dirname, `${suite}.test.cjs`));
    }
    if (['browser.cjs', 'final-browser-session.cjs'].includes(path.basename(file))) {
      next.push(path.join(ROOT, 'imports.final.json'));
      for (const name of Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.final.json'))).imports)) next.push(path.join(REPOSITORY, name));
    }
    for (const candidate of next) {
      if (!found.has(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { found.add(candidate); pending.push(candidate); }
    }
  }
  return [...found].map((file) => path.relative(REPOSITORY, file)).sort();
}
const files = process.env.C014_CAPTURE_INPUTS
  ? JSON.parse(fs.readFileSync(process.env.C014_CAPTURE_INPUTS, 'utf8'))
  : executedInputs(rest.slice(1));
if (process.env.C014_CAPTURE_INPUTS) files.push(path.relative(REPOSITORY, process.env.C014_CAPTURE_INPUTS));
const privateRoot = path.resolve(REPOSITORY, 'private-evidence', 'captures', name, 'inputs');
for (const relative of files) {
  const target = path.join(privateRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fs.readFileSync(path.join(REPOSITORY, relative)), { flag: 'wx' });
}
const spec = { name, purpose: `C014 private continuation: ${name}; unchanged shared recorder with explicit private root adapter`,
  args: ['capability\\C014\\tests\\sanitized-run.cjs', '--', ...rest.slice(1)], inputs: files,
  outDir: path.relative(REPOSITORY, directory), expectedExitCode: Number(expected), timeoutMs: 10800000 };
if (process.env.C014_MUTANT) spec.env = { C014_MUTANT: process.env.C014_MUTANT };
spec.env = { ...(spec.env || {}), C014_ACTIVE_CAPTURE: name };
const specPath = path.join(directory, 'invocation.json');
fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'recorder-authority.json'), `${JSON.stringify({
  schema: 'C014-private-recorder-adapter/1',
  sharedSourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  adapterSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  mapping: 'The shared recorder repository root maps to this private candidate; child cwd maps identically. Recorder source and its captured bytes are not rewritten.',
  streamRoles: 'Shared-recorder streams are exact sanitized-run wrapper streams, and therefore path projections of the inner command. Exact original inner streams are separately retained under the private underlying directory.',
  phase: finalMode ? 'final' : 'retained development phase',
  phaseAnchor
}, null, 2)}\n`, { flag: 'wx' });
const originalArgv = process.argv;
process.argv = [process.execPath, '<SHARED-RECORDER>', specPath];
const sharedRequire = createRequire(shared);
const mappedRequire = (id) => {
  if (id === 'node:path') return { ...path, join: (first, ...parts) => path.join(first === originalRoot ? REPOSITORY : first, ...parts) };
  if (id === 'node:child_process') return { ...childProcess, spawnSync: (exe, args, options) => {
    if (options.cwd !== originalRoot) throw new Error('unexpected recorder child cwd');
    return childProcess.spawnSync(exe, args, { ...options, cwd: REPOSITORY });
  } };
  return sharedRequire(id);
};
try {
  vm.runInThisContext(`(function(require) {\n${source}\n})`, { filename: '<UNCHANGED-SHARED-RECORDER>' })(mappedRequire);
} finally { process.argv = originalArgv; }
if (finalMode) {
  const phase = require('./final-phase.cjs');
  const problems = [...phase.verifySource(), ...phase.verifyCurrentSeal()];
  if (problems.length) throw new Error(`Final capture source changed during execution: ${problems.join(', ')}`);
}
