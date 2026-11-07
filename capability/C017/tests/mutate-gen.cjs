'use strict';

// Test tooling, not production code: the SYSTEMATIC mutation generator for server.cjs (L-0172, checklist line 4): no mutant is chosen by hand.
// Every `if` condition is replaced by `false` and by `true`, so is every operand of a top-level || or && inside it, and every single-line effect
// statement (a call or an assignment, not a declaration, a return or a throw) is deleted. The mutated copy is served to the tests through the overlay
// preload (the live file is never touched). A mutant is KILLED when a test file fails BY NAME (the first such file is named), otherwise it SURVIVED and is
// listed with its line. The fast in-process test files run one after the other and a mutant stops at the first file that kills it; a file that is cut
// decides nothing and the next file is tried (decide(): UNDECIDED only when no file killed the mutant and at least one was cut).
//   node capability\C017\tests\mutate-gen.cjs list
//   node capability\C017\tests\mutate-gen.cjs run [--jobs 3] [--only <regex on the id>] [--out mutants-gen-05]   (--out writes evidence\<name>.json once, with the SHA-256 of every input)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { inputPins } = require('./evidence-check.cjs');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const FILE = 'server.cjs';
const TESTS = ['server-guards.test.cjs', 'refusal-shapes.test.cjs', 'drain.test.cjs', 'pending-flood.test.cjs', 'limits.test.cjs', 'tracked.test.cjs', 'two-servers.test.cjs', 'server.test.cjs', 'chunked.test.cjs', 'resources.test.cjs'].map((name) => `capability\\C017\\tests\\${name}`);
const rel = (file) => path.relative(repo, file).replaceAll('\\', '/');
const QUOTES = ["'", '"', '`'];

// Index of the bracket that closes the one at `open`, skipping quoted text.
function closeOf(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
    } else if (QUOTES.includes(c)) quote = c;
    else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// The operands of the top-level || and && between start and end.
function operands(text, start, end) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let from = start;
  for (let i = start; i < end; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
    } else if (QUOTES.includes(c)) quote = c;
    else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (depth === 0 && (text.startsWith('||', i) || text.startsWith('&&', i))) {
      parts.push({ from, to: i });
      from = i + 2;
      i += 1;
    }
  }
  parts.push({ from, to: end });
  return parts;
}

function generate(source) {
  const lineOf = (index) => source.slice(0, index).split('\n').length;
  const out = [];
  const add = (kind, from, to, replace) => out.push({ kind, line: lineOf(from), from, to, replace });
  for (const match of source.matchAll(/\bif \(/g)) {
    const open = match.index + 3;
    const close = closeOf(source, open);
    add('cond-false', open + 1, close, 'false');
    add('cond-true', open + 1, close, 'true');
    const parts = operands(source, open + 1, close);
    if (parts.length > 1) for (const [index, part] of parts.entries()) for (const value of ['true', 'false']) add(`operand${index + 1}-${value}`, part.from, part.to, ` ${value} `);
  }
  let offset = 0;
  for (const line of source.split('\n')) {
    const code = line.trim();
    const effect = /^[A-Za-z_$][\w$.]*(\(.*\)|\s*=\s*.+);$/.test(code) && !/^(const|let|var|return|throw|function|async|import)\b/.test(code);
    const balanced = [...code].reduce((net, c) => net + ('([{'.includes(c) ? 1 : (')]}'.includes(c) ? -1 : 0)), 0) === 0;
    if (effect && balanced) add('delete-statement', offset, offset + line.length, '');
    offset += line.length + 1;
  }
  return out.map((site, index) => ({ ...site, id: `G${String(index + 1).padStart(3, '0')}-${site.kind}-L${site.line}`, was: source.slice(site.from, site.to).trim().slice(0, 100) }));
}

const base = () => fs.readFileSync(path.join(root, FILE), 'utf8').replace(/\r\n/g, '\n');

// The arguments of one test run. --test-force-exit ends a file whose tests all finished while a listener that the mutant never closed keeps the process
// alive, so that such a file reports its verdict instead of hanging until a timeout (G083 of the third-fix run, F28 of the fourth review).
const testArgs = (files) => ['--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=900000', '--test-force-exit', ...files];

function runTests(env, files) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, testArgs(files), { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (part) => { out += part; });
    child.stderr.on('data', () => {});
    const limit = setTimeout(() => child.kill(), 2400000);
    child.once('exit', (code) => {
      clearTimeout(limit);
      resolve({ code, failing: [...out.replace(/\r\n/g, '\n').matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim().slice(0, 140)) });
    });
  });
}

// The verdict of one mutant over the test files, which run one after the other through runFile(file) -> { code, failing }. A file that fails BY NAME kills
// it and the rest is not run. A file that is cut (a hard kill, or only the file itself reported as failing: nothing it contains failed by name) decides
// nothing: the next file is tried (F28 of the fourth review: the generator used to stop at the first cut file, so G083 stayed UNDECIDED although
// two-servers.test.cjs kills it by name). UNDECIDED only when no file killed it and at least one was cut (controller rule 13: never counted as killed);
// SURVIVED when every file passed.
async function decide(files, runFile) {
  const cut = [];
  for (const file of files) {
    const result = await runFile(file);
    if (result.code === 0) continue;
    const named = result.failing.filter((name) => !/\.test\.cjs$/.test(name));
    if (result.code === null || named.length === 0) {
      cut.push({ file: path.basename(file), failing: result.failing.slice(0, 3), exit: result.code });
      continue;
    }
    return { killed: true, killedBy: path.basename(file), failingTests: named.slice(0, 3), exit: result.code, ...(cut.length ? { cutBefore: cut.map((entry) => entry.file) } : {}) };
  }
  if (cut.length) return { killed: null, undecided: true, killedBy: `${cut.map((entry) => entry.file).join(', ')} (cut, no named failing test, and no other file killed it)`, failingTests: cut[0].failing, exit: cut[0].exit, cut: cut.map((entry) => entry.file) };
  return { killed: false, killedBy: null, failingTests: [], exit: 0 };
}

async function runMutant(source, site) {
  const mutatedSource = source.slice(0, site.from) + site.replace + source.slice(site.to);
  const about = { id: site.id, line: site.line, kind: site.kind, was: site.was };
  try {
    new vm.Script(`(function (exports, require, module, __filename, __dirname) {${mutatedSource}\n})`);
  } catch {
    return { ...about, killed: null, killedBy: null, failingTests: [], exit: null, invalid: true };
  }
  const dir = path.join(root, 'test-scratch', `mutgen-${site.id}`);
  fs.mkdirSync(dir, { recursive: true });
  const mutated = path.join(dir, FILE);
  fs.writeFileSync(mutated, mutatedSource);
  const env = { ...process.env, C017_OVERLAY: JSON.stringify({ [`capability/C017/${FILE}`]: rel(mutated) }), NODE_OPTIONS: '--require=./capability/C017/tests/fixtures/overlay-preload.cjs', NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  try {
    return { ...about, ...(await decide(TESTS, (file) => runTests(env, [file]))) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const option = (name, fallback) => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : fallback; };
  const source = base();
  const all = generate(source);
  const only = option('--only');
  const chosen = only ? all.filter((site) => new RegExp(only).test(site.id)) : all;
  if (mode === 'list') { console.log(chosen.map((site) => `${site.id}  ${site.was}`).join('\n')); console.log(`${chosen.length} of ${all.length} mutants`); return; }
  if (mode !== 'run') { console.error('usage: mutate-gen.cjs list | run [--jobs N] [--only regex] [--out name]'); process.exit(2); }
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Number(option('--jobs', '3')) }, async () => {
    while (next < chosen.length) {
      const site = chosen[next]; next += 1;
      const result = await runMutant(source, site);
      results.push(result);
      console.error(`${result.invalid ? 'invalid ' : (result.killed ? 'killed  ' : (result.undecided ? 'UNDECIDED' : 'SURVIVED'))} ${result.id}  ${result.killedBy || ''}`);
    }
  }));
  results.sort((a, b) => a.id.localeCompare(b.id));
  const valid = results.filter((r) => !r.invalid);
  const summary = {
    schema: 'C017-mutants-gen/2', node: process.version, file: FILE, baseSha256: createHash('sha256').update(fs.readFileSync(path.join(root, FILE))).digest('hex'), tests: TESTS.map((name) => path.basename(name)),
    inputs: inputPins(),
    generated: all.length, ran: valid.length, invalid: results.filter((r) => r.invalid).map((r) => r.id), killed: valid.filter((r) => r.killed === true).length,
    undecided: valid.filter((r) => r.killed === null).map((r) => r.id), survived: valid.filter((r) => r.killed === false).map((r) => ({ id: r.id, line: r.line, kind: r.kind, was: r.was })), results,
  };
  if (option('--out')) fs.writeFileSync(path.join(root, 'evidence', `${option('--out')}.json`), `${JSON.stringify(summary, null, 1)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ generated: summary.generated, ran: summary.ran, invalid: summary.invalid, killed: summary.killed, undecided: summary.undecided, survived: summary.survived.map((s) => `${s.id} ${s.was}`) }, null, 1));
  process.exit(summary.survived.length || summary.undecided.length ? 1 : 0);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(2); });
module.exports = Object.freeze({ generate, closeOf, operands, TESTS, decide, testArgs });
