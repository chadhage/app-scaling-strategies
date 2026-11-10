'use strict';

// The by-value half of the redaction: canonical forms of a text and the encodings of a secret. Every function is linear in its input
// (no nested quantifiers, no backtracking) and total: it returns a string or a boolean and never throws on a string.
const MIN_SECRET = 6;
const MIN_BASE64 = 8;
const DASHES = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;
const NAMED = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' });

// Case, compatibility forms (full-width letters, ligatures, exotic spaces), format characters (zero-width, soft hyphen, BOM, bidi controls),
// combining marks and the dash look-alikes do not hide a secret.
function fold(text) {
  return text.normalize('NFKD').replace(/[\p{Cf}\p{Mn}\p{Me}]/gu, '').replace(DASHES, '-').toLowerCase();
}

// Every run of %XX is decoded as bytes (invalid UTF-8 becomes U+FFFD, so one bad byte cannot protect the rest of the run).
function percentDecode(text) {
  return text.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => Buffer.from(run.replace(/%/g, ''), 'hex').toString('utf8'));
}

function htmlDecode(text) {
  return text.replace(/&(?:#([xX][0-9a-fA-F]{1,6}|\d{1,7})|([a-zA-Z]{2,6}));?/g, (all, numeric, named) => {
    if (numeric !== undefined) {
      const point = /^[xX]/.test(numeric) ? parseInt(numeric.slice(1), 16) : Number(numeric);
      return point <= 0x10ffff ? String.fromCodePoint(point) : all;
    }
    return Object.hasOwn(NAMED, named.toLowerCase()) ? NAMED[named.toLowerCase()] : all;
  });
}

function unicodeUnescape(text) {
  return text.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (all, braced, four, two) => {
    const point = parseInt(braced || four || two, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : all;
  });
}

// The text as it is, with one and two rounds of URL decoding, HTML entities and \u escapes decoded, and the plus signs of a form-encoded text read as spaces.
const views = (text) => [text, percentDecode(text), percentDecode(percentDecode(text)), htmlDecode(text), unicodeUnescape(text), percentDecode(text.replace(/\+/g, ' '))];

// What to look for: base64 and base64url at the three alignments the secret can have inside a longer base64 text (the characters that depend on
// the neighbouring bytes are cut off), and the folded text and the hex of the secret (hex is matched case-insensitively on folded views).
function needlesFor(secret) {
  const bytes = Buffer.from(secret, 'utf8');
  const exact = new Set();
  for (const prefix of [0, 1, 2]) {
    let text = Buffer.concat([Buffer.alloc(prefix), bytes]).toString('base64').replace(/=+$/, '');
    if ((prefix + bytes.length) % 3 !== 0) text = text.slice(0, -1);
    text = text.slice([0, 2, 3][prefix]);
    if (text.length >= MIN_BASE64) {
      exact.add(text);
      exact.add(text.replace(/\+/g, '-').replace(/\//g, '_'));
    }
  }
  return { exact: [...exact], folded: [...new Set([fold(secret), bytes.toString('hex')])] };
}

// The marker that takes the place of a secret where it stands verbatim: no needle contains it and fold() leaves it alone.
const SET_ASIDE = '\u0000';

const holds = (needles, exactViews, foldedViews) => needles.exact.some((needle) => exactViews.some((view) => view.includes(needle)))
  || needles.folded.some((needle) => foldedViews.some((view) => view.includes(needle)));

// True when the ORIGINAL text holds a registered secret in a covered form other than as written (case, compatibility forms, format characters, URL, HTML and \u escapes,
// plus for space, base64, hex). Where a registered secret stands verbatim it is replaced in place and whole, so for a given secret every verbatim occurrence of a registered
// secret that contains it (itself, a longer secret, an e-mail address that holds a name in lower case) is set aside first. That is what lets a registered PART of a longer secret
// (a surname, an e-mail local part) stand verbatim inside an encoded form of the longer secret without hiding it: the longer secret is not set aside, so its form is found.
function encodedIn(text, registry) {
  if (text.length < MIN_SECRET) return false;
  const shared = views(text);
  const sharedFolded = shared.map(fold);
  const present = [...registry.keys()].filter((other) => text.includes(other)).map((other) => [other, fold(other)]);
  for (const [secret, needles] of registry) {
    const key = fold(secret);
    const covering = present.filter(([, folded]) => folded.includes(key)).map(([other]) => other);
    const exactViews = covering.length > 0 ? views(covering.reduce((rest, other) => rest.split(other).join(SET_ASIDE), text)) : shared;
    const foldedViews = covering.length > 0 ? exactViews.map(fold) : sharedFolded;
    if (holds(needles, exactViews, foldedViews)) return true;
  }
  return false;
}

module.exports = Object.freeze({ MIN_SECRET, fold, percentDecode, htmlDecode, unicodeUnescape, views, needlesFor, encodedIn });
