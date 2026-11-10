'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { generate, SUITES } = require('./mutants.cjs');
const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const PRIVATE = process.env.C014_PRIVATE_EVIDENCE;
if (!PRIVATE || !path.isAbsolute(PRIVATE)) throw new Error('an explicit owned C014_PRIVATE_EVIDENCE directory is required');
const argument = (name, fallback) => (process.argv.find((value) => value.startsWith(`--${name}=`)) || `--${name}=${fallback}`).slice(name.length + 3);
const files = argument('files', Object.keys(SUITES).join(',')).split(',');
const only = argument('only', '');
const selected = only ? Object.fromEntries(only.split(';').map((part) => { const [file, indexes] = part.split(':'); return [file, new Set(indexes.split(',').map(Number))]; })) : null;
const destination = path.resolve(argument('out', path.join(ROOT, 'evidence', 'mutants', 'systematic-05-final.json')));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHash = (source) => hash(Buffer.from(source.replace(/\r\n/g, '\n')));
const clean = (text) => text.split(REPOSITORY.replace(/\\/g, '\\\\')).join('<REPO>').split(REPOSITORY).join('<REPO>').split(REPOSITORY.replace(/\\/g, '/')).join('<REPO>');
fs.mkdirSync(path.join(PRIVATE, 'mutations'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'tests', 'scratch'), { recursive: true });

function runRaw(file, mutant, suites, key) {
  return new Promise((resolve) => {
    const env = { ...process.env, NODE_V8_COVERAGE: '' };
    delete env.NODE_TEST_CONTEXT;
    if (mutant) env.C014_MUTANT = JSON.stringify({ file, ...mutant });
    else delete env.C014_MUTANT;
    const args = ['--require', path.join(ROOT, 'tests', 'mutate-preload.cjs'), '--test', '--experimental-test-isolation=none', '--test-timeout=90000',
      ...suites.map((name) => path.join(ROOT, 'tests', `${name}.test.cjs`))];
    const child = spawn(process.execPath, args, { cwd: path.join(ROOT, 'tests', 'scratch'), env, windowsHide: true });
    const stdout = [];
    const stderr = [];
    let ended = false;
    let timeout = false;
    let decided = [];
    const inspect = () => {
      const text = Buffer.concat(stdout).toString('utf8').replace(/\r\n/g, '\n');
      decided = [...text.matchAll(/^not ok \d+ - (.+)\n((?:  .*\n)*?)  \.\.\.\n/gm)]
        .filter((match) => !/testTimeoutFailure|test timed out|SyntaxError|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|mutant does not match/.test(match[2])
          && !/^(?:[A-Za-z]:|file:|<REPO>)/.test(match[1]) && !/\.test\.cjs$/.test(match[1]))
        .map((match) => clean(match[1]));
      if (mutant && decided.length && !ended) { ended = true; child.kill(); }
    };
    child.stdout.on('data', (bytes) => { stdout.push(Buffer.from(bytes)); inspect(); });
    child.stderr.on('data', (bytes) => stderr.push(Buffer.from(bytes)));
    const timer = setTimeout(() => { timeout = true; child.kill(); }, 180000);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      inspect();
      const streams = {};
      for (const [stream, chunks] of [['stdout', stdout], ['stderr', stderr]]) {
        const bytes = Buffer.concat(chunks);
        const gzip = zlib.gzipSync(bytes);
        const relative = path.join('mutations', `${key}.${stream}.raw.gz`);
        fs.writeFileSync(path.join(PRIVATE, relative), gzip, { flag: 'wx' });
        streams[stream] = { privatePath: relative.replace(/\\/g, '/'), bytes: bytes.length, sha256: hash(bytes), gzipSha256: hash(gzip) };
      }
      const text = Buffer.concat(stdout).toString('utf8').replace(/\r\n/g, '\n');
      const fault = /SyntaxError|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|mutant does not match/.test(text + Buffer.concat(stderr).toString());
      const count = (name) => Number((new RegExp(`^# ${name} (\\d+)$`, 'm').exec(text) || [])[1] || 0);
      resolve({ killed: mutant !== null && decided.length > 0 && !timeout && !fault, crash: false, timedOut: timeout,
        invalid: fault, exit: ended ? 'ended after named behavioral failure' : code, signal, failing: [...new Set(decided)],
        ranTests: count('tests'), passed: count('pass'), streams });
    });
  });
}

async function run(file, mutant, suites, key) {
  if (file === 'canon.cjs' && mutant && suites.length > 1) {
    const barrier = await runRaw(file, mutant, ['final-work'], `${key}-work`);
    if (barrier.killed || barrier.timedOut || barrier.invalid) return { ...barrier, workBarrierOnly: true };
    return { ...await runRaw(file, mutant, suites, key), workBarrier: barrier };
  }
  return runRaw(file, mutant, suites, key);
}

async function main() {
  const dependencies = new Set([__filename, path.join(__dirname, 'mutants.cjs'), path.join(__dirname, 'mutate-preload.cjs'),
    ...files.map((file) => path.join(ROOT, file)), ...['README.md', 'index.html', 'style.css'].map((file) => path.join(ROOT, file)),
    ...files.flatMap((file) => SUITES[file].map((suite) => path.join(__dirname, `${suite}.test.cjs`)))]);
  const pending = [...dependencies];
  for (let at = 0; at < pending.length; at += 1) {
    const source = fs.readFileSync(pending[at], 'utf8');
    for (const found of source.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)) {
      let dependency = path.resolve(path.dirname(pending[at]), found[1]);
      if (!fs.existsSync(dependency)) dependency += '.js';
      if (fs.existsSync(dependency) && fs.statSync(dependency).isFile() && !dependencies.has(dependency)) { dependencies.add(dependency); pending.push(dependency); }
    }
  }
  const snapshot = `mutation-inputs-${process.pid}-${Date.now()}`;
  const inputPins = [...dependencies].sort().map((file) => {
    const bytes = fs.readFileSync(file);
    const relative = path.relative(REPOSITORY, file);
    const target = path.join(PRIVATE, snapshot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: 'wx' });
    return { path: relative.replace(/\\/g, '/'), rawSha256: hash(bytes), canonicalLfSha256: sourceHash(bytes.toString('utf8')) };
  });
  const report = { schema: 'C014-mutants/2', authority: 'Current executions; original exact raw streams retained privately, no syntax/module/environment fault or timeout is a kill',
    generatorFiles: ['tests/mutants.cjs', 'tests/final-mutations.cjs', 'tests/mutate-preload.cjs'], workers: 1, inputSnapshot: snapshot, inputs: inputPins, files: {} };
  for (const file of files) {
    if (!Object.hasOwn(SUITES, file)) throw new Error('unknown production file');
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const generated = generate(source, file);
    const indexes = generated.map((_, index) => index).filter((index) => !selected || selected[file]?.has(index));
    const suites = SUITES[file];
    const epoch = hash(Buffer.from(`${sourceHash(source)}:${fs.readFileSync(__filename)}:${Date.now()}`)).slice(0, 14);
    const entry = { sourceLfSha256: sourceHash(source), generated: generated.length, ran: indexes.length, suites,
      control: await run(file, null, suites, `${epoch}-${file}-control`), results: [] };
    if (entry.control.exit !== 0 || entry.control.ranTests === 0 || entry.control.passed !== entry.control.ranTests) throw new Error(`${file}: unmutated control is not GREEN`);
    for (const index of indexes) {
      const mutant = generated[index];
      let syntax = null;
      try { new vm.Script(file.endsWith('.cjs') ? Module.wrap(source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end))
        : source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end)); } catch (error) { syntax = error.name; }
      const result = syntax
        ? { killed: false, crash: false, timedOut: false, invalid: true, syntax, failing: [], exit: 'not executed: syntax-invalid generated tuple' }
        : await run(file, mutant, suites, `${epoch}-${file}-${index}`);
      entry.results.push({ index, kind: mutant.kind, line: source.slice(0, mutant.start).split('\n').length,
        original: mutant.original.slice(0, 60), replacement: mutant.replacement.slice(0, 40), tuple: mutant, ...result });
      if (index % 10 === 0 || !result.killed) console.log(`${file} #${index}: ${result.killed ? 'NAMED' : result.invalid ? 'INVALID-NOT-KILL' : result.timedOut ? 'UNDECIDED' : 'SURVIVED'} ${JSON.stringify(result.failing)}`);
      fs.writeFileSync(path.join(PRIVATE, `${path.basename(destination)}.checkpoint.json`), `${JSON.stringify({ ...report, files: { ...report.files, [file]: entry } })}\n`);
    }
    for (const pin of inputPins) if (hash(fs.readFileSync(path.join(REPOSITORY, pin.path))) !== pin.rawSha256) throw new Error(`mutation input changed during campaign: ${pin.path}`);
    if (sourceHash(fs.readFileSync(path.join(ROOT, file), 'utf8')) !== entry.sourceLfSha256) throw new Error(`${file}: source changed during execution`);
    entry.killed = entry.results.filter((item) => item.killed).length;
    entry.crashKills = 0;
    entry.undecided = entry.results.filter((item) => item.timedOut).length;
    entry.invalid = entry.results.filter((item) => item.invalid).length;
    entry.survivors = entry.results.filter((item) => !item.killed && !item.invalid && !item.timedOut).map((item) => item.index);
    report.files[file] = entry;
    console.log(`${file}: ${entry.killed} named, ${entry.invalid} invalid-not-kills, ${entry.undecided} undecided, survivors ${entry.survivors.join(',')}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 1)}\n`, { flag: 'wx' });
  if (Object.values(report.files).some((entry) => entry.undecided > 0)) process.exitCode = 1;
}
if (require.main === module) main().catch((error) => { console.error(clean(error.stack)); process.exitCode = 1; });
module.exports = { run, main };
