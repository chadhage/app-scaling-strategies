'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tree = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? tree(path.join(dir, entry.name))
    : [[path.relative(root, path.join(dir, entry.name)), sha(fs.readFileSync(path.join(dir, entry.name)))]])
  .sort(([a], [b]) => a.localeCompare(b));
const before = tree(root);
const projectedFiles = fs.readdirSync(root).filter((file) => fs.statSync(path.join(root, file)).isFile())
  .map((file) => {
    const raw = fs.readFileSync(path.join(root, file));
    const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    return { file, rawSha256: sha(raw), lfSha256: sha(lf), rawBytes: raw.length, lfBytes: lf.length };
  });
const script = `
  'use strict';
  const fs = require('node:fs');
  const path = require('node:path');
  const Module = require('node:module');
  const root = process.argv[1];
  const read = fs.readFileSync;
  // Only executable/document source is projected; historical evidence bytes stay raw.
  fs.readFileSync = function(file, options) {
    const data = read.apply(fs, arguments);
    if(typeof file !== 'string') return data;
    const relative = path.relative(root, file);
    if(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)
        || relative === 'evidence' || relative.startsWith('evidence' + path.sep)) return data;
    return typeof data === 'string' ? data.replace(/\\r\\n/g, '\\n')
      : Buffer.from(data.toString('utf8').replace(/\\r\\n/g, '\\n'));
  };
  function load(file) {
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = Module._nodeModulePaths(path.dirname(file));
    require.cache[file] = loaded;
    loaded._compile(fs.readFileSync(file, 'utf8'), file);
    loaded.loaded = true;
  }
  load(path.join(root, 'model.js'));
  load(path.join(root, 'tests', 'model.test.cjs'));
  load(path.join(root, 'tests', 'integrity.test.cjs'));
`;
const child = spawnSync(process.execPath, ['-e', script, root], {
  cwd: path.resolve(root, '..', '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
assert.deepEqual(tree(root), before, 'LF qualification is in memory only and must not rewrite source or raw proofs.');
if (child.status !== 0 || child.error) {
  throw child.error || new Error(`LF-projected focused tests failed (${child.status}).`);
}
console.log(JSON.stringify({
  mode: 'Explicit in-memory LF source qualification; raw provenance is unchanged',
  runtime: process.version, readOnly: true, ownedFilesUnchanged: true,
  focusedTests: Number(child.stdout.match(/# tests (\d+)/)[1]),
  pass: Number(child.stdout.match(/# pass (\d+)/)[1]),
  fail: Number(child.stdout.match(/# fail (\d+)/)[1]),
  projectedFiles,
  qualification: 'This is not a raw-byte hash substitution, a native result or source-parent validation. Canonical Git blob equality is checked separately after scoped publication.',
}, null, 2));
