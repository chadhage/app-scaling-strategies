'use strict';

const { UsageError } = require('./errors.cjs');

// Only * (inside one path segment), ** (across segments) and ? (one character) are glob syntax here; patterns always use / separators.
// Every other glob character is refused instead of being guessed, so a pattern never silently means something else.
const REFUSED = /[[\]{}()!]/;

function normalizePattern(pattern) {
  return String(pattern).replace(/\\/g, '/');
}

function hasMagic(pattern) {
  return /[*?]/.test(pattern);
}

function globToRegExp(pattern) {
  const text = normalizePattern(pattern);
  if (text === '') throw new UsageError('A glob must not be empty.');
  if (REFUSED.test(text)) throw new UsageError(`Unsupported glob syntax in "${pattern}": only *, ** and ? are supported.`);
  let source = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '*') {
      if (text[index + 1] === '*') {
        if (text[index + 2] === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[.+^$|]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function matchesGlob(relativePath, pattern) {
  return globToRegExp(pattern).test(normalizePattern(relativePath));
}

module.exports = Object.freeze({ normalizePattern, hasMagic, globToRegExp, matchesGlob });
