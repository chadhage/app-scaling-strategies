'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hash, tree } = require('./proof.cjs');
const root = path.resolve(__dirname, '..');
const before = tree(root);
const files = before.map(([file]) => file).filter((file) => !file.startsWith(`evidence${path.sep}`));
const projectedFiles = files.map((file) => {
  const raw = fs.readFileSync(path.join(root, file));
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
  return { file, rawSha256: hash(raw), lfSha256: hash(lf), rawBytes: raw.length, lfBytes: lf.length };
});
const script = `
  const fs = require('node:fs');
  const path = require('node:path');
  const Module = require('node:module');
  const root = process.argv[1];
  const original = fs.readFileSync;
  fs.readFileSync = function(file) {
    const bytes = original.apply(fs, arguments);
    if (typeof file !== 'string') return bytes;
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)
        || relative === 'evidence' || relative.startsWith('evidence' + path.sep)) return bytes;
    return typeof bytes === 'string' ? bytes.replace(/\\r\\n/g, '\\n')
      : Buffer.from(bytes.toString('utf8').replace(/\\r\\n/g, '\\n'));
  };
  function load(relative) {
    const file = path.join(root, relative);
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = Module._nodeModulePaths(path.dirname(file));
    require.cache[file] = loaded;
    loaded._compile(fs.readFileSync(file, 'utf8'), file);
    loaded.loaded = true;
  }
  load('model.js');
  load(path.join('tests', 'model.test.cjs'));
  load(path.join('tests', 'integrity.test.cjs'));
`;
const child = spawnSync(process.execPath, ['-e', script, root], {
  cwd: path.resolve(root, '..', '..'), timeout: 90000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
assert.deepEqual(tree(root), before, 'Canonical LF qualification must not rewrite source or historical raw evidence.');
if (child.status !== 0 || child.error) throw child.error || new Error(`LF-projected focused tests failed (${child.status}).`);
console.log(JSON.stringify({
  mode: 'In-memory LF source projection, not historical raw-byte substitution',
  runtime: process.version, readOnly: true, ownedFilesUnchanged: true, projectedFiles,
  qualification: 'Canonical Git blobs are checked separately after publication; no native/source-parent/production Node 24 proof.',
}, null, 2));
