'use strict';

// Test tooling, not production code: a SYSTEMATIC mutant generator (L-0172): every single condition, every comparison and logical
// operator, every negation, every simple statement and every `return value;` of a production file, not a chosen list. Comments, strings,
// template literals and regular expressions are masked first, so an operator is only ever mutated where it is code. A mutant that does not
// compile is dropped. generate(source) returns [{ id, line, kind, from, to, apply(source) }]; the runner (mutate-run.cjs) kills or spares each.
const vm = require('node:vm');

// Same length as the source: everything that is not code becomes spaces (newlines kept), so offsets and line numbers still match.
function mask(source) {
  const out = source.split('');
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  const regexAllowed = () => {
    let k = i - 1;
    while (k >= 0 && /[ \t]/.test(source[k])) k -= 1;
    return k < 0 || '(,=:[!&|?{};'.includes(source[k]) || /\breturn$/.test(source.slice(Math.max(0, k - 5), k + 1));
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') { const end = source.indexOf('\n', i); const stop = end === -1 ? source.length : end; blank(i, stop); i = stop; } else if (c === '/' && next === '*') { const end = source.indexOf('*/', i + 2); const stop = end === -1 ? source.length : end + 2; blank(i, stop); i = stop; } else if (c === '\'' || c === '"') {
      let k = i + 1;
      while (k < source.length && source[k] !== c) k += source[k] === '\\' ? 2 : 1;
      blank(i + 1, k);
      i = k + 1;
    } else if (c === '`') {
      let k = i + 1;
      while (k < source.length && source[k] !== '`') k += source[k] === '\\' ? 2 : 1;
      blank(i + 1, k);
      i = k + 1;
    } else if (c === '/' && regexAllowed()) {
      let k = i + 1;
      let inClass = false;
      while (k < source.length && (source[k] !== '/' || inClass) && source[k] !== '\n') {
        if (source[k] === '\\') k += 1;
        else if (source[k] === '[') inClass = true;
        else if (source[k] === ']') inClass = false;
        k += 1;
      }
      blank(i + 1, k);
      i = k + 1;
    } else i += 1;
  }
  return out.join('');
}

const compiles = (source) => { try { new vm.Script(source); return true; } catch { return false; } };
const lineOf = (source, offset) => source.slice(0, offset).split('\n').length;

// The offset of the parenthesis that closes the one opened at `open` (in the masked source).
function closing(masked, open) {
  let depth = 0;
  for (let k = open; k < masked.length; k += 1) {
    if (masked[k] === '(') depth += 1;
    else if (masked[k] === ')') { depth -= 1; if (depth === 0) return k; }
  }
  return -1;
}

function generate(source, { numbers = false } = {}) {
  const masked = mask(source);
  const sites = [];
  const add = (kind, from, to, replacement, note) => sites.push({ kind, from, to, replacement, note });
  for (const m of masked.matchAll(/===/g)) add('equality', m.index, m.index + 3, '!==', '=== -> !==');
  for (const m of masked.matchAll(/!==/g)) add('equality', m.index, m.index + 3, '===', '!== -> ===');
  for (const m of masked.matchAll(/(?<![=!<>])>=(?!=)/g)) add('relational', m.index, m.index + 2, '<', '>= -> <');
  for (const m of masked.matchAll(/(?<![=!<>-])<=(?!=)/g)) add('relational', m.index, m.index + 2, '>', '<= -> >');
  for (const m of masked.matchAll(/(?<![=!<>-])>(?![=>])/g)) add('relational', m.index, m.index + 1, '<=', '> -> <=');
  for (const m of masked.matchAll(/(?<![=!<>])<(?![=<!/])(?=[ \w(])/g)) add('relational', m.index, m.index + 1, '>=', '< -> >=');
  for (const m of masked.matchAll(/&&/g)) add('logical', m.index, m.index + 2, '||', '&& -> ||');
  for (const m of masked.matchAll(/\|\|/g)) add('logical', m.index, m.index + 2, '&&', '|| -> &&');
  for (const m of masked.matchAll(/!(?![=])(?=[A-Za-z_(\[])/g)) add('negation', m.index, m.index + 1, '', 'remove !');
  for (const m of masked.matchAll(/\b(if|while)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const end = closing(masked, open);
    if (end > 0) {
      add('condition', open + 1, end, 'true', `${m[1]} (...) -> true`);
      add('condition', open + 1, end, 'false', `${m[1]} (...) -> false`);
    }
  }
  // Simple statements, one line at a time (a multi-line regex over a masked source backtracks badly).
  let offset = 0;
  for (const line of masked.split('\n')) {
    const indent = /^[ \t]*/.exec(line)[0].length;
    const body = line.slice(indent).trimEnd();
    const from = offset + indent;
    if (body.endsWith(';') && !/^(const|let|var|throw|break|continue|else|case|for|if|while|\}|return)\b/.test(body)) {
      if (/^[\w.$\[\]]+\s*(\+=|-=|=)\s*[^;=]+;$/.test(body) && !/^[\w.$\[\]]+\s*=\s*=/.test(body)) add('statement', from, from + body.length, ';', 'remove assignment statement');
      else if (/^(await\s+)?[\w$]+(\.[\w$]+)*\(.*\);$/.test(body)) add('statement', from, from + body.length, ';', 'remove call statement');
    }
    if (/^return\s+[^;]+;$/.test(body)) add('return', from, from + body.length, 'return undefined;', 'return value -> undefined');
    offset += line.length + 1;
  }
  for (const m of masked.matchAll(/\b(true|false)\b/g)) add('boolean', m.index, m.index + m[0].length, m[0] === 'true' ? 'false' : 'true', `${m[0]} flipped`);
  if (numbers) {
    for (const m of masked.matchAll(/(?<![\w.$])(\d+)(?![\w.])/g)) {
      const lineStart = masked.lastIndexOf('\n', m.index) + 1;
      const lineText = masked.slice(lineStart, masked.indexOf('\n', m.index));
      // The status of every typed code and the units of every seed are asserted by the HTTP suites one by one; the bounds and limits are what this operator is for.
      if (/\[[45]\d\d,/.test(lineText) || /^\s*'tenant-\w+': \[\[|^\s*'tenant-\w+': \['synthetic/.test(lineText)) continue;
      add('number', m.index, m.index + m[0].length, String(Number(m[0]) + 1), `${m[0]} -> ${Number(m[0]) + 1}`);
    }
  }

  const seen = new Set();
  const mutants = [];
  for (const site of sites) {
    const key = `${site.from}:${site.to}:${site.replacement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mutated = source.slice(0, site.from) + site.replacement + source.slice(site.to);
    if (!compiles(mutated)) continue;
    mutants.push({ id: `${site.kind}@${lineOf(source, site.from)}:${site.from}`, line: lineOf(source, site.from), kind: site.kind, note: site.note, from: source.slice(site.from, site.to).slice(0, 80), to: site.replacement, apply: () => mutated });
  }
  return mutants.sort((first, second) => first.line - second.line || first.id.localeCompare(second.id));
}

module.exports = Object.freeze({ generate, mask });
