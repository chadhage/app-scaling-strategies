'use strict';
// A small quote-aware parser for the az and PowerShell texts of the plan (V4, V10). It reads text the way a shell does: quotes, escapes,
// here-strings, comments, continuation lines, statement separators (newline ; && || |) and blocks ({ } and parentheses, with the keyword
// that opened them), so a command hidden by formatting is still a command and a command inside a string or a comment is not.
const { fold } = require('./text.cjs');

const KEYWORDS = new Set(['try', 'catch', 'finally', 'if', 'else', 'elseif', 'foreach', 'for', 'while', 'do', 'switch', 'function']);

function parse(input) {
  const src = fold(Array.isArray(input) ? input.join('\n') : String(input)).replace(/[`\\][ \t]*\r?\n[ \t]*/g, ' ').replace(/\r/g, '');
  const statements = [];
  const blocks = [{ id: 0, kind: 'root', parent: -1, statements: 0 }];
  const stack = [0];
  let words = [];
  let cur = null;
  let start = -1;
  let kw = null;
  let orElse = false;
  let line = 1;
  const word = () => { if (cur === null) { cur = { text: '', quoted: false }; if (start < 0) start = i; } return cur; };
  const pushWord = () => { if (cur !== null) { words.push(cur); cur = null; } };
  function endStatement(at) {
    pushWord();
    if (words.length > 0) {
      statements.push({ words, blocks: [...stack], line, raw: src.slice(start, at).trim(), orElse });
      orElse = false;
      blocks[stack[stack.length - 1]].statements += 1;
      const first = words[0].quoted ? '' : words[0].text.toLowerCase();
      if (KEYWORDS.has(first)) kw = { name: first === 'function' ? `function:${words[1] ? words[1].text : ''}` : first, depth: stack.length };
      else if (kw && kw.depth === stack.length) kw = null;
    }
    words = [];
    start = -1;
  }
  const open = (kind) => { blocks.push({ id: blocks.length, kind, parent: stack[stack.length - 1], statements: 0 }); stack.push(blocks.length - 1); };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { endStatement(i); line += 1; i += 1; } else if (ch === ' ' || ch === '\t') { pushWord(); i += 1; } else if (ch === ';') { endStatement(i); i += 1; } else if (ch === '#' && cur === null) {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (ch === '&' && src[i + 1] === '&') { endStatement(i); i += 2; } else if (ch === '|') { endStatement(i); orElse = src[i + 1] === '|'; i += orElse ? 2 : 1; } else if (ch === '&') {
      if (cur === null && words.length === 0) { word().text = '&'; pushWord(); } else endStatement(i);
      i += 1;
    } else if (ch === '$' && src[i + 1] === '{') {
      const end = src.indexOf('}', i);
      word().text += src.slice(i, end < 0 ? src.length : end + 1);
      i = end < 0 ? src.length : end + 1;
    } else if (ch === '{' || ch === '(') {
      if (cur !== null && (cur.text === '$' || cur.text === '@') && !cur.quoted) cur = null;
      endStatement(i);
      const kind = ch === '(' ? 'paren' : (kw && kw.depth === stack.length ? kw.name : 'script');
      if (ch === '{') kw = null;
      open(kind);
      i += 1;
    } else if (ch === '}' || ch === ')') { endStatement(i); if (stack.length > 1) stack.pop(); i += 1; } else if (ch === '@' && (src[i + 1] === "'" || src[i + 1] === '"') && /^[ \t]*\n/.test(src.slice(i + 2))) {
      const q = src[i + 1];
      const close = src.indexOf(`\n${q}@`, i + 2);
      const end = close < 0 ? src.length : close;
      const w = word();
      w.quoted = true;
      w.text += src.slice(i + 2, end).replace(/^[ \t]*\n/, '');
      line += (src.slice(i, end).match(/\n/g) || []).length;
      i = close < 0 ? src.length : close + 3;
    } else if (ch === "'") {
      const w = word();
      w.quoted = true;
      i += 1;
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") { w.text += "'"; i += 2; } else if (src[i] === "'") { i += 1; break; } else { w.text += src[i]; i += 1; }
      }
    } else if (ch === '"') {
      const w = word();
      w.quoted = true;
      i += 1;
      while (i < src.length) {
        if (src[i] === '`' && i + 1 < src.length) { w.text += src[i + 1]; i += 2; } else if (src[i] === '"' && src[i + 1] === '"') { w.text += '"'; i += 2; } else if (src[i] === '"') { i += 1; break; } else { w.text += src[i]; i += 1; }
      }
    } else { word().text += ch; i += 1; }
  }
  endStatement(src.length);
  return { statements, blocks };
}

// The command of a statement: the first word after call operators and "$x = " assignments, as a lower-case name without path or extension.
function commandOf(st) {
  const w = st.words;
  let i = 0;
  let call = false;
  while (i < w.length && w[i].text === '&' && !w[i].quoted) { call = true; i += 1; }
  while (i + 1 < w.length && !w[i].quoted && /^\$[\w:]+$/.test(w[i].text) && w[i + 1].text === '=') i += 2;
  const head = w[i];
  if (!head) return { name: '', head: undefined, rest: [], call, dynamic: false };
  const base = head.text.split(/[\\/]/).pop().toLowerCase().replace(/\.(?:cmd|exe|bat|ps1)$/, '');
  const dynamic = !head.quoted ? /[$%]/.test(head.text) && call : call && /[$%]/.test(head.text);
  return { name: base, head, rest: w.slice(i + 1), call, dynamic, quoted: head.quoted };
}

// az sub-command words (up to the first option) and the options with their values; a non-literal sub-command word is "dynamic".
function azParts(rest) {
  const sub = [];
  let i = 0;
  while (i < rest.length && !(rest[i].text.startsWith('-') && !rest[i].quoted) && sub.length < 6) { sub.push(rest[i]); i += 1; }
  const opts = [];
  for (; i < rest.length; i += 1) {
    const t = rest[i];
    if (t.text.startsWith('-') && t.text.length > 1 && !t.quoted) {
      const eq = t.text.indexOf('=');
      opts.push({ name: (eq < 0 ? t.text : t.text.slice(0, eq)).toLowerCase(), values: eq < 0 ? [] : [t.text.slice(eq + 1)], inline: eq >= 0 });
    } else if (opts.length > 0) opts[opts.length - 1].values.push(t.text);
  }
  return { sub: sub.map((s) => s.text.toLowerCase()), dynamic: sub.some((s) => !/^[A-Za-z][A-Za-z0-9-]*$/.test(s.text)), opts };
}

const optValue = (opts, ...names) => { const o = opts.find((x) => names.includes(x.name)); return o ? o.values.join(' ') : undefined; };

module.exports = { parse, commandOf, azParts, optValue };
