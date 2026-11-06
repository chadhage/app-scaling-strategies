'use strict';

// Test tooling, not production code: a SYSTEMATIC mutation generator and campaign runner (L-0172: every condition and every statement, not a chosen list).
// generate(source) scans the CODE regions of a file (strings, templates, regex literals and comments are skipped) and emits one mutant per
//   - `if (...)` condition forced to true and to false, and EVERY OPERAND of a compound condition (the parts of a top-level `&&` or `||`) forced to true and to false,
//   - `===` and `!==` swapped, `&&` and `||` swapped, `<` `<=` `>` `>=` shifted, a unary `!` removed, `true` and `false` swapped, an integer literal incremented,
//   - whole single-line statement removed (an expression statement or an assignment that is a complete line).
// run() starts each mutant in a fresh `node --test` over the focused suites with tests\mutate-preload.cjs; a mutant is KILLED when a named test fails (the run is ended
// at the first failing test: that failure is the proof), UNDECIDED when it only produced test time-outs or had to be ended by the hard limit (never a kill), SURVIVED
// otherwise; a run that exits non-zero without any failing test (the mutant cannot be loaded) is a CRASH kill, counted apart from the named kills. Workers are
// started by this script, ended by PID, and run at NORMAL priority (BelowNormal starves on a busy machine and its time-outs look like kills).
// Usage (repository root): node capability\C014\tests\mutants.cjs --files=redact.cjs,canon.cjs --workers=2 --out=<report.json> [--limit=N] [--list] [--control]
//   --only=<file>:<index>,<index> re-runs exactly those generated mutants (the survivors of an earlier report, after a new test was added); --seconds=<n> is the hard limit per mutant.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const SUITES = {
  'canon.cjs': ['canon', 'redact'], 'redact.cjs': ['redact', 'canon', 'evidence', 'service'], 'vault.cjs': ['vault', 'service'], 'evidence.cjs': ['evidence', 'service', 'server'],
  'service.cjs': ['service', 'server'], 'server.cjs': ['server', 'health', 'refusal'], 'page.js': ['page']
};
// the second pass over the survivors of the focused pass (--all-suites): every in-process suite of the namespace, the sweep and the property test included
const ALL_SUITES = ['canon', 'scanner', 'redact', 'vault', 'evidence', 'service', 'server', 'health', 'refusal', 'sweep', 'property', 'page'];
const suitesFor = (file) => (process.argv.includes('--all-suites') ? ALL_SUITES : SUITES[file]);
const KEYWORDS = /^\s*(?:const|let|var|return|throw|if|else|for|while|switch|case|default|function|class|module|break|continue|import|export|try|catch|finally|async|await|\}|\)|\]|\/\/)/;

// A boolean mask: true where the character is code (not a string, template, regex literal or comment).
function codeMask(source) {
  const mask = new Uint8Array(source.length).fill(1);
  let at = 0;
  let last = '';
  const blank = (from, to) => { for (let index = from; index < to; index += 1) mask[index] = 0; };
  while (at < source.length) {
    const char = source[at];
    const next = source[at + 1];
    if (char === '/' && next === '/') { const end = source.indexOf('\n', at); blank(at, end < 0 ? source.length : end); at = end < 0 ? source.length : end; continue; }
    if (char === '/' && next === '*') { const end = source.indexOf('*/', at + 2); blank(at, end + 2); at = end + 2; continue; }
    if (char === '\'' || char === '"') {
      let end = at + 1;
      while (source[end] !== char) end += source[end] === '\\' ? 2 : 1;
      blank(at, end + 1); at = end + 1; last = 'x'; continue;
    }
    if (char === '`') {
      let end = at + 1;
      let depth = 0;
      while (!(source[end] === '`' && depth === 0)) {
        if (source[end] === '\\') end += 2;
        else if (source[end] === '$' && source[end + 1] === '{') { depth += 1; end += 2; } else if (source[end] === '}' && depth > 0) { depth -= 1; end += 1; } else end += 1;
      }
      blank(at, end + 1); at = end + 1; last = 'x'; continue;
    }
    if (char === '/' && /[(,=:[!&|?{};]|^$|return/.test(last)) {
      let end = at + 1;
      let inClass = false;
      while (source[end] !== '/' || inClass) { if (source[end] === '\\') end += 1; else if (source[end] === '[') inClass = true; else if (source[end] === ']') inClass = false; end += 1; }
      end += 1;
      while (/[a-z]/.test(source[end] || '')) end += 1;
      blank(at, end); at = end; last = 'x'; continue;
    }
    if (!/\s/.test(char)) last = /[A-Za-z0-9_$)\]]/.test(char) ? 'x' : char;
    at += 1;
  }
  return mask;
}

function matching(source, mask, open) {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (!mask[at]) continue;
    if (source[at] === '(') depth += 1;
    if (source[at] === ')') { depth -= 1; if (depth === 0) return at; }
  }
  return -1;
}

function generate(source) {
  const mask = codeMask(source);
  const mutants = [];
  const add = (start, end, replacement, kind) => { if (source.slice(start, end) !== replacement) mutants.push({ start, end, original: source.slice(start, end), replacement, kind }); };
  const code = (start, end) => { for (let at = start; at < end; at += 1) if (!mask[at]) return false; return true; };
  for (const match of source.matchAll(/\bif \(/g)) {
    const open = match.index + 3;
    const close = matching(source, mask, open);
    if (close > 0 && code(match.index, open + 1)) {
      add(open + 1, close, 'true', 'if-true'); add(open + 1, close, 'false', 'if-false');
      // every single condition: the operands of a top-level && or || (brackets and calls are skipped by depth), each forced to true and to false
      const operands = [];
      let depth = 0;
      let from = open + 1;
      for (let at = open + 1; at < close; at += 1) {
        if (!mask[at]) continue;
        if ('([{'.includes(source[at])) depth += 1;
        else if (')]}'.includes(source[at])) depth -= 1;
        else if (depth === 0 && (source.startsWith('&&', at) || source.startsWith('||', at))) { operands.push([from, at]); from = at + 2; at += 1; }
      }
      operands.push([from, close]);
      if (operands.length > 1) {
        for (const [start, end] of operands) {
          const text = source.slice(start, end);
          const first = start + (text.length - text.trimStart().length);
          const last = end - (text.length - text.trimEnd().length);
          if (last > first) { add(first, last, 'true', 'condition-true'); add(first, last, 'false', 'condition-false'); }
        }
      }
    }
  }
  const swaps = [[/===/g, '!=='], [/!==/g, '==='], [/&&/g, '||'], [/\|\|/g, '&&'], [/(?<![<=>!])<(?![<=])/g, '<='], [/(?<![<=>!-])>(?![>=])/g, '>='], [/<=/g, '<'], [/>=/g, '>'],
    [/\btrue\b/g, 'false'], [/\bfalse\b/g, 'true'], [/(?<![=!<>])!(?![=])/g, '']];
  for (const [pattern, replacement] of swaps) for (const match of source.matchAll(pattern)) if (code(match.index, match.index + match[0].length)) add(match.index, match.index + match[0].length, replacement, `swap ${match[0]}`);
  for (const match of source.matchAll(/(?<![\w.$])\d+(?![\w.])/g)) if (code(match.index, match.index + match[0].length)) add(match.index, match.index + match[0].length, String(Number(match[0]) + 1), 'number');
  let offset = 0;
  for (const line of source.split('\n')) {
    const text = line.replace(/\r$/, '');
    const balanced = (text.match(/[({[]/g) || []).length === (text.match(/[)}\]]/g) || []).length;
    if (/;\s*$/.test(text) && balanced && !KEYWORDS.test(text) && !/=>|\bfunction\b|^\s*\w+\s*:/.test(text) && code(offset + text.search(/\S/), offset + text.length)) {
      add(offset + text.search(/\S/), offset + text.length, ';', 'delete-statement');
    }
    offset += line.length + 1;
  }
  const seen = new Set();
  return mutants.filter((mutant) => { const key = `${mutant.start}:${mutant.end}:${mutant.replacement}`; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.start - b.start);
}

const HARD_LIMIT_MS = Number((process.argv.find((item) => item.startsWith('--seconds=')) || '--seconds=300').slice(10)) * 1000;

// Names printed by a failing test may carry an absolute path (a file-level failure is named after the file): the repository is public, so no local path is recorded.
const clean = (name) => name.split(REPOSITORY).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+/g, '<HOME>').trim().slice(0, 90);

// `mutant` null runs the focused suites unmutated (the control: it must pass, or no kill below means anything).
function runMutant(file, mutant, suites) {
  return new Promise((resolve) => {
    const env = { ...process.env, NODE_V8_COVERAGE: '' };
    if (mutant) env.C014_MUTANT = JSON.stringify({ file, ...mutant }); else delete env.C014_MUTANT;
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    // one process for all the focused suites (no isolation): a mutant costs one start-up, not one per test file
    const args = ['--require', path.join(ROOT, 'tests', 'mutate-preload.cjs'), '--test', '--experimental-test-isolation=none', '--test-timeout=90000', ...suites.map((name) => path.join(ROOT, 'tests', `${name}.test.cjs`))];
    const child = spawn(process.execPath, args, { cwd: path.join(ROOT, 'tests', 'scratch'), env, windowsHide: true });
    if (process.argv.includes('--low')) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort */ } }
    const out = [];
    const failures = [];
    let scanned = 0;
    let endedByUs = false;
    let timedOut = false;
    const scan = () => {
      const text = Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n');
      const pattern = /^not ok \d+ - (.+)\n((?:  .*\n)*?)  \.\.\.\n/gm;
      pattern.lastIndex = scanned;
      for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        scanned = pattern.lastIndex;
        const timeout = /failureType: 'testTimeoutFailure'|test timed out after/.test(match[2]);
        failures.push({ name: clean(match[1]), timeout });
        // the first test that fails by an assertion is the proof of the kill: the rest of the run proves nothing more
        if (!timeout && !endedByUs && mutant) { endedByUs = true; child.kill(); }
      }
    };
    child.stdout.on('data', (chunk) => { out.push(chunk); scan(); });
    child.stderr.on('data', (chunk) => out.push(chunk));
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, HARD_LIMIT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      scan();
      const text = Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n');
      const named = failures.filter((failure) => !failure.timeout).map((failure) => failure.name);
      const crash = !endedByUs && !timedOut && code !== 0 && code !== null && failures.length === 0;
      const onlyTimeouts = failures.length > 0 && named.length === 0;
      // a run that this script had to end without a failing assertion is UNDECIDED: it proves nothing and is never counted as a kill
      resolve({ killed: named.length > 0 || crash, crash, timedOut: timedOut || onlyTimeouts, exit: endedByUs ? 'ended after the first failing test' : code, failing: [...new Set(named)].slice(0, 3), ranTests: Number((/^# tests (\d+)$/m.exec(text) || [])[1] || 0), passed: Number((/^# pass (\d+)$/m.exec(text) || [])[1] || 0) });
    });
  });
}

async function namedCampaign(workers, out) {
  const { NAMED: ALL } = require('./named-mutants.cjs');
  const ids = (process.argv.find((item) => item.startsWith('--ids=')) || '').slice(6).split(',').filter(Boolean);
  const NAMED = ids.length ? ALL.filter((entry) => ids.some((id) => entry.id.startsWith(`${id} `))) : ALL;
  fs.mkdirSync(path.join(ROOT, 'tests', 'scratch'), { recursive: true });
  const results = new Array(NAMED.length);
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < NAMED.length) {
      const index = next; next += 1;
      const { id, file, find, replace } = NAMED[index];
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const start = source.indexOf(find);
      if (start < 0 || source.indexOf(find, start + 1) >= 0) { results[index] = { id, file, error: 'find is not unique in the pristine source' }; continue; }
      const result = await runMutant(file, { start, end: start + find.length, original: find, replacement: replace }, SUITES[file]);
      results[index] = { id, file, ...result };
      console.log(`${result.killed ? 'KILLED  ' : result.timedOut ? 'TIMEOUT ' : 'SURVIVED'} ${id} ${JSON.stringify(result.failing)}`);
    }
  }));
  const report = { schema: 'C014-named-mutants/1', generatorFiles: ['tests/mutants.cjs', 'tests/named-mutants.cjs', 'tests/mutate-preload.cjs'], total: results.length, killed: results.filter((item) => item.killed).length,
    timedOut: results.filter((item) => item.timedOut).length, survived: results.filter((item) => !item.killed && !item.timedOut).map((item) => item.id), results };
  console.log(`named mutants: ${report.killed} of ${report.total} killed, ${report.timedOut} timed out, ${report.survived.length} survived`);
  if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`, { flag: 'wx' });
}

async function main() {
  const argument = (name, fallback) => (process.argv.find((item) => item.startsWith(`--${name}=`)) || `--${name}=${fallback}`).slice(name.length + 3);
  if (process.argv.includes('--named')) { await namedCampaign(Number(argument('workers', 2)), argument('out', '')); return; }
  const files = argument('files', Object.keys(SUITES).join(',')).split(',');
  const workers = Number(argument('workers', 2));
  const limit = Number(argument('limit', 0));
  const out = argument('out', '');
  const only = argument('only', '');
  const onlyMap = only ? Object.fromEntries(only.split(';').map((part) => { const [name, list] = part.split(':'); return [name, new Set(list.split(',').map(Number))]; })) : null;
  const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
  fs.mkdirSync(path.join(ROOT, 'tests', 'scratch'), { recursive: true });
  const report = { schema: 'C014-mutants/2', startedAtUtc: new Date().toISOString(), generatorFiles: ['tests/mutants.cjs', 'tests/mutate-preload.cjs'], workers, hardLimitSeconds: HARD_LIMIT_MS / 1000, only: only || null, files: {} };
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const all = generate(source);
    if (process.argv.includes('--list')) { console.log(file, all.length); continue; }
    // an index is the position in the full generated list (stable for one source), so a re-run names exactly the same mutants
    let chosen = all.map((mutant, index) => ({ mutant, index })).filter(({ index }) => !onlyMap || (onlyMap[file] && onlyMap[file].has(index)));
    if (limit) chosen = chosen.filter((_, position) => position % Math.ceil(chosen.length / limit) === 0);
    const entry = { suites: suitesFor(file), sourceLfSha256: sha(source.replace(/\r\n/g, '\n')), generated: all.length, ran: chosen.length };
    if (process.argv.includes('--control')) {
      entry.control = await runMutant(file, null, suitesFor(file));
      console.log(`${file} control (no mutation): exit ${entry.control.exit}, ${entry.control.passed} of ${entry.control.ranTests} tests passed`);
    }
    const results = new Array(chosen.length);
    let next = 0;
    await Promise.all(Array.from({ length: workers }, async () => {
      while (next < chosen.length) {
        const position = next; next += 1;
        const { mutant, index } = chosen[position];
        const result = await runMutant(file, mutant, suitesFor(file));
        results[position] = { index, kind: mutant.kind, line: source.slice(0, mutant.start).split('\n').length, original: mutant.original.slice(0, 60), replacement: mutant.replacement.slice(0, 40), ...result };
        console.log(`${file} #${index} ${mutant.kind} line ${results[position].line}: ${result.killed ? (result.crash ? 'CRASH ' : 'KILLED') : result.timedOut ? 'UNDECIDED' : 'SURVIVED'} ${JSON.stringify(result.failing)}`);
        // a checkpoint every ten results, so that a campaign that dies late still leaves what it decided (the final report is written only at the end, with flag wx)
        if (out && (position + 1) % 10 === 0) fs.writeFileSync(path.join(ROOT, 'tests', 'scratch', `${path.basename(out)}.partial`), `${JSON.stringify({ ...report, files: { ...report.files, [file]: { ...entry, results: results.filter(Boolean) } } })}\n`);
      }
    }));
    Object.assign(entry, {
      killed: results.filter((item) => item.killed).length, crashKills: results.filter((item) => item.crash).length, undecided: results.filter((item) => item.timedOut && !item.killed).length,
      survivors: results.filter((item) => !item.killed && !item.timedOut).map((item) => item.index), results
    });
    report.files[file] = entry;
    console.log(`${file}: ${entry.killed} of ${entry.ran} killed (${entry.crashKills} by a load-time crash), ${entry.undecided} undecided, ${entry.survivors.length} survived`);
  }
  report.completedAtUtc = new Date().toISOString();
  if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`, { flag: 'wx' });
}

if (require.main === module) main();
module.exports = Object.freeze({ generate, codeMask, SUITES });
