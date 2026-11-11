'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const target = 'evidence/current/pins.json';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function list(directory = root, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('REPARSE_POINT');
    const relative = prefix + entry.name;
    return entry.isDirectory() ? list(path.join(directory, entry.name), relative + '/') : [relative];
  });
}
function pin(file) {
  const bytes = fs.readFileSync(path.join(root, ...file.split('/')));
  const acceptedSha256 = [sha(bytes)];
  if (!file.startsWith('evidence/') && /\.(?:cjs|js|json|html|css|md|feature)$/.test(file)) {
    const lf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    acceptedSha256.push(sha(lf), sha(Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))));
  }
  return { path: file, bytes: bytes.length, sha256: sha(bytes), acceptedSha256: [...new Set(acceptedSha256)] };
}
module.exports = { list, pin, sha, root, target };
if (require.main === module) {
  if (fs.existsSync(path.join(root, target))) throw new Error('The one final seal already exists; it is immutable');
  const rows = list().filter((file) => file !== target).map(pin);
  fs.mkdirSync(path.join(root, 'evidence', 'current'), { recursive: true });
  fs.writeFileSync(path.join(root, target), JSON.stringify({
    schema: 'U068-U069-current-seal/1', policy: 'Exact raw, LF or CRLF source representations; all historical evidence remains immutable; no threshold or production exclusions',
    files: rows
  }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ sealed: rows.length, pinFile: target }));
}
