'use strict';

// Test tooling (not production code): an INDEPENDENT builder of qualified.addendum.jsonl fixtures, so that the tests do not
// rely on addendum.cjs to build what addendum.cjs has to verify. The anchor of the first line is the SHA-256 of the sealed
// qualified.json with CRLF turned into LF (the repository stores LF and checks out CRLF on Windows).
const crypto = require('node:crypto');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const toLf = (bytes) => Buffer.from(Buffer.from(bytes).toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const anchorOf = (sealed) => sha(toLf(sealed));

const SEALED_CRLF = '{\r\n  "schemaVersion": 1,\r\n  "qualifiedMajors": [156],\r\n  "note": "sealed fixture"\r\n}\r\n';
const SEALED_LF = SEALED_CRLF.replace(/\r\n/g, '\n');
const KEYS = ['major', 'version', 'binarySha256', 'reportSha256', 'previous', 'atUtc'];

// The fields of an honest line for a major; every hash is derived from the major so that two majors never collide.
function fields(major, previous, extra = {}) {
  return {
    major,
    version: `${major}.0.4341.42`,
    binarySha256: sha(`binary-${major}`),
    reportSha256: sha(`report-${major}`),
    previous,
    atUtc: '2026-11-07T09:00:00.000Z',
    ...extra,
  };
}

const lineOf = (object) => JSON.stringify(object);

// chain(sealed, [157, 158]) or chain(sealed, [{ major: 157, version: '157.1.2.3' }]) -> { lines, text, head }
function chain(sealed, specs) {
  const lines = [];
  let previous = anchorOf(sealed);
  for (const spec of specs) {
    const { major, ...extra } = typeof spec === 'number' ? { major: spec } : spec;
    const line = lineOf(fields(major, previous, extra));
    lines.push(line);
    previous = sha(Buffer.from(line, 'utf8'));
  }
  return { lines, text: lines.length ? `${lines.join('\n')}\n` : '', head: previous };
}

module.exports = { sha, toLf, anchorOf, SEALED_CRLF, SEALED_LF, KEYS, fields, lineOf, chain };
