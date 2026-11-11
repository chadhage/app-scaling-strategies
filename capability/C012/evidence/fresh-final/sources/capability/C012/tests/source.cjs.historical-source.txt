'use strict';
const fs = require('node:fs'), path = require('node:path');
const { sha, lf } = require('./integrity.cjs');
function list(directory, prefix = '') {
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!prefix && entry.name === 'evidence') continue;
    const file = path.join(directory, entry.name), relative = path.join(prefix, entry.name);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('SOURCE_ALIAS_REFUSED:' + relative);
    if (entry.isDirectory()) rows.push(...list(file, relative));
    else {
      const bytes = fs.readFileSync(file);
      rows.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), lfSha256: sha(lf(bytes)) });
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
function physical(directory) {
  const stat = fs.lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory)) throw new Error('Physical directory only');
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs), platform: process.platform };
}
function copyTree(from, to) {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) throw new Error('COPY_ALIAS_REFUSED');
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: false });
    for (const entry of fs.readdirSync(from)) copyTree(path.join(from, entry), path.join(to, entry));
  } else fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
}
module.exports = { list, physical, copyTree };
