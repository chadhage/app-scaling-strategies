'use strict';

// Pure, strict parsing for the file version resource and for the qualified-majors data file.
const PART = '(0|[1-9]\\d{0,4})';
const VERSION = new RegExp(`^${PART}\\.${PART}\\.${PART}\\.${PART}$`);
const MAX_PART = 65535; // the four fields of a Windows file version are 16 bits each

function parseVersion(text) {
  if (typeof text !== 'string') return { ok: false, error: 'the version is not a string' };
  const match = VERSION.exec(text);
  if (!match) return { ok: false, error: 'not major.minor.build.patch of plain decimal numbers' };
  const [major, minor, build, patch] = match.slice(1).map(Number);
  if ([major, minor, build, patch].some((part) => part > MAX_PART)) {
    return { ok: false, error: 'a version part exceeds 65535' };
  }
  return { ok: true, major, minor, build, patch, text };
}

function validateQualifiedMajors(data) {
  const list = data !== null && typeof data === 'object' ? data.qualifiedMajors : undefined;
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, error: 'qualifiedMajors must be a non-empty array' };
  }
  if (!list.every((major) => Number.isInteger(major) && major >= 1 && major <= MAX_PART)) {
    return { ok: false, error: 'every qualified major must be an integer from 1 to 65535 (no strings, no wildcard)' };
  }
  if (new Set(list).size !== list.length) return { ok: false, error: 'qualifiedMajors has a duplicate' };
  return { ok: true, majors: [...list] };
}

module.exports = { parseVersion, validateQualifiedMajors };
