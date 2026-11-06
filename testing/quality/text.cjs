'use strict';
// Text normalisation shared by the scanners: what a reader sees, not what the bytes are (V2, V9). Every normalisation of a string happens ONCE per
// validation: fold() memoises its result (N8) and counts the normalize calls and the characters they saw, so a test can prove the bound.
const CONFUSABLES = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ѕ: 's', ј: 'j', ԁ: 'd', А: 'A', В: 'B', Е: 'E', С: 'C', Α: 'A', Β: 'B', Ε: 'E', Ο: 'O', Ρ: 'P', Τ: 'T', ο: 'o', ν: 'v', α: 'a' };
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

const memo = new Map();
const counters = { normalizeCalls: 0, foldedChars: 0 };

// A new validation starts with an empty memo and zero counters (the memo holds at most two copies of the budgeted text).
function resetFold() { memo.clear(); counters.normalizeCalls = 0; counters.foldedChars = 0; }
const foldStats = () => ({ ...counters, memoSize: memo.size });

// NFKC (full-width to ASCII, non-breaking space and hyphen to plain), without format characters (zero-width space and joiner, bidi marks,
// soft hyphen), with every dash variant folded to '-' and every space variant to ' '. The result is itself a fixed point of fold.
function fold(text) {
  const source = String(text);
  const known = memo.get(source);
  if (known !== undefined) return known;
  counters.normalizeCalls += 1;
  counters.foldedChars += source.length;
  const folded = source.normalize('NFKC')
    .replace(/[\p{Cf}\u00ad]/gu, '')
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-')
    .replace(/[\p{Zs}\t\v\f]/gu, ' ');
  memo.set(source, folded);
  if (folded !== source) memo.set(folded, folded);
  return folded;
}

// Letters from other alphabets that look like Latin ones.
const latin = (text) => text.replace(CONFUSABLE, (c) => CONFUSABLES[c]);

// Markdown emphasis, code ticks, escapes, line-break tags, combining marks and whitespace do not separate the digits of an identifier. The marks go
// first: NFKC would otherwise compose a hex letter and its mark into one accented letter and hide it.
const squash = (text) => latin(fold(String(text).replace(/\p{M}+/gu, ''))).replace(/<br\s*\/?>/gi, '').replace(/[\s*`~_\\]+/g, '');

// Lower case words separated by single spaces: hyphens and underscores count as spaces.
const words = (text) => latin(fold(text)).toLowerCase().replace(/[\s\-_*`~]+/g, ' ').trim();

// A run of more than 32 combining marks is refused before anything is normalised: canonical reordering of such a run is super-quadratic.
const MAX_MARK_RUN = 32;
const MARK_RUN = new RegExp(`\\p{M}{${MAX_MARK_RUN + 1}}`, 'u');
const hasMarkRun = (text) => MARK_RUN.test(text);

module.exports = { fold, latin, squash, words, resetFold, foldStats, hasMarkRun, MAX_MARK_RUN };
