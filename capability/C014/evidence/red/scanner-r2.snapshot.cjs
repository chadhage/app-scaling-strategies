'use strict';

// Test tooling, not production code: an INDEPENDENT scanner for canaries in the bytes that left the server. It re-derives every encoding
// from the canary itself (it shares no code with the redactor) and reports canary ids and form names, never the value.
const pct = (text, lower) => [...Buffer.from(text, 'utf8')].map((byte) => `%${lower ? byte.toString(16).padStart(2, '0') : byte.toString(16).padStart(2, '0').toUpperCase()}`).join('');
const base64Forms = (value) => {
  const bytes = Buffer.from(value, 'utf8');
  const out = { base64: [], base64url: [] };
  for (const prefix of [0, 1, 2]) {
    let text = Buffer.concat([Buffer.alloc(prefix), bytes]).toString('base64').replace(/=+$/, '');
    if ((prefix + bytes.length) % 3 !== 0) text = text.slice(0, -1);
    text = text.slice([0, 2, 3][prefix]);
    out.base64.push(text);
    out.base64url.push(text.replace(/\+/g, '-').replace(/\//g, '_'));
  }
  return out;
};
const units = (value) => Array.from({ length: value.length }, (_, index) => value.charCodeAt(index).toString(16).padStart(4, '0'));
const FULL_WIDTH = (value) => [...value].map((char) => (char >= '!' && char <= '~' ? String.fromCharCode(char.charCodeAt(0) + 0xfee0) : char)).join('');

// What an attacker can do to a canary before it reaches an answer: every encoding the sweep plants and the scanner must still recognise.
const ENCODERS = Object.freeze({
  raw: (value) => value, lower: (value) => value.toLowerCase(), upper: (value) => value.toUpperCase(), url: (value) => encodeURIComponent(value),
  urlAll: (value) => pct(value, false), urlAllLower: (value) => pct(value, true), doubleUrl: (value) => pct(pct(value, false), false),
  base64: (value) => Buffer.from(value).toString('base64'), base64url: (value) => Buffer.from(value).toString('base64url'),
  base64Offset1: (value) => Buffer.from(`x${value}y`).toString('base64'), base64Offset2: (value) => Buffer.from(`xy${value}z!`).toString('base64'),
  base64urlOffset1: (value) => Buffer.from(`x${value}y`).toString('base64url'), base64urlOffset2: (value) => Buffer.from(`xy${value}z!`).toString('base64url'),
  hex: (value) => Buffer.from(value).toString('hex'), hexUpper: (value) => Buffer.from(value).toString('hex').toUpperCase(),
  jsonUnicode: (value) => units(value).map((unit) => `\\u${unit}`).join(''), jsonUnicodeUpper: (value) => units(value).map((unit) => `\\u${unit.toUpperCase()}`).join(''),
  htmlDecimal: (value) => [...value].map((char) => `&#${char.codePointAt(0)};`).join(''), htmlHex: (value) => [...value].map((char) => `&#x${char.codePointAt(0).toString(16)};`).join(''),
  htmlHexUpper: (value) => [...value].map((char) => `&#x${char.codePointAt(0).toString(16).toUpperCase()};`).join(''),
  fullWidth: FULL_WIDTH, zeroWidth: (value) => [...value].join('\u200b'), softHyphen: (value) => [...value].join('\u00ad'), mixedEscapes: (value) => `${pct(value.slice(0, 5), false)}${value.slice(5)}`
});

// needle lists: exact ones are matched as they are; folded ones against the NFKC + format-stripped + lower-cased haystack
function forms(value) {
  const hex = Buffer.from(value, 'utf8').toString('hex');
  const exact = {
    raw: [value], url: [encodeURIComponent(value)], urlAll: [pct(value, false)], urlAllLower: [pct(value, true)], doubleUrl: [pct(pct(value, false), false)],
    ...base64Forms(value), jsonUnicode: [ENCODERS.jsonUnicode(value)], jsonUnicodeUpper: [ENCODERS.jsonUnicodeUpper(value)],
    htmlDecimal: [ENCODERS.htmlDecimal(value)], htmlHex: [ENCODERS.htmlHex(value)], htmlHexUpper: [ENCODERS.htmlHexUpper(value)]
  };
  const folded = { hex: [hex], urlLower: [encodeURIComponent(value)] };
  return { exact, folded };
}
const fold = (text) => text.normalize('NFKC').replace(/\p{Cf}/gu, '').toLowerCase();
const percentDecode = (text) => text.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => { try { return decodeURIComponent(run); } catch { return run; } });
const htmlDecode = (text) => text.replace(/&#(x[0-9a-fA-F]+|\d+);/g, (all, code) => { const point = code[0] === 'x' ? parseInt(code.slice(1), 16) : Number(code); return point <= 0x10ffff ? String.fromCodePoint(point) : all; });
const unicodeUnescape = (text) => text.replace(/\\u([0-9a-fA-F]{4})/g, (all, code) => String.fromCharCode(parseInt(code, 16)));
const views = (text) => [text, percentDecode(text), percentDecode(percentDecode(text)), htmlDecode(text), unicodeUnescape(text)];

function compile(canaries) {
  return canaries.map(({ id, value }) => ({ id, ...forms(value), plain: fold(value) }));
}

// Returns [{ id, form }] for every canary form found in the buffer (or string).
function scan(input, canaries, compiled = compile(canaries)) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  const exactViews = views(text);
  const foldedViews = exactViews.map(fold);
  const hits = [];
  for (const entry of compiled) {
    for (const [form, needles] of Object.entries(entry.exact)) {
      if (needles.some((needle) => needle && exactViews.some((view) => view.includes(needle)))) hits.push({ id: entry.id, form });
    }
    for (const form of Object.keys(entry.folded)) {
      const needle = fold(entry.folded[form][0]);
      if (needle && foldedViews.some((view) => view.includes(needle))) hits.push({ id: entry.id, form: `folded:${form}` });
    }
    if (foldedViews.some((view) => view.includes(entry.plain))) hits.push({ id: entry.id, form: 'folded' });
  }
  return hits;
}

// A scanner for data that arrives in pieces: it keeps the last `window` characters so a canary split across two chunks is found, and scans every
// `window` new characters (not every chunk: one-byte chunks of a megabyte would otherwise cost hours), plus once more when the hits are read.
function createStreamScanner(canaries) {
  const compiled = compile(canaries);
  const window = Math.max(...compiled.flatMap((entry) => Object.values(entry.exact).flat().map((needle) => needle.length))) + 8;
  let tail = '';
  let pending = '';
  const hits = [];
  const scanNow = () => {
    if (pending === '') return;
    const text = tail + pending;
    hits.push(...scan(Buffer.from(text, 'latin1'), canaries, compiled));
    tail = text.slice(-window);
    pending = '';
  };
  return {
    push(chunk) {
      pending += Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk);
      if (pending.length >= window) scanNow();
    },
    hits: () => { scanNow(); return hits; }
  };
}

// The control the stream scanner must beat: a scan of each chunk on its own misses a canary that crosses a chunk boundary.
function scanChunksSeparately(chunks, canaries) {
  const compiled = compile(canaries);
  return chunks.flatMap((chunk) => scan(chunk, canaries, compiled));
}

module.exports = Object.freeze({ ENCODERS, forms, scan, createStreamScanner, scanChunksSeparately, fold, percentDecode, htmlDecode, unicodeUnescape });
