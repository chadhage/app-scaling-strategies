'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stage = process.argv[2];
if (!['red', 'green', 'syntax'].includes(stage)) throw new Error('Choose an explicit red, green or syntax capture.');
const directory = path.join(root, 'evidence', stage);
if (stage === 'red' && fs.existsSync(path.join(directory, 'run.json'))) {
  throw new Error('Original RED proof is immutable; replay its snapshot through the integrity test instead.');
}
fs.mkdirSync(directory, { recursive: true });
const files = stage === 'red'
  ? ['model.js', 'tests\\model.test.cjs', 'event-schema.feature'] : [];
const snapshots = files.map((relative) => {
  const bytes = fs.readFileSync(path.join(root, relative));
  const filename = `${path.basename(relative)}.snapshot`;
  fs.writeFileSync(path.join(directory, filename), bytes);
  return { source: relative, snapshot: filename, sha256: sha(bytes) };
});
const argumentsList = stage === 'red'
  ? ['--test', '--test-name-pattern=complete compatible overlap', 'learning\\S056\\tests\\model.test.cjs']
  : stage === 'green'
    ? ['--test', 'learning\\S056\\tests\\model.test.cjs', 'learning\\S056\\tests\\surface.test.cjs',
      'learning\\S056\\tests\\integrity.test.cjs']
    : ['--test', '--test-name-pattern=syntax', 'learning\\S056\\tests\\surface.test.cjs'];
const startedAtUtc = new Date().toISOString();
const result = spawnSync(process.execPath, argumentsList, { cwd: repo, encoding: null, timeout: 120000 });
if (result.error) throw result.error;
fs.writeFileSync(path.join(directory, 'stdout.tap'), result.stdout);
fs.writeFileSync(path.join(directory, 'stderr.tap'), result.stderr);
const record = {
  cardId: 'A-S056', stage, executionMode: 'synthetic', startedAtUtc,
  completedAtUtc: new Date().toISOString(), node: process.version,
  command: [process.execPath, ...argumentsList], exitCode: result.status, signal: result.signal,
  stdoutSha256: sha(result.stdout), stderrSha256: sha(result.stderr), snapshots,
  meaning: stage === 'red'
    ? 'Loadable stub returns unknown/blocked; an actual strict boolean assertion expected compatible introduction true but observed false.'
    : 'Focused local tooling evidence, not Node 24, native broker/protocol or source-parent certification.',
};
fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
const expected = stage === 'red' ? 1 : 0;
if (result.status !== expected) throw new Error(`Expected ${stage} exit ${expected}, observed ${result.status}.`);
if (stage === 'red' && (!result.stdout.includes(Buffer.from('ERR_ASSERTION'))
    || !result.stdout.includes(Buffer.from('actual: false')))) {
  throw new Error('RED must be the intended real assertion failure.');
}
