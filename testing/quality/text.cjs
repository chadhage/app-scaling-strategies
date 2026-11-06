'use strict';
// Text normalisation shared by the scanners: what a reader sees, not what the bytes are (V2, V9). Every function is linear in the text length.
const CONFUSABLES = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ѕ: 's', ј: 'j', Α: 'A', Β: 'B', Ε: 'E', Ο: 'O', Ρ: 'P', Τ: 'T', ο: 'o', ν: 'v', α: 'a' };
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

// NFKC (full-width to ASCII, non-breaking space and hyphen to plain), without format characters (zero-width space and joiner, bidi marks,
// soft hyphen), with every dash variant folded to '-' and every space variant to ' '.
function fold(text) {
  return String(text).normalize('NFKC')
    .replace(/[\p{Cf}\u00ad]/gu, '')
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-')
    .replace(/[\p{Zs}\t\v\f]/gu, ' ');
}

// Letters from other alphabets that look like Latin ones.
const latin = (text) => text.replace(CONFUSABLE, (c) => CONFUSABLES[c]);

// Markdown emphasis, code ticks, escapes and whitespace do not separate the digits of an identifier.
const squash = (text) => fold(text).replace(/[\s*`~_\\]+/g, '');

// Lower case words separated by single spaces: hyphens and underscores count as spaces.
const words = (text) => latin(fold(text)).toLowerCase().replace(/[\s\-_*`~]+/g, ' ').trim();

module.exports = { fold, latin, squash, words };
