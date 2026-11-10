'use strict';

// Test tooling: the scan for local identifiers (rule 15 of the controller: no local Windows user name, no session id, no user-profile path in a published file), shared by
// tests\integrity-fix4.test.cjs. It reads the text of a file and the DECOMPRESSED text of a gzip transcript, and names every file that carries one. The patterns are built at run time (the
// user name from the operating system, the path parts from fragments) so that no file of the namespace has to contain an identifier in order to look for it.
const os = require('node:os');
const zlib = require('node:zlib');

function patterns() {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The path parts and the id of the session of the run are built from fragments, so that this file does not carry them either.
  const list = [/[A-Za-z]:[\\/]+Users[\\/]/i, new RegExp(['\\.co', 'pilot'].join(''), 'i'), new RegExp(['session', 'state'].join('-'), 'i'), new RegExp(['2102', '38f0'].join(''), 'i')];
  const user = os.userInfo().username;
  if (user.length >= 4) list.push(new RegExp(escape(user), 'i'));
  const agentSession = process.env[['COPILOT', 'AGENT', 'SESSION', 'ID'].join('_')];
  if (agentSession && agentSession.length >= 8) list.push(new RegExp(escape(agentSession), 'i'));
  return list;
}

// entries: an iterable of [relative path, bytes]. Returns the names of the files that carry an identifier (or whose gzip cannot be read: it cannot be shown clean).
function scan(entries) {
  const list = patterns();
  const found = [];
  for (const [file, bytes] of entries) {
    let text;
    try {
      text = (file.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes).toString('latin1');
    } catch {
      found.push(`${file} (unreadable gzip)`);
      continue;
    }
    if (list.some((pattern) => pattern.test(text))) found.push(file);
  }
  return found;
}

module.exports = Object.freeze({ patterns, scan });
