'use strict';
const { ENCODERS } = require('./scanner.cjs');
const numeric = (value, radix, pad, end, upper = false) => [...value].map((char) => {
  const digits = char.codePointAt(0).toString(radix).padStart(pad, '0');
  return `&#${radix === 16 ? 'x' : ''}${upper ? digits.toUpperCase() : digits}${end}`;
}).join('');
const braced = (value, pad, upper = false) => [...value].map((char) => {
  const digits = char.codePointAt(0).toString(16).padStart(pad, '0');
  return `\\u{${upper ? digits.toUpperCase() : digits}}`;
}).join('');
const named = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', ' ': '&nbsp;' };
const ADDED = Object.freeze({
  literalPlus: (value) => value.replace(/ /g, '+'),
  standardForm: (value) => encodeURIComponent(value).replace(/%20/g, '+'),
  hex7: (value) => numeric(value, 16, 7, ';'),
  hex8NoSemi: (value) => numeric(value, 16, 8, ''),
  hex12Upper: (value) => numeric(value, 16, 12, ';', true),
  decimal7: (value) => numeric(value, 10, 7, ';'),
  decimal8NoSemi: (value) => numeric(value, 10, 8, ''),
  decimal12: (value) => numeric(value, 10, 12, ';'),
  braced7: (value) => braced(value, 7),
  braced8: (value) => braced(value, 8),
  braced12Upper: (value) => braced(value, 12, true),
  braced: (value) => braced(value, 0),
  hexEscape: (value) => [...value].map((char) => `\\x${char.codePointAt(0).toString(16).padStart(2, '0')}`).join(''),
  htmlNamed: (value) => value.replace(/[&<>"' ]/g, (char) => named[char])
});
const COVERED = Object.freeze({ ...ENCODERS, ...ADDED });
module.exports = { ADDED, COVERED };
