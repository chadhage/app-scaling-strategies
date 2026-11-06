'use strict';

// Test tooling (not production code): a small JavaScript lexer and a SYSTEMATIC mutant generator (L-0172). It mutates every statement and every single
// condition of a source file, not a chosen list: statement deletion, whole-condition and per-operand constants of every logical chain, comparison and
// logical operator flips, removed negations, boolean literals, Math.min/Math.max and some/every swaps. Mutants that do not parse are discarded.

const vm = require('node:vm');

const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
const REGEX_AFTER_WORD = /^(return|typeof|case|do|else|in|of|void|delete|throw|new|await|yield)$/;
const NOT_A_STATEMENT = /^(const|let|var|function|class|async|if|else|for|while|do|try|catch|finally|switch|case|default|break|continue|import|export)$/;
const BLOCK_AFTER = /^(\)|=>|else|try|finally|do|;|\{|\})$/;

function skipString(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
  return j + 1;
}

function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') j += 2;
    else if (src[j] === '$' && src[j + 1] === '{') {
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '`') j = skipTemplate(src, j);
        else if (src[j] === '"' || src[j] === "'") j = skipString(src, j);
        else {
          if (src[j] === '{') depth += 1;
          if (src[j] === '}') depth -= 1;
          j += 1;
        }
      }
    } else j += 1;
  }
  return j + 1;
}

function lex(src) {
  const tokens = [];
  let i = 0;
  let prev = null;
  const push = (type, end) => {
    const token = { type, start: i, end, text: src.slice(i, end) };
    tokens.push(token);
    if (type !== 'ws' && type !== 'comment') prev = token;
    i = end;
  };
  const regexAllowed = () => !prev || (prev.type === 'punct' && !/^[)\]}]$/.test(prev.text)) || (prev.type === 'ident' && REGEX_AFTER_WORD.test(prev.text));
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    let m;
    if ((m = /^\s+/.exec(rest))) push('ws', i + m[0].length);
    else if (c === '/' && src[i + 1] === '/') push('comment', src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i));
    else if (c === '/' && src[i + 1] === '*') push('comment', src.indexOf('*/', i + 2) + 2);
    else if (c === '"' || c === "'") push('string', skipString(src, i));
    else if (c === '`') push('template', skipTemplate(src, i));
    else if (c === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && (src[j] !== '/' || inClass)) {
        if (src[j] === '\\') j += 1;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j += 1;
      }
      j += 1;
      while (/[a-z]/.test(src[j] || '')) j += 1;
      push('regex', j);
    } else if ((m = /^(0[xXbBoO][0-9a-fA-F_]+n?|[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?n?|\.[0-9]+)/.exec(rest))) push('num', i + m[0].length);
    else if ((m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rest))) push('ident', i + m[0].length);
    else push('punct', i + (PUNCT.find((p) => rest.startsWith(p)) || c).length);
  }
  return tokens;
}

const lineOf = (src, offset) => src.slice(0, offset).split('\n').length;
const colOf = (src, offset) => offset - src.lastIndexOf('\n', offset - 1);

// Operand boundaries of a logical chain: the operand around token k (at its own depth) as [first, last] indices into the significant tokens.
function operandAround(sig, k, depthOf) {
  const d = depthOf[k];
  const stop = (t, j) => depthOf[j] < d || (depthOf[j] === d && (t.text === '&&' || t.text === '||' || t.text === ',' || t.text === ';' || t.text === '?' || t.text === ':' || t.text === '=' || t.text === '=>' || t.text === 'return'));
  let a = k;
  while (a - 1 >= 0 && !stop(sig[a - 1], a - 1)) a -= 1;
  let b = k;
  while (b + 1 < sig.length && !stop(sig[b + 1], b + 1)) b += 1;
  return [a, b];
}

function mutantsOf(src) {
  const tokens = lex(src);
  const sig = tokens.filter((t) => t.type !== 'ws' && t.type !== 'comment');
  const depthOf = [];
  const kinds = [];
  const stack = [];
  let depth = 0;
  sig.forEach((t, k) => {
    if (t.type === 'punct' && /^[)\]}]$/.test(t.text)) { depth -= 1; stack.pop(); }
    depthOf[k] = depth;
    kinds[k] = stack.length ? stack[stack.length - 1] : 'block';
    if (t.type === 'punct' && /^[(\[{]$/.test(t.text)) {
      depth += 1;
      const before = sig[k - 1];
      stack.push(t.text === '{' ? (!before || BLOCK_AFTER.test(before.text) ? 'block' : 'object') : 'paren');
    }
  });
  const out = [];
  const add = (start, end, replacement, op) => out.push({ start, end, replacement, op });
  const addRange = (a, b, replacement, op) => add(sig[a].start, sig[b].end, replacement, op);
  const flips = { '===': '!==', '!==': '===', '==': '!=', '!=': '==', '<': '>=', '>': '<=', '<=': '>', '>=': '<', '&&': '||', '||': '&&' };
  sig.forEach((t, k) => {
    if (t.type === 'punct' && flips[t.text]) add(t.start, t.end, flips[t.text], `flip ${t.text}`);
    if (t.type === 'punct' && t.text === '!') add(t.start, t.end, '', 'drop !');
    if (t.type === 'ident' && (t.text === 'true' || t.text === 'false')) add(t.start, t.end, t.text === 'true' ? 'false' : 'true', `literal ${t.text}`);
    if (t.type === 'ident' && sig[k - 1] && sig[k - 1].text === '.') {
      const swap = { min: 'max', max: 'min', some: 'every', every: 'some' }[t.text];
      if (swap && sig[k + 1] && sig[k + 1].text === '(') add(t.start, t.end, swap, `swap ${t.text}`);
    }
    const isLogic = t.type === 'punct' && (t.text === '&&' || t.text === '||');
    const isTernary = t.type === 'punct' && t.text === '?';
    const isCondition = t.type === 'ident' && (t.text === 'if' || t.text === 'while') && sig[k + 1] && sig[k + 1].text === '(';
    if (isLogic || isTernary) {
      const [a, b] = operandAround(sig, k, depthOf);
      const left = [a, k - 1];
      if (left[1] >= left[0]) for (const value of ['true', 'false']) addRange(left[0], left[1], value, `operand ${value}`);
      if (isLogic && b >= k + 1) {
        const right = operandAround(sig, k + 1, depthOf);
        for (const value of ['true', 'false']) addRange(right[0], right[1], value, `operand ${value}`);
      }
    }
    if (isCondition) {
      let close = k + 1;
      while (!(depthOf[close] === depthOf[k + 1] && sig[close].text === ')')) close += 1;
      for (const value of ['true', 'false']) addRange(k + 2, close - 1, value, `condition ${value}`);
    }
    const startsStatement = kinds[k] === 'block' && sig[k].text !== '}' && (k === 0 || (/^[;{}]$/.test(sig[k - 1].text) && (sig[k - 1].text !== '{' || kinds[k] === 'block')));
    if (startsStatement && t.type === 'ident' && !NOT_A_STATEMENT.test(t.text)) {
      let end = k;
      while (end < sig.length && !(sig[end].text === ';' && depthOf[end] === depthOf[k]) && depthOf[end] >= depthOf[k]) end += 1;
      if (end < sig.length && sig[end].text === ';') {
        const op = t.text === 'return' ? 'return nothing' : t.text === 'throw' ? 'drop throw' : 'drop statement';
        add(t.start, sig[end].end, t.text === 'return' ? 'return;' : ';', op);
      }
    }
  });
  const seen = new Set();
  const valid = [];
  for (const m of out.sort((x, y) => x.start - y.start || x.end - y.end)) {
    if (m.replacement === src.slice(m.start, m.end)) continue;
    const key = `${m.start}:${m.end}:${m.replacement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mutated = src.slice(0, m.start) + m.replacement + src.slice(m.end);
    try {
      new vm.Script(`(function (exports, require, module, __filename, __dirname) {${mutated}\n})`);
    } catch {
      continue;
    }
    valid.push({ ...m, line: lineOf(src, m.start), col: colOf(src, m.start), original: src.slice(m.start, m.end), mutated });
  }
  return valid;
}

module.exports = { lex, mutantsOf };
