'use strict';

const fs = require('node:fs');
const path = require('node:path');
const authority = require('./u041-authority.cjs');

function seal(root, previousRoot) {
  const surfaceBytes = fs.readFileSync(path.join(root, authority.SURFACE));
  if (authority.sha(authority.normalize(surfaceBytes)) !== authority.SURFACE_SHA) throw new Error('the immutable accepted surface differs');
  const surface = JSON.parse(surfaceBytes);
  const names = fs.readdirSync(root).filter((name) => /^evidence-index-addendum-[1-9]\d*\.json$/.test(name));
  const chain = names.length ? authority.resolveAuthority(root) : {
    head: new Map(surface.files.map((entry) => [entry.path, entry])), count: 0, tip: null
  };
  const sequence = chain.count + 1;
  const target = path.join(root, `evidence-index-addendum-${sequence}.json`);
  if (fs.existsSync(target)) throw new Error('append-only: an existing amendment is never overwritten');
  const read = authority.reader(root);
  const previousRead = authority.reader(previousRoot);
  const amendments = [];
  const snapshots = [];
  for (const [relative, entry] of chain.head) {
    const bytes = read(relative);
    if (authority.agrees(bytes, entry)) continue;
    if (!authority.AMENDABLE.includes(relative)) throw new Error(`replacement is not allowed: ${relative}`);
    const prior = previousRead(relative);
    if (!authority.agrees(prior, entry)) throw new Error(`retained previous subject differs: ${relative}`);
    const previousSnapshot = `evidence\\u041\\original\\${sequence}__${relative.replace(/\\/g, '__')}.txt`;
    if (fs.existsSync(path.join(root, previousSnapshot))) throw new Error(`append-only snapshot already exists: ${previousSnapshot}`);
    snapshots.push([previousSnapshot, prior]);
    amendments.push({
      path: relative, previousRawSha256: authority.sha(prior), previousCrlfToLfSha256: authority.sha(authority.normalize(prior)),
      ...authority.digest(bytes), previousSnapshot
    });
  }
  const newFiles = [
    'U041.feature',
    ...authority.NEW_TESTS.filter((name) => fs.existsSync(path.join(root, 'tests', name))).map((name) => `tests\\${name}`),
    ...fs.readdirSync(path.join(root, 'evidence', 'u041'), { withFileTypes: true }).filter((entry) => entry.isFile())
      .map((entry) => `evidence\\u041\\${entry.name}`)
  ].filter((relative) => relative !== authority.SURFACE && !chain.head.has(relative));
  const additions = newFiles.map((relative) => {
    if (!authority.additionAllowed(relative)) throw new Error(`new path is not allowed: ${relative}`);
    return { path: relative, ...authority.digest(read(relative)) };
  });
  if (amendments.length + additions.length === 0) throw new Error('a no-op amendment is not allowed');
  const document = {
    schema: authority.SCHEMA, cardId: 'U009', item: 'U041', sequence,
    base: { path: authority.SURFACE, crlfToLfSha256: authority.SURFACE_SHA },
    previous: chain.tip, amendments, additions
  };
  for (const [relative, bytes] of snapshots) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), bytes, { flag: 'wx' });
  }
  fs.writeFileSync(target, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
  return { sequence, amendments: amendments.map((entry) => entry.path), additions: additions.map((entry) => entry.path), file: path.basename(target) };
}

if (require.main === module) {
  const previousRoot = process.argv[2];
  if (!previousRoot) throw new Error('Usage: node testing\\coverage\\tests\\u041-seal.cjs <retained-previous-namespace>');
  console.log(JSON.stringify(seal(path.resolve(__dirname, '..'), path.resolve(previousRoot)), null, 2));
}

module.exports = Object.freeze({ seal });
