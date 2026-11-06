'use strict';

// Test tooling, not production code (U039): the SYSTEMATIC mutation generator. It takes every line of server.cjs that U039 added or
// changed (a line whose trimmed text is not in the retained accepted bytes) and generates EVERY mutant of these operators, one
// per occurrence: the condition of every `if` negated, every `&&` and `||` swapped, every comparison swapped, every whole-line
// statement deleted, every `return undefined;` dropped, every `cond ? a : b` condition negated and every HTTP status number
// raised by one. Each mutant is the SUBJECT (U039_SUBJECT=file:...) of a fast set of named tests (the ordering tests, nine
// matrix rows, the flood). A mutant is KILLED by any failing test; a survivor must be listed in EQUIVALENT below with a one-line
// proof (an argument about reachability is not a proof), otherwise the run fails. A control run on the unmutated file must pass.
// Usage (repository root): node capability\C042\tests\u039-mutate-gen.cjs [--jobs 3] [--dir <scratch directory>] [--list]
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const lib = require('./u039-lib.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const flag = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1]; };
const jobs = Number(flag('--jobs', 3));
const dir = path.resolve(flag('--dir', path.join(__dirname, 'scratch', 'u039-mutants-gen')));
const original = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(eol);
const accepted = new Set(fs.readFileSync(path.join(root, 'evidence', 'u039-pipelining', 'server.v1.cjs.txt'), 'utf8').split(/\r?\n/).map((line) => line.trim()));

// Survivors that no test can tell apart, each with its proof. Keyed by `<line text trimmed> => <mutated text trimmed>`.
const PROOF = "no status from 300 to 399 is ever sent (test 'every status the server can answer is 2xx or 4xx/5xx' enumerates them), so these thresholds select the same answers";
const EQUIVALENT = new Map([
  ['const close = status >= 300 || !consumed; => const close = status > 300 || !consumed;', PROOF],
  ['const close = status >= 300 || !consumed; => const close = status >= 301 || !consumed;', PROOF],
]);

function matching(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
}

function* operators(line) {
  const indent = /^\s*/.exec(line)[0];
  for (const match of line.matchAll(/\b(?:if|else if) \(/g)) {
    const open = match.index + match[0].length - 1;
    const close = matching(line, open);
    if (close > 0) yield ['negate-if', `${line.slice(0, open + 1)}!(${line.slice(open + 1, close)})${line.slice(close)}`];
  }
  for (const match of line.matchAll(/\((\w+) \? /g)) yield ['negate-ternary', `${line.slice(0, match.index)}(!${match[1]} ? ${line.slice(match.index + match[0].length)}`];
  for (const match of line.matchAll(/&&|\|\|/g)) yield ['swap-logic', `${line.slice(0, match.index)}${match[0] === '&&' ? '||' : '&&'}${line.slice(match.index + 2)}`];
  for (const match of line.matchAll(/===|!==|>=|<=|(?<![=!<>-])>(?![=>])|(?<![=!<>])<(?![=<])/g)) {
    const swap = { '===': '!==', '!==': '===', '>=': '>', '<=': '<', '>': '>=', '<': '<=' }[match[0]];
    yield ['swap-comparison', `${line.slice(0, match.index)}${swap}${line.slice(match.index + match[0].length)}`];
  }
  if (/^\s+[A-Za-z_.$][^;{}]*;\s*$/.test(line) && !/^\s*(?:const|let|return|throw|break|continue)\b/.test(line)) yield ['delete-statement', `${indent}void 0;`];
  if (/^\s*return undefined;\s*$/.test(line)) yield ['drop-return', `${indent}void 0;`];
  for (const match of line.matchAll(/\b([345]\d\d)\b/g)) yield ['raise-status', `${line.slice(0, match.index)}${Number(match[1]) + 1}${line.slice(match.index + 3)}`];
}

function generate() {
  const out = [];
  lines.forEach((line, index) => {
    const text = line.trim();
    if (text === '' || accepted.has(text) || text.startsWith('//') || /^[}\])]+[;,)]*$/.test(text)) return;
    for (const [operator, mutated] of operators(line)) if (mutated !== line) out.push({ id: `G${String(out.length + 1).padStart(3, '0')}-${operator}`, line: index + 1, before: text, after: mutated.trim(), source: [...lines.slice(0, index), mutated, ...lines.slice(index + 1)].join(eol) });
  });
  return out;
}

const NAMES = '^(a (legitimate|request|queued|parse|long|failing|refusal flood|connection)|at most|Expect|after |the server|an h2c|two services|every status|in-process h11 (R404|R415|R400json|R409conflict|N417expect|N421nohost|N405connect|N400garbage|N431header):|separate-process h11 R404:)';
function run(subject) {
  return new Promise((resolve) => {
    const env = lib.childEnv({ U039_SUBJECT: subject, U039_CLOSE_MS: '2000' });
    const files = ['u039-ordering', 'u039-nodeown', 'u039-matrix', 'u039-flood'].map((name) => path.join('capability', 'C042', 'tests', `${name}.test.cjs`));
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=120000', `--test-name-pattern=${NAMES}`, ...files], { cwd: repository, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 900000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ exit: code, failed: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()), tests: Number(/^# tests (\d+)$/m.exec(text)?.[1] ?? 0) });
    });
  });
}

async function main() {
  const mutants = generate();
  if (process.argv.includes('--list')) { for (const mutant of mutants) console.log(`${mutant.id} line ${mutant.line}: ${mutant.before}  =>  ${mutant.after}`); return; }
  fs.mkdirSync(dir, { recursive: true });
  const report = [];
  try {
    const control = await run('real');
    report.push({ id: 'control', exit: control.exit, tests: control.tests, failed: control.failed });
    let next = 0;
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (next < mutants.length) {
        const mutant = mutants[next];
        next += 1;
        const file = path.join(dir, `${mutant.id}.cjs`);
        fs.writeFileSync(file, mutant.source);
        const got = await run(`file:${file}`);
        fs.rmSync(file, { force: true });
        const key = `${mutant.before} => ${mutant.after}`;
        const survived = got.exit === 0;
        report.push({ id: mutant.id, line: mutant.line, change: key.slice(0, 200), killed: !survived, failed: got.failed.slice(0, 3), verdict: survived ? (EQUIVALENT.has(key) ? `equivalent: ${EQUIVALENT.get(key)}` : 'SURVIVOR') : 'killed' });
      }
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  report.sort((a, b) => a.id.localeCompare(b.id));
  for (const item of report) console.log(JSON.stringify(item));
  const survivors = report.filter((item) => item.verdict === 'SURVIVOR');
  const bad = survivors.length + (report[0].id === 'control' && (report[0].exit !== 0 || report[0].tests === 0) ? 1 : 0);
  console.log(JSON.stringify({ summary: true, generated: mutants.length, killed: report.filter((item) => item.verdict === 'killed').length, equivalent: report.filter((item) => item.verdict?.startsWith('equivalent')).length, survivors: survivors.length }));
  process.exitCode = bad === 0 ? 0 : 1;
}

main();
