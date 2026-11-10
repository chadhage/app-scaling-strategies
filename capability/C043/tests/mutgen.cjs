'use strict';

// Test tooling, not production code: a SYSTEMATIC mutation generator and campaign (L-0172, self-review line 4). It lexes ONE
// production file (comments, strings, templates and regular expressions are never mutated), generates a mutant for EVERY
// `if` condition (false, true), EVERY `&&` `||` `===` `!==` `<` `<=` `>` `>=` (swapped), EVERY unary `!` (removed), EVERY
// expression statement (deleted) and EVERY `return` (its value dropped), drops the mutants that do not compile, and runs each
// one against the suites in stages (the fast suites first, the slow process suites only for survivors). A mutant is killed
// by a completed named assertion, or a declared equivalence must pass paired original/mutated observable witnesses.
// A reasoning string alone cannot decide a survivor. A position-based mutant (tests\mutate-at.cjs) is applied or it throws MUTANT_BASE_DIFFERS (the file is not
// the text the mutant was generated from): that is a campaign error, never a kill. A suite that never loads the file cannot
// kill a mutant of it, so it passes and the mutant moves on to the next suite.
// Usage: node tests\mutgen.cjs [--file=server.cjs] [--lines=90-130,196-262] [--parallel=2] [--list]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const execution = require('./u060-mutation-runner.cjs');
const runner = execution.createRunner();

const root = path.resolve(__dirname, '..');
const OPERATORS = ['===', '!==', '&&', '||', '<=', '>=', '=>', '==', '!=', '++', '--', '+=', '-=', '...', '?.', '??', '<', '>', '=', '+', '-', '*', '/', '%', '!', '?', ':', '.', ',', ';', '(', ')', '{', '}', '[', ']', '&', '|', '^', '~'];
const SWAPS = { '&&': '||', '||': '&&', '===': '!==', '!==': '===', '<': '<=', '<=': '<', '>': '>=', '>=': '>' };
const NOT_STATEMENTS = new Set(['const', 'let', 'var', 'throw', 'if', 'else', 'for', 'while', 'do', 'try', 'catch', 'finally', 'switch', 'case', 'break', 'continue', 'function', 'class', 'async', 'import', 'export']);

function lex(source) {
  const tokens = [];
  const n = source.length;
  let i = 0;
  const push = (type, start, end) => { tokens.push({ type, text: source.slice(start, end), start, end }); i = end; };
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/' && d === '/') { while (i < n && source[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') { i = source.indexOf('*/', i + 2) + 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      push('str', i, j + 1);
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '$' && source[j + 1] === '{') { depth += 1; j += 2; continue; }
        if (source[j] === '}' && depth > 0) { depth -= 1; j += 1; continue; }
        if (source[j] === '`' && depth === 0) break;
        j += 1;
      }
      push('str', i, j + 1);
      continue;
    }
    const last = tokens.at(-1);
    if (c === '/' && (last === undefined || ((last.type === 'op' || last.text === 'return' || last.text === 'typeof') && ![')', ']', '}'].includes(last.text)))) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) break;
        j += 1;
      }
      j += 1;
      while (/[a-z]/.test(source[j] ?? '')) j += 1;
      push('regex', i, j);
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (/[\w$]/.test(source[j] ?? '')) j += 1; push('word', i, j); continue; }
    if (/[0-9]/.test(c)) { let j = i + 1; while (/[\w.]/.test(source[j] ?? '')) j += 1; push('num', i, j); continue; }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (!op) throw new Error(`unlexable character at ${i}: ${c}`);
    push('op', i, i + op.length);
  }
  return tokens;
}

const isOp = (token, text) => token !== undefined && token.type === 'op' && token.text === text;

function generate(source) {
  const tokens = lex(source);
  const mutants = [];
  const lineOf = (offset) => source.slice(0, offset).split('\n').length;
  const add = (op, start, end, to) => {
    if (source.slice(start, end) === to) return;
    mutants.push({ id: `${start}:${op}`, op, line: lineOf(start), start, end, from: source.slice(start, end), to });
  };
  tokens.forEach((token, index) => {
    if (token.type === 'word' && token.text === 'if' && isOp(tokens[index + 1], '(')) {
      let depth = 0;
      let close = index + 1;
      for (; close < tokens.length; close += 1) {
        if (isOp(tokens[close], '(')) depth += 1;
        else if (isOp(tokens[close], ')')) { depth -= 1; if (depth === 0) break; }
      }
      const start = tokens[index + 2].start;
      const end = tokens[close - 1].end;
      add('if-false', start, end, 'false');
      add('if-true', start, end, 'true');
    }
    if (token.type === 'op' && Object.hasOwn(SWAPS, token.text)) add(`swap ${token.text}`, token.start, token.end, SWAPS[token.text]);
    if (isOp(token, '!')) add('not removed', token.start, token.end, '');
  });
  for (let index = 0; index < tokens.length; index += 1) {
    const prior = tokens[index - 1];
    if (index > 0 && !(isOp(prior, ';') || isOp(prior, '{') || isOp(prior, '}'))) continue;
    const first = tokens[index];
    if (first.type === 'str' || (first.type === 'op' && [';', '{', '}'].includes(first.text)) || (first.type === 'word' && NOT_STATEMENTS.has(first.text))) continue;
    let depth = 0;
    let end = -1;
    for (let k = index; k < tokens.length; k += 1) {
      const token = tokens[k];
      if (token.type !== 'op') continue;
      if (['(', '[', '{'].includes(token.text)) depth += 1;
      else if ([')', ']', '}'].includes(token.text)) { depth -= 1; if (depth < 0) break; } else if (token.text === ';' && depth === 0) { end = k; break; }
    }
    if (end < 0) continue;
    if (first.text === 'return') add('return value dropped', first.start, tokens[end].end, 'return undefined;');
    else add('statement deleted', first.start, tokens[end].end, ';');
  }
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  return { sha256, mutants: mutants.filter((mutant) => {
    try { new vm.Script(`${source.slice(0, mutant.start)}${mutant.to}${source.slice(mutant.end)}`); return true; } catch { return false; }
  }), generated: mutants.length };
}

const FINITE = ['u060-generated-root', 'u060-generated-guards', 'u060-generated-behavior'].map((name) => ({ file: `tests/${name}.test.cjs`, env: {} }));
const STAGE_ONE = ['server', 'boundaries', 'guards', 'node-own', 'pipelining', 'two-instances'].map((name) => ({ file: `tests/${name}.test.cjs`, env: {} }));
// The slow suites, cheapest first; the flood runs two kinds with four sockets (the full table is the GREEN run's job).
const STAGE_TWO = [
  { file: 'tests/pipelining-process.test.cjs', env: {} }, { file: 'tests/units.test.cjs', env: {} }, { file: 'tests/page.test.cjs', env: {} },
  { file: 'tests/connect-upgrade.test.cjs', env: {} },
  { file: 'tests/resources.test.cjs', env: { C043_KINDS: 'get-body,invalid-preset-400', C043_FLOOD: '4', C043_LIVENESS_MS: '20000' } },
  { file: 'tests/pipelining-framing.test.cjs', env: {} },
];

function runSuite(suite, spec) {
  return runner.runNode(['--test', '--test-concurrency=1', suite.file], {
    C043_EQ_ID: '', ...suite.env, C043_MUTANT_AT: JSON.stringify(spec),
    NODE_OPTIONS: `--require=${path.join(__dirname, 'u060-assertive-tests.preload.cjs')} --require=${path.join(__dirname, 'u060-loop-bound.preload.cjs')} --require=${path.join(__dirname, 'mutate-at.cjs')}`,
  }, 900000);
}

function judgeEquivalence(control, mutated, id) {
  for (const [label, outcome] of [['control', control], ['mutated', mutated]]) {
    const judged = execution.judge(outcome, '', true);
    if (!judged.decided || judged.facts.tests !== 1 || judged.facts.pass !== 1 || judged.facts.skipped !== 0) {
      return { decided: false, reason: `UNDECIDED EQUIVALENCE_${label.toUpperCase()} ${judged.reason}` };
    }
  }
  if (!/(?:^|\n)(?:# )?U060_MUTANT_APPLIED server\.cjs(?:\r?\n|$)/.test(mutated.output)) {
    return { decided: false, reason: 'UNDECIDED EQUIVALENCE_MUTATION_NOT_APPLIED' };
  }
  const trace = (output) => {
    const prefix = `U060_EQ_TRACE_BASE64 ${id} `;
    const lines = output.split(/\r?\n/).filter((line) => line.replace(/^# /, '').startsWith(prefix));
    if (lines.length !== 1) return null;
    const encoded = lines[0].replace(/^# /, '').slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded) return null;
    const value = JSON.parse(decoded.toString('utf8'));
    if (typeof value.family !== 'string' || value.observed === null || typeof value.observed !== 'object'
      || (Array.isArray(value.observed) && value.observed.length === 0) || typeof value.state?.stepJournal !== 'string') return null;
    return JSON.stringify(value);
  };
  const before = trace(control.output);
  const after = trace(mutated.output);
  if (before === null || after === null) return { decided: false, reason: 'UNDECIDED EQUIVALENCE_TRACE_MISSING_OR_MALFORMED' };
  if (before !== after) return { decided: false, reason: 'UNDECIDED EQUIVALENCE_TRACE_DIFFERS' };
  return { decided: true, reason: 'PAIRED_OBSERVABLE_EQUIVALENCE', traceSha256: crypto.createHash('sha256').update(before).digest('hex') };
}

function recordAttempt(id, suite, outcome) {
  console.log(JSON.stringify({ event: 'generated-attempt', id, suite, ...outcome }));
}

async function attack(mutant, sha256, file, proof) {
  const spec = { file, start: mutant.start, end: mutant.end, to: mutant.to, sha256 };
  const execute = async (suite) => {
    const outcome = await runSuite(suite, spec);
    recordAttempt(mutant.id, suite.file, outcome);
    if (outcome.code === 0 && execution.judge(outcome, '', true).decided) return null;
    const verdict = execution.judge(outcome, '');
    if (!verdict.decided) return { killedBy: null, problem: verdict.reason, failing: verdict.facts?.failing ?? [], timedOut: outcome.timedOut };
    return { killedBy: suite.file.replace('tests/', ''), failing: verdict.facts.failing, timedOut: false, evidence: 'NAMED_ASSERTION' };
  };
  for (const suite of FINITE) {
    const decided = await execute(suite);
    if (decided) return decided;
  }
  if (proof) {
    const witness = 'tests/u060-generated-equivalence.test.cjs';
    const control = await runner.runNode(['--test', '--test-concurrency=1', witness], { C043_EQ_ID: mutant.id });
    recordAttempt(mutant.id, `${witness}:original`, control);
    const mutated = await runSuite({ file: witness, env: { C043_EQ_ID: mutant.id } }, spec);
    recordAttempt(mutant.id, `${witness}:mutated`, mutated);
    const equivalence = judgeEquivalence(control, mutated, mutant.id);
    return { killedBy: null, equivalence, proof: proof.reason, ...(equivalence.decided ? {} : { problem: equivalence.reason }) };
  }
  for (const suite of [...STAGE_ONE, ...STAGE_TWO]) {
    const decided = await execute(suite);
    if (decided) return decided;
  }
  return { killedBy: null, problem: 'UNDECIDED SURVIVOR_WITHOUT_DEMONSTRATED_EQUIVALENCE' };
}

async function main() {
  const options = Object.fromEntries(process.argv.slice(2).map((argument) => { const [name, value = 'true'] = argument.replace(/^--/, '').split('='); return [name, value]; }));
  const file = options.file ?? 'server.cjs';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { sha256, mutants: all, generated } = generate(source);
  const from = Number(options['from-line'] ?? 0);
  const to = Number(options['to-line'] ?? Infinity);
  const ranges = options.lines ? options.lines.split(',').map((range) => range.split('-').map(Number)) : [[from, to]];
  const mutants = all.filter((mutant) => ranges.some(([start, end]) => mutant.line >= start && mutant.line <= end));
  const proofs = new Map();
  if (file === 'server.cjs') {
    const equivalent = require('./u060-generated-equivalence.json');
    if (equivalent.schema !== 'C043-U060-generated-equivalence/1' || equivalent.file !== file || equivalent.sourceSha256 !== sha256) throw new Error('EQUIVALENCE_BASE_DIFFERS');
    for (const proof of equivalent.proofs) {
      const mutant = all.find((entry) => entry.id === proof.id);
      if (!mutant || mutant.from !== proof.from || mutant.to !== proof.to || proofs.has(proof.id)) throw new Error(`EQUIVALENCE_POSITION_DIFFERS ${proof.id}`);
      proofs.set(proof.id, proof);
    }
  }
  console.log(JSON.stringify({ event: 'plan', file, sha256, generated, compiling: all.length, selected: mutants.length, lines: options.lines ?? 'all' }));
  if (options.list) { for (const mutant of mutants) console.log(JSON.stringify({ id: mutant.id, line: mutant.line, op: mutant.op, from: mutant.from.slice(0, 80), to: mutant.to })); return; }
  const results = [];
  let next = 0;
  const parallel = Number(options.parallel ?? 2);
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > 2) throw new Error('U060 mutation holder allows at most two subprocess workers.');
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < mutants.length) {
      const mutant = mutants[next];
      next += 1;
      const outcome = await attack(mutant, sha256, file, proofs.get(mutant.id));
      const entry = { id: mutant.id, line: mutant.line, op: mutant.op, from: mutant.from.slice(0, 100), to: mutant.to, ...outcome };
      results.push(entry);
      console.log(JSON.stringify(entry));
    }
  }));
  const survivors = results.filter((entry) => entry.killedBy === null);
  const unexplained = survivors.filter((entry) => entry.problem || !entry.equivalence?.decided);
  console.log(JSON.stringify({
    event: 'summary', file, generated, compiling: all.length, selected: mutants.length, killed: results.length - survivors.length, survivors: survivors.length,
    equivalentListed: survivors.length - unexplained.length, unexplained: unexplained.map((entry) => `${entry.id} line ${entry.line} ${entry.op}: ${entry.from}`),
  }));
  if (unexplained.length > 0) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 2; });
module.exports = Object.freeze({ lex, generate, judgeEquivalence });
