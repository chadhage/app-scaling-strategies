'use strict';

// Pin check of imports.json, shared by imports.test.cjs and pins-form.test.cjs. A pinned file of ANOTHER namespace exists in two forms (L-0188): the
// raw bytes of the owner tree (CRLF, core.autocrlf=true) and the LF bytes of a fresh checkout or `git archive`. Both are accepted; a changed byte never is.
const { createHash } = require('node:crypto');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const crlf = (bytes) => Buffer.from(lf(bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1');

// `read(path)` gives the working bytes of a pinned file, `blob(entry)` the accepted git blob; both are injectable so a tampered pin or file is tested in memory.
function problems(document, read, blob) {
  const found = [];
  for (const entry of document.dependencies) {
    const bytes = read(entry.path);
    const text = lf(bytes);
    const forms = [entry.rawSha256, entry.crlfToLfSha256];
    if (!forms.includes(sha(bytes))) found.push(`${entry.path}: bytes differ from the pin (neither the raw nor the LF-normalized form)`);
    if (sha(text) !== entry.crlfToLfSha256) found.push(`${entry.path}: LF form differs from the pin`);
    if (![sha(text), sha(crlf(text))].includes(entry.rawSha256)) found.push(`${entry.path}: the raw pin is neither the LF nor the CRLF form of these bytes`);
    const accepted = sha(blob(entry));
    if (accepted !== entry.acceptedGitSha256) found.push(`${entry.path}: pin does not match the accepted git blob`);
    if (!forms.includes(accepted)) found.push(`${entry.path}: bytes agree with neither the blob nor its LF form`);
  }
  for (const entry of document.own) if (sha(read(entry.path)) !== entry.rawSha256) found.push(`${entry.path}: own pin differs`);
  return found;
}

module.exports = Object.freeze({ sha, lf, crlf, problems });
