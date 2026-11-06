'use strict';
// Linear scanners for identifiers, secrets and wording (V2, V7, V9). No nested quantifiers: every pattern is anchored or bounded, long
// inputs are cut into tokens first, and e-mail detection looks at the characters next to each at sign instead of matching a whole pattern.
const { fold, squash, words, latin } = require('./text.cjs');

// A GUID as 32 hex digits, with or without separators; layout characters were squashed away, so line breaks, emphasis, spaces and
// underscores do not hide it, and it needs no word boundary (glued to letters, 0x prefix, 13 digits in the last group).
const GUID = /[0-9a-f]{8}[-.]{0,3}[0-9a-f]{4}[-.]{0,3}[0-9a-f]{4}[-.]{0,3}[0-9a-f]{4}[-.]{0,3}[0-9a-f]{12}/i;
const hasGuid = (text) => GUID.test(squash(text));

const LOCAL = /[\p{L}\p{N}._%+#-]/u;
const DOMAIN = /[\p{L}\p{N}-]/u;
const isLocal = (c) => c !== undefined && LOCAL.test(c);
const isDomain = (c) => c !== undefined && DOMAIN.test(c);

function deobfuscate(text) {
  return fold(text)
    .replace(/%40|&#0*64;|&#x0*40;|&commat;/gi, '@')
    .replace(/[*`~\\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?[[({<] ?at ?[\])}>] ?/gi, '@')
    .replace(/ ?[[({<] ?dot ?[\])}>] ?/gi, '.')
    .replace(/([\p{L}\p{N}._%+-]) at ([\p{L}\p{N}-]+) dot (?=\p{L})/giu, '$1@$2.');
}

// An at sign with a local-part character before it and a domain character after it, allowing quotes, a domain literal and spaces on
// both sides or after the at sign. A splat such as --parameters @file.json has a space before the at sign only and is not an address.
function hasEmail(text) {
  const t = deobfuscate(text);
  for (let i = t.indexOf('@'); i >= 0; i = t.indexOf('@', i + 1)) {
    const before = t[i - 1];
    const after = t[i + 1];
    const left = before === '"' ? t[i - 2] : before;
    const right = after === '[' ? t[i + 2] : after;
    if (isLocal(left) && isDomain(right)) return true;
    if (before === ' ' && after === ' ' && isLocal(t[i - 2]) && isDomain(t[i + 2])) return true;
    if (isLocal(before) && after === ' ' && isDomain(t[i + 2])) return true;
  }
  return false;
}

const NAME = /(?:secret|password|passwd|pwd|token|apikey|api[-_ ]?key|accountkey|sharedaccesskey|connectionstring|credential|private[-_ ]?key)$/i;
const PREFIXES = [/^AKIA[0-9A-Z]{16}/, /^gh[pousr]_[A-Za-z0-9]{30,}/, /^github_pat_[A-Za-z0-9_]{20,}/, /^xox[baprs]-[A-Za-z0-9-]{10,}/, /^sk-[A-Za-z0-9_-]{20,}/];
const PLACEHOLDER = /^(?:<[^<>]{1,80}>|\$\{?\w+\}?|%\w+%)$/;
const PARAM = /^(?:sig|sv|se|sas|key|token|code|access_token|client_secret|secret|password|pwd)$/i;

function tokenSecret(tok) {
  if (PREFIXES.some((re) => re.test(tok))) return 'a known key prefix';
  const dots = tok.split('.');
  if (dots.length === 3 && dots[0].startsWith('eyJ') && dots.every((s) => /^[A-Za-z0-9_-]{10,}$/.test(s))) return 'a JWT';
  if (tok.length >= 36 && tok.includes('~') && /^[A-Za-z0-9_.~-]+$/.test(tok) && /[A-Z]/.test(tok) && /[a-z]/.test(tok) && /\d/.test(tok)) return 'an Entra client secret shape';
  const eq = tok.search(/[=:]/);
  if (eq > 0 && eq < 80 && NAME.test(tok.slice(0, eq)) && tok.length - eq > 1 && !PLACEHOLDER.test(tok.slice(eq + 1))) return `a value assigned to ${tok.slice(0, eq)}`;
  if (tok.length >= 40 && /^[A-Za-z0-9+/=_-]+$/.test(tok) && /[A-Z]/.test(tok) && /[a-z]/.test(tok) && /\d/.test(tok)) return 'a long base64-like token';
  return null;
}

function segmentSecret(seg) {
  if (seg.length >= 40 && /^[A-Za-z0-9+_=~-]+$/.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg)) return 'a long mixed run';
  if (seg.length >= 24 && /^[0-9a-f]+$/i.test(seg) && /[a-f]/i.test(seg) && /\d/.test(seg)) return 'a long hex run';
  return null;
}

// Returns a short reason or null. Tokens are cut at spaces, quotes and brackets; URL parts and long runs are checked segment by segment.
function secretIn(text) {
  const t = fold(text);
  if (/-----BEGIN [A-Z ]{0,30}PRIVATE KEY/.test(t)) return 'a private key block';
  const tokens = t.split(/[\s"'`,;()[\]{}|]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const reason = tokenSecret(tok);
    if (reason) return reason;
    const named = /^(.{1,80}?)[=:]$/.exec(tok);
    if (named && NAME.test(named[1]) && tokens[i + 1] !== undefined && !PLACEHOLDER.test(tokens[i + 1])) return `a value after ${named[1]}`;
    if (NAME.test(tok) && /^(?:is|are|was|=|:)$/i.test(tokens[i + 1] || '') && /^(?=.*\d)(?=.*[A-Za-z])\S{8,}$/.test(tokens[i + 2] || '')) return `a value after ${tok} is`;
    for (const part of tok.split(/[?&#]/)) {
      const eq = part.indexOf('=');
      if (eq > 0 && PARAM.test(part.slice(0, eq)) && part.length - eq > 12 && !PLACEHOLDER.test(part.slice(eq + 1))) return 'a secret URL parameter';
    }
    for (const seg of tok.split(/[^A-Za-z0-9+_=~-]+/)) {
      const found = segmentSecret(seg);
      if (found) return found;
    }
  }
  return null;
}

const HARD = /\bhard(?![a-z])|\bhard(?:cap|limit|ceiling|stop|bound)|\bh[-_. *]{1,2}a[-_. *]{1,2}r[-_. *]{1,2}d\b/;
const ENFORCED = /\b(?:enforced|guaranteed) (?:limit|maximum|cap|ceiling|bound)\b|(?<!not )\benforced by azure\b/;
const UNRESOLVED = /to be (?:confirmed|determined|decided|agreed)|\btbc\b|\btbd\b|\btodo\b|\bfixme\b|\bxxx\b|\?{3}|confirm before use|command name to be|<fill in>/;

// The planning-bound phrase may carry the word "enforced"; everything else about enforcement is a claim the packet may not make.
const PHRASE = 'planning bound, not enforced by Azure';
function enforcementClaim(text) {
  const t = latin(fold(text)).toLowerCase().split(PHRASE.toLowerCase()).join(' ');
  return HARD.test(t) || ENFORCED.test(words(t));
}
const unresolved = (text) => UNRESOLVED.test(latin(fold(text)).toLowerCase()) || UNRESOLVED.test(words(text));

module.exports = { hasGuid, hasEmail, secretIn, enforcementClaim, unresolved, PHRASE };
