'use strict';

// Execute the unchanged shared recorder with an explicit private repository-root adapter.
// Logical commands and input names remain portable; only its disk root and child cwd are mapped.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const shared = process.env.C014_SHARED_RECORDER;
if (!shared) throw new Error('C014_SHARED_RECORDER must name the existing shared recorder');
const source = fs.readFileSync(shared, 'utf8');
const declaration = /^const repo = ('(?:\\.|[^'])*');$/m.exec(source);
if (!declaration) throw new Error('shared recorder root declaration is not recognized');
const originalRoot = vm.runInNewContext(declaration[1]);
const [name, expected, ...rest] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name) || !/^[01]$/.test(expected) || rest[0] !== '--') throw new Error('name expectedExit -- nodeArguments');
const directory = path.join(ROOT, 'evidence', 'final-20261110', name);
fs.mkdirSync(directory, { recursive: true });
const files = [
  ...fs.readdirSync(ROOT).filter((entry) => /\.(cjs|js|html|css|feature)$/.test(entry) || entry === 'imports.json').map((entry) => path.join('capability', 'C014', entry)),
  ...fs.readdirSync(__dirname).filter((entry) => /\.(cjs|json)$/.test(entry)).map((entry) => path.join('capability', 'C014', 'tests', entry)),
  ...Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json'))).imports)
].sort();
const spec = { name, purpose: `C014 private continuation: ${name}; unchanged shared recorder with explicit private root adapter`,
  args: ['capability\\C014\\tests\\sanitized-run.cjs', '--', ...rest.slice(1)], inputs: files,
  outDir: path.relative(REPOSITORY, directory), expectedExitCode: Number(expected), timeoutMs: 10800000 };
const specPath = path.join(directory, 'invocation.json');
fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'recorder-authority.json'), `${JSON.stringify({
  schema: 'C014-private-recorder-adapter/1',
  sharedSourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  adapterSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  mapping: 'The shared recorder repository root maps to this private candidate; child cwd maps identically. Source and transcript bytes are not rewritten.'
}, null, 2)}\n`, { flag: 'wx' });
const originalArgv = process.argv;
process.argv = [process.execPath, '<SHARED-RECORDER>', specPath];
const sharedRequire = createRequire(shared);
const mappedRequire = (id) => {
  if (id === 'node:path') return { ...path, join: (first, ...parts) => path.join(first === originalRoot ? REPOSITORY : first, ...parts) };
  if (id === 'node:child_process') return { ...childProcess, spawnSync: (exe, args, options) => {
    if (options.cwd !== originalRoot) throw new Error('unexpected recorder child cwd');
    return childProcess.spawnSync(exe, args, { ...options, cwd: REPOSITORY });
  } };
  return sharedRequire(id);
};
try {
  vm.runInThisContext(`(function(require) {\n${source}\n})`, { filename: '<UNCHANGED-SHARED-RECORDER>' })(mappedRequire);
} finally { process.argv = originalArgv; }
