'use strict';

// Test tooling, not production code: the SYSTEMATIC mutation run (L-0172, X001 F3). A generator over every production file, not a chosen list:
// every `if`/`while` condition and every single operand of its `&&` / `||` chain (forced true and false), every comparison and logical operator,
// every `!`, every call or assignment statement (deleted), every `return <call>` (return dropped), every UPPER_SNAKE code and every compared string
// literal (replaced), every numeric literal (plus and minus one). Mutants that do not parse are discarded. Each mutant is applied alone in a private
// copy OUTSIDE the repository and must be killed by a NAMED failing test (a crash of a whole file is not a kill); a survivor fails the run unless
// its label is on the equivalent list of tests\mutants-equivalent.cjs with a one-line proof.
// Usage: node tests\mutate-gen.cjs --scratch <dir outside the repository> --out <report.json> [--only <file>] [--workers N] [--list] [--limit N]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const scratch = argument('--scratch');
const out = argument('--out');
const only = argument('--only');
const listOnly = process.argv.includes('--list');
const finalizeOnly = process.argv.includes('--finalize');
const workers = Number(argument('--workers') ?? 3);
const limit = Number(argument('--limit') ?? Infinity);
if (!listOnly && (!out || (!finalizeOnly && (!scratch || path.resolve(scratch).toLowerCase().startsWith(repository.toLowerCase()))))) throw new Error('--scratch must be outside the repository and --out a report file');

const PRODUCTION = ['store.cjs', 'server.cjs', 'contract.js', 'audit.cjs', 'codes.cjs', 'page.js'];
const STAGES = {
  unit: ['contract', 'store', 'audit'], core: ['idor', 'anonymous', 'server-units', 'hostile-fields', 'commit'], rest: ['uniform', 'lists', 'hostile-paths', 'batch', 'operator', 'quota'],
  late: ['property', 'pipeline-inproc-a', 'pipeline-inproc-b', 'pipeline-inproc-c'], page: ['page']
};
const PLAN = { 'audit.cjs': ['unit', 'core', 'rest'], 'codes.cjs': ['unit', 'core', 'rest'], 'contract.js': ['unit', 'core', 'rest', 'late'], 'page.js': ['page'], 'server.cjs': ['core', 'rest', 'late'], 'store.cjs': ['unit', 'core', 'rest', 'late'] };
const CONCURRENCY = Number(process.env.C010_MUTATION_CONCURRENCY || 2);
const MATRIX_QUICK = '^(TARGET_NOT_FOUND|ROLE_FORBIDDEN|QUERY_REJECTED|EXPECTATION_FAILED|REQUEST_MALFORMED|URL_TOO_LONG|METHOD_NOT_ALLOWED|BODY_TOO_LARGE|INVALID_URL|UNEXPECTED_BODY|TOKEN_EXPIRED|INTERNAL_ERROR) \\[(R M7|G G R M7|M6 G R|R \\| M7)\\] (HTTP/1\\.1|refusal then HTTP/1\\.0)$';

// Same-length mask of comments, strings, templates and regex literals, so that operators and keywords are found in code only.
function mask(text) {
  const chars = [...text];
  const blank = (from, to) => { for (let at = from; at < to; at += 1) if (chars[at] !== '\n') chars[at] = ' '; };
  let previous = '';
  for (let at = 0; at < chars.length;) {
    const c = chars[at];
    const next = chars[at + 1];
    if (c === '/' && next === '/') { const end = text.indexOf('\n', at); const to = end < 0 ? text.length : end; blank(at, to); at = to; continue; }
    if (c === '/' && next === '*') { const to = text.indexOf('*/', at + 2) + 2; blank(at, to); at = to; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      let to = at + 1;
      while (to < text.length && text[to] !== c) to += text[to] === '\\' ? 2 : 1;
      blank(at + 1, to);
      at = to + 1; previous = c; continue;
    }
    if (c === '/' && (previous === '' || '(,=:[!&|?{};'.includes(previous) || /(?:return|typeof)$/.test(text.slice(Math.max(0, at - 7), at).trim()))) {
      let to = at + 1;
      let inClass = false;
      while (to < text.length && (inClass || text[to] !== '/') && text[to] !== '\n') { if (text[to] === '\\') to += 1; else if (text[to] === '[') inClass = true; else if (text[to] === ']') inClass = false; to += 1; }
      if (text[to] === '/') { blank(at + 1, to); at = to + 1; previous = '/'; continue; }
    }
    if (!/\s/.test(c)) previous = c;
    at += 1;
  }
  return chars.join('');
}

function balanced(masked, open) {
  let depth = 0;
  for (let at = open; at < masked.length; at += 1) {
    if (masked[at] === '(') depth += 1;
    if (masked[at] === ')') { depth -= 1; if (depth === 0) return at; }
  }
  return -1;
}

function operands(masked, from, to) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let at = from; at < to; at += 1) {
    const c = masked[at];
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (depth === 0 && ((c === '&' && masked[at + 1] === '&') || (c === '|' && masked[at + 1] === '|'))) { parts.push([start, at]); start = at + 2; at += 1; }
  }
  parts.push([start, to]);
  return parts.length > 1 ? parts : [];
}

function generate(file, text) {
  const masked = mask(text);
  const mutants = [];
  const lineOf = (at) => text.slice(0, at).split('\n').length;
  const add = (label, start, end, replacement) => { if (text.slice(start, end) !== replacement) mutants.push({ file, label: `${label} @${lineOf(start)}`, start, end, replacement }); };
  for (const match of masked.matchAll(/\b(?:if|while)\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = balanced(masked, open);
    if (close < 0) continue;
    add('condition true', open + 1, close, 'true');
    add('condition false', open + 1, close, 'false');
    for (const [from, to] of operands(masked, open + 1, close)) {
      add(`operand "${text.slice(from, to).trim().slice(0, 40)}" true`, from, to, ' true ');
      add(`operand "${text.slice(from, to).trim().slice(0, 40)}" false`, from, to, ' false ');
    }
  }
  const SWAP = { '===': '!==', '!==': '===', '<=': '<', '>=': '>', '<': '<=', '>': '>=', '&&': '||', '||': '&&' };
  for (const match of masked.matchAll(/===|!==|<=|>=|&&|\|\||(?<![=<>!-])<(?![<=])|(?<![=<>-])>(?![>=])/g)) add(`operator ${match[0]}`, match.index, match.index + match[0].length, SWAP[match[0]]);
  for (const match of masked.matchAll(/(?<![!=<>])!(?!=)/g)) add('negation removed', match.index, match.index + 1, '');
  const lines = text.split('\n');
  const maskedLines = masked.split('\n');
  let offset = 0;
  lines.forEach((line, index) => {
    const code = maskedLines[index];
    const trimmed = code.trim();
    const previousCode = maskedLines.slice(0, index).reverse().find((candidate) => candidate.trim() !== '')?.trim() ?? '';
    const atStatement = previousCode === '' || /[;{}]$/.test(previousCode);
    const start = offset + (line.length - line.trimStart().length);
    const end = offset + line.replace(/\r$/, '').length;
    const body = trimmed.endsWith(';') ? trimmed : '';
    if (atStatement && body && !/^(?:const|let|var|function|class|return|throw|break|continue|module|'use strict')\b/.test(body) && /^[\w$.\[\]'"]+(?:\([^;]*\)|\s*(?:\+=|-=|=)\s*[^;=]+);$/.test(body) && !/^[A-Z_]+\s*=/.test(body)) add('statement deleted', start, end, ';');
    const returned = /^return\s+(.+);$/.exec(body);
    if (atStatement && returned && /[\w$\]]\(/.test(returned[1]) && !/^return\s+(?:Object|\[|\{|new )/.test(body)) add('return dropped', start, end, `${returned[1]};`);
    offset += line.length + 1;
  });
  for (const match of text.matchAll(/'([A-Z][A-Z_]{4,})'/g)) add(`code ${match[1]}`, match.index, match.index + match[0].length, '\'ZZ_MUTANT_CODE\'');
  for (const match of masked.matchAll(/(?:===|!==|\.includes\(|hasOwn\([^,]+,)\s*'/g)) {
    const quote = match.index + match[0].length - 1;
    const close = text.indexOf('\'', quote + 1);
    if (close > quote) add(`literal ${text.slice(quote, close + 1)}`, quote, close + 1, '\'__mutant__\'');
  }
  for (const match of masked.matchAll(/(?<![\w$.'"-])(\d+)(?![\w$.'"])/g)) {
    const value = Number(match[1]);
    add(`number ${value} plus one`, match.index, match.index + match[1].length, String(value + 1));
    if (value > 0) add(`number ${value} minus one`, match.index, match.index + match[1].length, String(value - 1));
  }
  const seen = new Set();
  return mutants.filter((mutant) => {
    const key = `${mutant.start}:${mutant.end}:${mutant.replacement}`;
    if (seen.has(key)) return false;
    seen.add(key);
    try { new vm.Script(text.slice(0, mutant.start) + mutant.replacement + text.slice(mutant.end), { filename: file }); return true; } catch { return false; }
  });
}

const sources = new Map(PRODUCTION.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const all = PRODUCTION.filter((file) => !only || file === only).flatMap((file) => generate(file, sources.get(file)));
// Proportional order: at any moment every file has been tried to the same fraction, so a run that has to stop early is an even sample, not "one file fully and the rest not at all".
const perFile = {};
for (const mutant of all) perFile[mutant.file] = (perFile[mutant.file] ?? 0) + 1;
const rank = {};
const mutants = all.map((mutant) => { rank[mutant.file] = (rank[mutant.file] ?? 0) + 1; return { mutant, key: rank[mutant.file] / perFile[mutant.file] + PRODUCTION.indexOf(mutant.file) / 1000 }; })
  .sort((first, second) => first.key - second.key).map((item) => item.mutant).slice(0, limit);
const equivalent = fs.existsSync(path.join(__dirname, 'mutants-equivalent.cjs')) ? require('./mutants-equivalent.cjs') : {};
if (listOnly) {
  const counts = {};
  for (const mutant of all) counts[mutant.file] = (counts[mutant.file] ?? 0) + 1;
  console.log(JSON.stringify({ total: all.length, perFile: counts }));
  process.exit(0);
}

function buildTree(target) {
  fs.rmSync(target, { recursive: true, force: true });
  const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
  for (const name of fs.readdirSync(root)) if (fs.statSync(path.join(root, name)).isFile()) copy(path.join(root, name), path.join(target, 'capability', 'C010', name));
  for (const name of fs.readdirSync(path.join(root, 'tests'))) copy(path.join(root, 'tests', name), path.join(target, 'capability', 'C010', 'tests', name));
  for (const name of ['authz.cjs', 'codes.cjs', 'contract.js', 'http-io.cjs', 'queue.cjs']) copy(path.join(root, '..', 'C009', name), path.join(target, 'capability', 'C009', name));
}

function runTests(tree, names, matrixQuick) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C010_SUBJECT_DIR']) delete env[key];
    env.C010_SETTLE_MS = '400';
    if (matrixQuick) env.C010_MATRIX_ONLY = MATRIX_QUICK;
    const files = names.map((name) => path.join('capability', 'C010', 'tests', `${name}.test.cjs`));
    const child = spawn(process.execPath, ['--test', `--test-concurrency=${CONCURRENCY}`, '--test-timeout=170000', ...files], { cwd: tree, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }), 420000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, text: Buffer.concat(chunks).toString('utf8') }); });
  });
}
const failing = (text) => [...new Set([...text.matchAll(/^\s*not ok \d+ - (?!(?:[A-Za-z]:)?[\\/\w.-]*capability[\\/])(.+)$/gm)].map((match) => match[1].trim()))];

async function worker(name, queue, results) {
  const tree = path.join(scratch, name);
  buildTree(tree);
  while (queue.length) {
    const mutant = queue.shift();
    const target = path.join(tree, 'capability', 'C010', mutant.file);
    const original = sources.get(mutant.file);
    fs.writeFileSync(target, original.slice(0, mutant.start) + mutant.replacement + original.slice(mutant.end));
    let stage = null;
    let named = [];
    for (const step of PLAN[mutant.file]) {
      // The late stage runs the property test and a quick selection of the pipelining cells (C010_MATRIX_ONLY): a mutant that keeps connections open would make every cell wait.
      let run = await runTests(tree, STAGES[step], step === 'late');
      for (let attempt = 0; attempt < 2 && run.code !== 0 && failing(run.text).length === 0; attempt += 1) run = await runTests(tree, STAGES[step], step === 'late');
      named = failing(run.text);
      if (run.code !== 0 && named.length > 0) { stage = step; break; }
    }
    fs.writeFileSync(target, original);
    const killed = stage !== null;
    const reason = equivalent[`${mutant.file}: ${mutant.label}`] ?? null;
    const entry = { file: mutant.file, label: mutant.label, killed, stage, failingTests: named.slice(0, 3), equivalent: reason };
    results.push(entry);
    fs.appendFileSync(`${out}.jsonl`, `${JSON.stringify(entry)}\n`);
    console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} [${stage ?? '-'}] ${mutant.file}: ${mutant.label}${killed ? ` <- ${named.slice(0, 2).map((item) => item.slice(0, 80)).join(' | ')}` : reason ? ` (equivalent: ${reason})` : ''}`);
  }
}

function summarize(rawResults, total, baseline) {
  // A kill in a stage whose UNMUTATED control did not pass proves nothing: it is demoted to a survivor, by name.
  const green = new Set(baseline.filter((step) => step.exitCode === 0).map((step) => step.stage));
  const results = rawResults.map((item) => (item.killed && !green.has(item.stage)
    ? { ...item, killed: false, stage: null, demoted: `killed in stage ${item.stage}, whose unmutated control did not pass: ${item.failingTests.join(' | ').slice(0, 200)}` } : item));
  const sorted = [...results].sort((first, second) => `${first.file}${first.label}`.localeCompare(`${second.file}${second.label}`));
  const survivors = sorted.filter((item) => !item.killed && !item.equivalent);
  return {
    schema: 'C010-mutation-gen/1', baseline, generated: total, executed: sorted.length, notExecuted: total - sorted.length, killed: sorted.filter((item) => item.killed).length,
    survivedEquivalent: sorted.filter((item) => !item.killed && item.equivalent).length, survived: survivors.length,
    perFile: Object.fromEntries(PRODUCTION.map((file) => [file, { generated: all.filter((item) => item.file === file).length, executed: sorted.filter((item) => item.file === file).length, killed: sorted.filter((item) => item.file === file && item.killed).length }])),
    results: sorted
  };
}

const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);

// The control: the UNMUTATED copy must pass every stage the run uses, otherwise a "kill" proves nothing.
async function baseline(stages) {
  const tree = path.join(scratch, 'base');
  buildTree(tree);
  const steps = [];
  for (const step of stages) {
    const run = await runTests(tree, STAGES[step], step === 'late');
    const entry = { stage: step, exitCode: run.code, failing: failing(run.text) };
    steps.push(entry);
    fs.appendFileSync(`${out}.baseline.jsonl`, `${JSON.stringify(entry)}\n`);
    console.log(`BASELINE ${step} exit ${run.code}${run.code === 0 ? '' : ` ${entry.failing.join(' | ').slice(0, 300)}`}`);
  }
  return steps;
}

async function main() {
  if (finalizeOnly) {
    // Builds the report from the incremental files of a run that was stopped on purpose (the generated count is the full set, so notExecuted is exact).
    const steps = readLines(`${out}.baseline.jsonl`);
    const report = summarize(readLines(`${out}.jsonl`), all.length, steps);
    fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`, { flag: 'w' });
    console.log(`MUTATION (stopped run) ${report.killed} killed, ${report.survivedEquivalent} equivalent, ${report.survived} survived, ${report.notExecuted} not executed of ${report.generated}`);
    return;
  }
  if (process.env.C010_MUTATION_PRIORITY !== 'normal') { try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* the caller may have set it already */ } }
  const finished = readLines(`${out}.jsonl`);
  const done = new Set(finished.map((item) => `${item.file}: ${item.label}`));
  const queue = mutants.filter((mutant) => !done.has(`${mutant.file}: ${mutant.label}`));
  const results = [...finished];
  const [steps] = await Promise.all([baseline([...new Set(mutants.flatMap((mutant) => PLAN[mutant.file]))]), ...Array.from({ length: workers }, (_, index) => worker(`gen-${index}`, queue, results))]);
  const report = summarize(results, all.length, steps);
  fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`, { flag: 'w' });
  console.log(`MUTATION ${report.killed} killed, ${report.survivedEquivalent} equivalent, ${report.survived} survived, ${report.notExecuted} not executed of ${report.generated}; baseline ${steps.every((step) => step.exitCode === 0) ? 'green' : 'RED'}`);
  process.exitCode = report.survived === 0 && report.notExecuted === 0 && steps.every((step) => step.exitCode === 0) ? 0 : 1;
}

main();
