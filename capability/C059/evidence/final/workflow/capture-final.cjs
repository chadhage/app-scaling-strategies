'use strict';

// The shared recorder is invoked unchanged. A separate append-only transport
// amendment maps its physical private inputs to their portable logical paths.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const root = __dirname;
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const actualRepo = process.env.C059_ACTUAL_REPO;
const recorder = process.env.C059_RECORDER;
const neutral = process.env.C059_NEUTRAL_ROOT;
if (!actualRepo || !recorder || !neutral) throw new Error('explicit existing recorder and owned roots are required');
if (!/^[A-Za-z0-9._-]+$/.test(spec.name)) throw new Error('plain new capture name required');
const actualRoot = fs.realpathSync(root);
const prefix = path.relative(actualRepo, actualRoot);
if (path.isAbsolute(prefix) || prefix.startsWith('..') || !prefix.includes('C059-final-20261110')) throw new Error('not the owned candidate');
const output = path.join(root, 'capability', 'C059', 'evidence', 'raw');
const originalDirectory = path.join(root, 'capability', 'C059', 'evidence', 'transport-final');
fs.mkdirSync(originalDirectory, { recursive: true });
fs.mkdirSync(path.join(root, 'capture-specs'), { recursive: true });
fs.mkdirSync(path.join(root, 'capture-originals'), { recursive: true });
const target = path.join(output, `${spec.name}.json`);
const originalTarget = path.join(originalDirectory, `${spec.name}.json`);
if (fs.existsSync(target) || fs.existsSync(originalTarget)) throw new Error('immutable capture name already exists');
for (const input of spec.inputs) {
  if (path.isAbsolute(input) || input.split(/[\\/]/).includes('..')) throw new Error(`nonlogical input: ${input}`);
}
const originalRelativeDirectory = path.join(prefix, 'capture-originals', spec.name);
const inputRoot = spec.inputRoot ?? '';
if (path.isAbsolute(inputRoot) || inputRoot.split(/[\\/]/).includes('..')) throw new Error('plain owned input root required');
const inputPrefix = path.join(prefix, inputRoot);
const sharedSpec = {
  ...spec,
  args: [path.join(neutral, 'capture-command.cjs'), JSON.stringify(spec.args)],
  inputs: spec.inputs.map((input) => path.join(inputPrefix, input)),
  outDir: originalRelativeDirectory,
};
const specPath = path.join(root, 'capture-specs', `${spec.name}.json`);
fs.writeFileSync(specPath, `${JSON.stringify(sharedSpec, null, 2)}\n`, { flag: 'wx' });
const run = spawnSync(process.execPath, [recorder, specPath], {
  cwd: actualRepo, env: process.env, encoding: 'utf8', windowsHide: true,
  timeout: (spec.timeoutMs ?? 1800000) + 60000, maxBuffer: 8 * 1024 * 1024,
});
if (run.error) throw run.error;
const originalPath = path.join(actualRepo, originalRelativeDirectory, `${spec.name}.json`);
if (!fs.existsSync(originalPath)) throw new Error(`shared recorder failed: ${run.stderr}`);
const originalBytes = fs.readFileSync(originalPath);
const original = JSON.parse(originalBytes);
fs.writeFileSync(originalTarget, originalBytes, { flag: 'wx' });
fs.mkdirSync(path.join(output, 'raw'), { recursive: true });
fs.mkdirSync(path.join(originalDirectory, 'raw'), { recursive: true });
for (const entry of Object.values(original.transcripts)) {
  const bytes = fs.readFileSync(path.join(path.dirname(originalPath), entry.path));
  if (sha(bytes) !== entry.gzipSha256) throw new Error('shared transcript changed during transport');
  fs.writeFileSync(path.join(output, entry.path), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(originalDirectory, entry.path), bytes, { flag: 'wx' });
}
const logical = {
  ...original,
  inputs: original.inputs.map((input, index) => {
    if (input.path !== path.join(inputPrefix, spec.inputs[index])) throw new Error('unexpected recorder input mapping');
    return { ...input, path: spec.inputs[index] };
  }),
  privateCaptureTransport: {
    schema: 'C059-private-capture-transport/1',
    original: path.join('..', 'transport-final', `${spec.name}.json`),
    originalSha256: sha(originalBytes),
    prefix: inputPrefix,
    producerTextForms: spec.producerTextForms === true,
    executedCwd: 'owned private candidate',
    logicalCommand: ['node.exe', ...spec.args],
    note: 'Shared recorder unchanged; only input path prefixes are mapped. Observations and raw transcript bytes are unchanged.',
  },
};
fs.writeFileSync(target, `${JSON.stringify(logical, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
console.log(JSON.stringify({ transported: spec.name, originalSha256: sha(originalBytes), logicalManifestSha256: sha(fs.readFileSync(target)) }));
process.exitCode = run.status ?? 1;
