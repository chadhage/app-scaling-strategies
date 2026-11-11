'use strict';

// Test tooling, not production code: the SYSTEMATIC mutation run (L-0172, X001 F3, L-0223, L-0224, L-0225). A generator over every production file, not a
// chosen list: every `if`/`while` condition and every single operand of its `&&` / `||` chain (forced true and false), every comparison and logical
// operator, every `!`, every call or assignment statement (deleted), every `return <call>` (return dropped), every UPPER_SNAKE code and every compared string
// literal (replaced), every numeric literal (plus and minus one), EVERY REGEX LITERAL (each quantifier, anchor, repetition and class range), EVERY CALL
// ARGUMENT that is a plain name or member (replaced by undefined; the first two swapped) and EVERY ITERATION SOURCE (`for ... of X`, and the receiver of
// some/every/filter/find/findIndex/map/flatMap/forEach/reduce/includes replaced by an empty list). Mutants that do not parse are discarded. Each mutant is
// applied alone in a private copy OUTSIDE the repository and is KILLED only by a NAMED failing test: a test that failed by an assertion or by an error
// thrown inside it. A per-test timeout, a crash, the failure of a whole file or a run without a named failing test is UNDECIDED and fails the run (never a
// kill, never a survivor to excuse). A survivor fails the run unless its label is on the equivalent list of tests\mutants-equivalent.cjs with its proof kind.
// Usage: node tests\mutate-gen.cjs --scratch <dir outside the repository> --out <report.json> [--only <file>] [--workers N] [--list] [--limit N]
//        node tests\mutate-gen.cjs --scratch <dir> --out <report.json> --retest --extra-tests a,b   (re-runs the survivors against test files ADDED since)
//        node tests\mutate-gen.cjs --out <report.json> --finalize                                    (builds the report from the incremental files)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { classify } = require('./mutation-classify.cjs');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const LOOP_BOUND = 30000000;

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const scratch = argument('--scratch');
const out = argument('--out');
const only = argument('--only');
const listOnly = process.argv.includes('--list');
const finalizeOnly = process.argv.includes('--finalize');
const retestOnly = process.argv.includes('--retest');
const extraTests = (argument('--extra-tests') ?? '').split(',').filter(Boolean);
const workers = Number(argument('--workers') ?? 1);
const progressFile = argument('--progress') ?? `${out}.jsonl`;
const limit = Number(argument('--limit') ?? Infinity);
const allowed = path.join(repository, 'private');
const within = (value) => {
  const relative = typeof value === 'string' ? path.relative(allowed, path.resolve(value)) : '..';
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
if (!listOnly && (!within(out) || !within(progressFile) || (!finalizeOnly && !within(scratch)))) throw new Error('mutation outputs and work trees must be below the explicitly owned private directory');
if (!Number.isInteger(workers) || workers !== 1) throw new Error('exactly one owned normal-priority mutation worker is permitted');

const PRODUCTION = ['codes.cjs', 'config.cjs', 'contract.js', 'json.cjs', 'page.js', 'server.cjs', 'store.cjs'];
const STAGES = {
  unitConfig: ['guard-bounds-final', 'config-final', 'config'], unitContract: ['contract'], unitJson: ['json'], unitStore: ['store', 'store-more', 'guards-final'], core: ['cancellation-final', 'cancellation-order-final', 'guards-final', 'reserve', 'roles', 'hostile', 'leaks', 'idempotency', 'lifecycle', 'batch', 'audit', 'public', 'commit'],
  rest: ['race', 'two-instances', 'property'], late: ['pipeline-inproc-a', 'pipeline-inproc-b', 'pipeline-inproc-c'], page: ['page'], limits: ['limits'],
  // Test files ADDED after the first pass of a run to kill its survivors (--retest --extra-tests a,b): old test files are never edited, so every earlier kill stays valid.
  added: extraTests
};
const PLAN = {
  'codes.cjs': ['core', 'late'], 'config.cjs': ['unitConfig', 'core'], 'contract.js': ['unitContract', 'core', 'rest', 'late'], 'json.cjs': ['unitJson', 'core'], 'page.js': ['page'],
  'server.cjs': ['core', 'rest', 'late', 'limits'], 'store.cjs': ['unitStore', 'core', 'rest']
};
const MATRIX_QUICK = '^(RESERVATION_NOT_FOUND|ROLE_FORBIDDEN|INPUT_INVALID|EXPECTATION_FAILED|REQUEST_MALFORMED|URL_TOO_LONG|METHOD_NOT_ALLOWED|BODY_TOO_LARGE|INVALID_URL|UNEXPECTED_BODY|TOKEN_EXPIRED|INTERNAL_ERROR|IDEMPOTENCY_CONFLICT|CAPACITY_EXCEEDED|LEASE_CAP_EXCEEDED) \\[(R A|G G R D|A R D|R \\| A)\\] (HTTP/1\\.1|refusal then HTTP/1\\.0)$';

// Same-length mask of comments, strings, templates and regex literals, so that operators and keywords are found in code only; the regex literals are listed.
function mask(text) {
  const chars = [...text];
  const regexes = [];
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
      if (text[to] === '/') { regexes.push({ from: at, to }); blank(at + 1, to); at = to + 1; previous = '/'; continue; }
    }
    if (!/\s/.test(c)) previous = c;
    at += 1;
  }
  return { masked: chars.join(''), regexes };
}

function balanced(masked, open, openChar = '(', closeChar = ')') {
  let depth = 0;
  for (let at = open; at < masked.length; at += 1) {
    if (masked[at] === openChar) depth += 1;
    if (masked[at] === closeChar) { depth -= 1; if (depth === 0) return at; }
  }
  return -1;
}

// The parts of a list between its top-level separators (`&&` and `||`, or commas): [from, to) pairs.
function split(masked, from, to, separators) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let at = from; at < to; at += 1) {
    const c = masked[at];
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (depth === 0) {
      const hit = separators.find((separator) => masked.startsWith(separator, at));
      if (hit) { parts.push([start, at]); start = at + hit.length; at += hit.length - 1; }
    }
  }
  parts.push([start, to]);
  return parts;
}

// Where the receiver of `.method(` begins: names, dots, balanced calls and indexes, going left.
function receiverStart(masked, dot) {
  let at = dot - 1;
  while (at >= 0) {
    const c = masked[at];
    if (c === ')' || c === ']') {
      let depth = 0;
      for (; at >= 0; at -= 1) {
        if (masked[at] === c) depth += 1;
        if (masked[at] === (c === ')' ? '(' : '[')) { depth -= 1; if (depth === 0) break; }
      }
      at -= 1;
    } else if (/[\w$.?]/.test(c)) at -= 1;
    else break;
  }
  return at + 1;
}

// Every single edit of a regex source: each repetition count, each anchor, each + and *, each class range.
function regexEdits(source) {
  const edits = [];
  const put = (from, to, replacement, label) => edits.push({ from, to, replacement, label });
  let inClass = false;
  for (let at = 0; at < source.length; at += 1) {
    const c = source[at];
    if (c === '\\') { at += 1; continue; }
    if (inClass) {
      if (c === ']') { inClass = false; continue; }
      const range = /^([0-9A-Za-z])-([0-9A-Za-z])/.exec(source.slice(at));
      if (range && range[2] !== range[1]) { put(at + 2, at + 3, String.fromCharCode(range[2].charCodeAt(0) - 1), `class range ${range[0]} shrunk`); }
      continue;
    }
    if (c === '[') { inClass = true; continue; }
    if (c === '^' && at === 0) put(at, at + 1, '', 'anchor ^ removed');
    if (c === '$' && at === source.length - 1) put(at, at + 1, '', 'anchor $ removed');
    if (c === '+' || c === '*') put(at, at + 1, c === '+' ? '*' : '+', `quantifier ${c} swapped`);
    if (c === '?' && source[at - 1] !== '(' && source[at + 1] !== ':' && source[at - 1] !== '\\') put(at, at + 1, '', 'quantifier ? removed');
    if (c === '{') {
      const brace = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(at));
      if (brace) {
        const low = Number(brace[1]);
        const high = brace[3] === undefined || brace[3] === '' ? null : Number(brace[3]);
        const end = at + brace[0].length;
        const variants = [];
        if (brace[2] === undefined) variants.push(`{${low + 1}}`, `{${low - 1}}`);
        else if (high === null) variants.push(`{${low + 1},}`, `{${low - 1},}`);
        else variants.push(`{${low},${high + 1}}`, `{${low},${high - 1}}`, `{${low + 1},${high}}`, `{${low - 1},${high}}`);
        for (const variant of variants) put(at, end, variant, `repetition ${brace[0]} to ${variant}`);
        at = end - 1;
      }
    }
  }
  return edits;
}

function generate(file, text) {
  const { masked, regexes } = mask(text);
  const mutants = [];
  const lineOf = (at) => { const before = text.slice(0, at); return `${before.split('\n').length}:${at - before.lastIndexOf('\n')}`; };
  const add = (label, start, end, replacement) => { if (text.slice(start, end) !== replacement) mutants.push({ file, label: `${label} @${lineOf(start)}`, start, end, replacement }); };
  for (const match of masked.matchAll(/\b(?:if|while)\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = balanced(masked, open);
    if (close < 0) continue;
    add('condition true', open + 1, close, 'true');
    add('condition false', open + 1, close, 'false');
    const parts = split(masked, open + 1, close, ['&&', '||']);
    if (parts.length > 1) {
      for (const [from, to] of parts) {
        add(`operand "${text.slice(from, to).trim().slice(0, 40)}" true`, from, to, ' true ');
        add(`operand "${text.slice(from, to).trim().slice(0, 40)}" false`, from, to, ' false ');
      }
    }
  }
  const SWAP = { '===': '!==', '!==': '===', '<=': '<', '>=': '>', '<': '<=', '>': '>=', '&&': '||', '||': '&&' };
  for (const match of masked.matchAll(/===|!==|<=|>=|&&|\|\||(?<![=<>!-])<(?![<=])|(?<![=<>-])>(?![>=])/g)) add(`operator ${match[0]}`, match.index, match.index + match[0].length, SWAP[match[0]]);
  for (const match of masked.matchAll(/(?<![!=<>])!(?!=)/g)) add('negation removed', match.index, match.index + 1, '');
  const lines = text.split('\n');
  const maskedLines = masked.split('\n');
  let offset = 0;
  lines.forEach((line, index) => {
    const trimmed = maskedLines[index].trim();
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
  // Regex literals: every single edit of the source, kept only when it is still a valid expression.
  for (const { from, to } of regexes) {
    const source = text.slice(from + 1, to);
    const flags = /^[a-z]*/.exec(text.slice(to + 1))[0];
    for (const edit of regexEdits(source)) {
      const changed = source.slice(0, edit.from) + edit.replacement + source.slice(edit.to);
      try { new RegExp(changed, flags); } catch { continue; }
      add(`regex /${source.slice(0, 30)}/ ${edit.label}`, from + 1 + edit.from, from + 1 + edit.to, edit.replacement);
    }
  }
  // Iteration sources: `for (... of X)` and the receiver of the array methods, replaced by an empty list (the unscoped or the empty sibling).
  for (const match of masked.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+[^;()]*?\bof\s+/g)) {
    const open = match.index + match[0].indexOf('(');
    const close = balanced(masked, open);
    if (close > 0) add(`iteration source "${text.slice(match.index + match[0].length, close).trim().slice(0, 40)}" emptied`, match.index + match[0].length, close, '[]');
  }
  for (const match of masked.matchAll(/\.(some|every|filter|find|findIndex|map|flatMap|forEach|reduce|includes)\(/g)) {
    const begin = receiverStart(masked, match.index);
    if (begin < match.index && !/^\s*$/.test(masked.slice(begin, match.index))) add(`receiver "${text.slice(begin, match.index).trim().slice(0, 40)}" of .${match[1]}( emptied`, begin, match.index, '[]');
  }
  // Call arguments: a plain name or member path is replaced by undefined, and the first two of a call are swapped.
  for (const match of masked.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(/g)) {
    const callee = match[1];
    if (/^(?:if|for|while|switch|catch|function|return|require|typeof|new|async|await|assert|test|describe)$/.test(callee) || /^(?:Object\.freeze|Object\.hasOwn|JSON\.stringify|Number|String|Array\.isArray)$/.test(callee)) continue;
    const open = match.index + match[0].length - 1;
    const close = balanced(masked, open);
    if (close < 0) continue;
    const parts = split(masked, open + 1, close, [',']).filter(([from, to]) => masked.slice(from, to).trim() !== '');
    const simple = parts.map(([from, to]) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(masked.slice(from, to).trim()));
    parts.forEach(([from, to], at) => { if (simple[at]) add(`argument ${at + 1} "${text.slice(from, to).trim()}" of ${callee}( replaced by undefined`, from, to, ' undefined'); });
    if (parts.length >= 2 && simple[0] && simple[1]) {
      const [first, second] = parts;
      add(`arguments 1 and 2 of ${callee}( swapped`, first[0], second[1], `${text.slice(second[0], second[1]).trim()}, ${text.slice(first[0], first[1]).trim()}`);
    }
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
if (!only || only === 'server.cjs') {
  const before = 'if (cancelled()) return undefined;\r\n          registry.verify(token);';
  const source = sources.get('server.cjs');
  const alternate = before.replaceAll('\r\n', '\n');
  const original = source.includes(before) ? before : alternate;
  const start = source.indexOf(original);
  if (start < 0 || source.indexOf(original, start + 1) >= 0) throw new Error('required commit-order counterfactual has no unique subject');
  all.push({ file: 'server.cjs', label: 'required review F3: token revalidation before cancellation', start, end: start + original.length,
    replacement: 'registry.verify(token);\n          if (cancelled()) return undefined;', origin: 'genuine required review counterfactual' });
}
// Proportional order: at any moment every file has been tried to the same fraction, so a run that has to stop early is an even sample.
const perFile = {};
for (const mutant of all) perFile[mutant.file] = (perFile[mutant.file] ?? 0) + 1;
const rank = {};
const mutants = all.map((mutant) => { rank[mutant.file] = (rank[mutant.file] ?? 0) + 1; return { mutant, key: rank[mutant.file] / perFile[mutant.file] + PRODUCTION.indexOf(mutant.file) / 1000 }; })
  .sort((first, second) => first.key - second.key).map((item) => item.mutant).slice(0, limit);
const equivalent = fs.existsSync(path.join(__dirname, 'mutants-equivalent.cjs')) ? require('./mutants-equivalent.cjs') : {};
if (listOnly) {
  const counts = {};
  for (const mutant of all) counts[mutant.file] = (counts[mutant.file] ?? 0) + 1;
  const manifest = argument('--manifest');
  if (manifest) {
    if (!within(manifest)) throw new Error('definition manifest must be in the owned private directory');
    fs.writeFileSync(manifest, JSON.stringify(all.map((mutant) => ({ ...mutant,
      sourceSha256: createHash('sha256').update(sources.get(mutant.file)).digest('hex'),
      mutantSha256: createHash('sha256').update(sources.get(mutant.file).slice(0, mutant.start) + mutant.replacement + sources.get(mutant.file).slice(mutant.end)).digest('hex'),
      executedSha256: createHash('sha256').update(mutant.file === 'page.js'
        ? sources.get(mutant.file).slice(0, mutant.start) + mutant.replacement + sources.get(mutant.file).slice(mutant.end)
        : instrument(sources.get(mutant.file).slice(0, mutant.start) + mutant.replacement + sources.get(mutant.file).slice(mutant.end))).digest('hex')
    })), null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ total: all.length, perFile: counts }));
  process.exit(0);
}

function buildTree(target) {
  fs.mkdirSync(target, { recursive: false });
  const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
  for (const name of fs.readdirSync(root)) if (fs.statSync(path.join(root, name)).isFile()) copy(path.join(root, name), path.join(target, 'capability', 'C011', name));
  for (const name of fs.readdirSync(path.join(root, 'tests'))) if (fs.statSync(path.join(root, 'tests', name)).isFile()) copy(path.join(root, 'tests', name), path.join(target, 'capability', 'C011', 'tests', name));
  for (const name of ['authz.cjs', 'codes.cjs', 'contract.js', 'http-io.cjs', 'queue.cjs']) copy(path.join(root, '..', 'C009', name), path.join(target, 'capability', 'C009', name));
  copy(path.join(root, '..', 'C010', 'audit.cjs'), path.join(target, 'capability', 'C010', 'audit.cjs'));
}

// One test file in its own process. A stage runs its files one after the other and stops at the first file that fails: a killed mutant costs the
// time of the first file that sees it, not of the whole stage, and a survivor still runs every file.
const streamDirectory = path.join(path.dirname(out || allowed), 'mutation-original-streams');
let streamNumber = fs.existsSync(streamDirectory) ? Math.max(0, ...fs.readdirSync(streamDirectory).filter((name) => /^\d{6}\.(?:stdout|stderr)\.raw\.gz$/.test(name)).map((name) => Number(name.slice(0, 6)))) : 0;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function runFile(tree, name, matrixQuick) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C011_SUBJECT_DIR']) delete env[key];
    env.C011_SETTLE_MS = '400';
    if (matrixQuick) env.C011_MATRIX_ONLY = MATRIX_QUICK;
    const file = path.join('capability', 'C011', 'tests', `${name}.test.cjs`);
    delete env.C011_ASSERTION_DIR;
    const args = ['--test', '--test-concurrency=1', '--test-timeout=60000', file];
    const child = spawn(process.execPath, args, { cwd: tree, env, windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 240000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const id = String(++streamNumber).padStart(6, '0');
      const directory = path.join(path.dirname(out), 'mutation-original-streams');
      fs.mkdirSync(directory, { recursive: true });
      const streams = {};
      for (const [stream, chunks] of Object.entries({ stdout, stderr })) {
        const bytes = Buffer.concat(chunks);
        const compressed = gzipSync(bytes);
        const basename = `${id}.${stream}.raw.gz`;
        fs.writeFileSync(path.join(directory, basename), compressed, { flag: 'wx' });
        streams[stream] = { path: path.join('mutation-original-streams', basename), bytes: bytes.length, sha256: digest(bytes), gzipSha256: digest(compressed) };
      }
      const text = Buffer.concat([...stdout, ...stderr]).toString('utf8');
      resolve({ code, signal, timedOut, text, observation: { args, code, signal, timedOut, streams, rejectedFailures: classify(text).rejected } });
    });
  });
}
async function runTests(tree, names, matrixQuick) {
  let last = { code: 0, timedOut: false, text: '' };
  const observations = [];
  for (const name of names) {
    last = await runFile(tree, name, matrixQuick);
    observations.push(last.observation);
    if (last.code !== 0 || last.timedOut) return { ...last, observations };
  }
  return { ...last, observations };
}
// The causal-kill rule: a NAMED test that failed by an assertion or by an error thrown inside it. A per-test timeout, a test cancelled by its parent and the
// failure of a whole file (its name is a path) are not kills.
function named(text) {
  return classify(text).killedBy;
}

// An endless loop is decided by an ITERATION BOUND, not by a wall-clock timeout (L-0208): every loop of the MUTATED file counts its turns and throws a
// named error beyond the bound, which a test then reports as a failure inside it (killed by a named test, the bound named in the report).
function instrument(text) {
  const { masked } = mask(text);
  const edits = [];
  for (const match of masked.matchAll(/\bwhile\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = balanced(masked, open);
    if (close > 0) edits.push([open + 1, close, `(__bound(), (${text.slice(open + 1, close)}))`]);
  }
  for (const match of masked.matchAll(/\bfor\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = balanced(masked, open);
    if (close < 0) continue;
    const separators = [];
    let depth = 0;
    for (let at = open + 1; at < close; at += 1) {
      if ('([{'.includes(masked[at])) depth += 1;
      if (')]}'.includes(masked[at])) depth -= 1;
      if (masked[at] === ';' && depth === 0) separators.push(at);
    }
    if (separators.length === 2) {
      const condition = text.slice(separators[0] + 1, separators[1]).trim() || 'true';
      edits.push([separators[0] + 1, separators[1], `__bound() && (${condition})`]);
    }
  }
  let result = text;
  for (const [from, to, replacement] of edits.sort((first, second) => second[0] - first[0])) result = result.slice(0, from) + replacement + result.slice(to);
  const prelude = `const __bound = (() => { let turns = 0; return () => { turns += 1; if (turns > ${LOOP_BOUND}) throw new Error('MUTANT_LOOP_BOUND'); return true; }; })();\n`;
  return result.replace(/^('use strict';\r?\n)/, `$1${prelude}`);
}

async function worker(name, queue, results) {
  const tree = path.join(scratch, name);
  buildTree(tree);
  while (queue.length) {
    if (process.env.C011_MUTATION_DEADLINE && Date.now() >= Date.parse(process.env.C011_MUTATION_DEADLINE)) break;
    const mutant = queue.shift();
    const target = path.join(tree, 'capability', 'C011', mutant.file);
    const original = sources.get(mutant.file);
    const mutated = original.slice(0, mutant.start) + mutant.replacement + original.slice(mutant.end);
    const executed = mutant.file === 'page.js' ? mutated : instrument(mutated);
    fs.writeFileSync(target, executed);
    let stage = null;
    let killers = [];
    let undecided = null;
    const observations = [];
    for (const step of retestOnly ? ['added'] : PLAN[mutant.file]) {
      // The late stage runs a quick selection of the pipelining cells (C011_MATRIX_ONLY): a mutant that keeps connections open would make every cell wait.
      let run = await runTests(tree, STAGES[step], step === 'late');
      observations.push(...run.observations);
      for (let attempt = 0; attempt < 2 && run.code !== 0 && !run.timedOut && named(run.text).length === 0; attempt += 1) {
        run = await runTests(tree, STAGES[step], step === 'late');
        observations.push(...run.observations);
      }
      killers = named(run.text);
      if (run.code !== 0 && killers.length > 0) { stage = step; break; }
      // A timeout, a crash or a failing file without a named failing test is UNDECIDED, never a kill and never a survivor: the run fails until it is decided.
      if (run.timedOut || run.code !== 0) undecided = `${step}: ${run.timedOut ? 'timeout' : `exit ${run.code} without a named failing test`}`;
    }
    fs.writeFileSync(target, original);
    const killed = stage !== null;
    const reason = equivalent[`${mutant.file}: ${mutant.label}`] ?? null;
    const entry = { file: mutant.file, label: mutant.label, start: mutant.start, end: mutant.end, replacement: mutant.replacement,
      sourceSha256: digest(Buffer.from(original)), mutantSha256: digest(Buffer.from(mutated)),
      executedSha256: digest(Buffer.from(executed)), instrumentation: mutant.file === 'page.js' ? null : { actualIterationBound: LOOP_BOUND },
      killed, stage, failingTests: killers.slice(0, 3), equivalent: reason, undecided: killed ? null : undecided,
      retest: retestOnly, observations };
    results.push(entry);
    fs.appendFileSync(progressFile, `${JSON.stringify(entry)}\n`);
    console.log(`${killed ? 'KILLED  ' : entry.undecided ? 'UNDECIDED' : 'SURVIVED'} [${stage ?? '-'}] ${mutant.file}: ${mutant.label}${killed ? ` <- ${killers.slice(0, 2).map((item) => item.slice(0, 80)).join(' | ')}` : reason ? ` (equivalent: ${reason})` : ''}`);
  }
}

function report(lines) {
  const results = lines.filter((line) => line.file);
  const runs = lines.filter((line) => line.run).map((line) => line.run);
  const latest = new Map();
  for (const entry of results) {
    const key = `${entry.file}: ${entry.label}`;
    if (!latest.has(key) || entry.killed) latest.set(key, entry);
  }
  const entries = [...latest.values()];
  const perFileCounts = {};
  for (const entry of entries) {
    const row = perFileCounts[entry.file] ??= { total: 0, killed: 0, equivalent: 0, survived: 0, undecided: 0 };
    row.total += 1;
    if (entry.killed) row.killed += 1;
    else if (entry.undecided) row.undecided += 1;
    else if (entry.equivalent) row.equivalent += 1;
    else row.survived += 1;
  }
  const total = { generated: all.length, executed: entries.length, killed: 0, equivalent: 0, survived: 0, undecided: 0 };
  for (const row of Object.values(perFileCounts)) for (const key of ['killed', 'equivalent', 'survived', 'undecided']) total[key] += row[key];
  const survivors = entries.filter((entry) => !entry.killed && !entry.equivalent && !entry.undecided).map((entry) => `${entry.file}: ${entry.label}`);
  const open = entries.filter((entry) => entry.undecided).map((entry) => `${entry.file}: ${entry.label} (${entry.undecided})`);
  return { schema: 'C011-mutation/1', ...total, undecidedCount: total.undecided, notExecuted: all.length - entries.length,
    perFile: perFileCounts, survivors, undecided: open, runs, entries };
}

// What a run was recorded against: the production files and every test file the stages can load, by SHA-256 (raw and LF-normalized), taken when the run
// STARTED. The files that only produce or check evidence are not inputs of a kill. Later test files are never edited, only added (see --retest).
const NOT_AN_INPUT = /^(evidence|seal|figures|loop|fresh|coverage|browser|guard-mutants|mutants-equivalent|mutate-gen|imports-check|imports\.test)/;
const shaOf = (bytes) => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
function inputs() {
  const row = (relative) => {
    const bytes = fs.readFileSync(path.join(root, relative));
    return { path: relative.replaceAll('\\', '/'), raw: shaOf(bytes), lf: shaOf(Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')) };
  };
  return [...PRODUCTION, ...fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.cjs') && !NOT_AN_INPUT.test(name)).sort().map((name) => `tests/${name}`)].map(row);
}

(async () => {
  const lines = fs.existsSync(progressFile) ? fs.readFileSync(progressFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
  if (finalizeOnly) {
    const result = report(lines);
    fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`, { flag: 'wx' });
    if (result.notExecuted || result.survived || result.undecidedCount) process.exitCode = 1;
    return;
  }
  const key = (mutant) => `${mutant.file}: ${mutant.label}`;
  // A run resumes: what has an entry is not run again; a retest runs only what has no killed entry, against the test files added since.
  const killed = new Set(lines.filter((entry) => entry.killed).map(key));
  const done = new Set(lines.map(key));
  const queue = mutants.filter((mutant) => (retestOnly ? !killed.has(key(mutant)) && done.has(key(mutant)) : !done.has(key(mutant))));
  const started = Date.now();
  fs.appendFileSync(progressFile, `${JSON.stringify({ run: { mode: retestOnly ? 'retest' : 'campaign', startedAt: new Date(started).toISOString(), workers, extraTests, node: process.version, inputs: inputs() } })}\n`);
  fs.mkdirSync(scratch, { recursive: false });
  try { await worker('w1', queue, []); }
  finally { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  console.log(`done in ${Math.round((Date.now() - started) / 1000)} s: ${queue.length} left in the queue; build the report with --finalize`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
