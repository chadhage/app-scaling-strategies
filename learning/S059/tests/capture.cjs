'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const stage = process.argv[2];
const commandStage = typeof stage === 'string' ? stage.replace(/-\d{3}$/, '') : '';
const commands = {
  red: ['--test', '--test-name-pattern=compatible shared configuration', 'learning\\S059\\tests\\model.test.cjs'],
  green: ['--test', 'learning\\S059\\tests\\model.test.cjs', 'learning\\S059\\tests\\surface.test.cjs'],
  browser: ['--test', 'learning\\S059\\tests\\browser.test.cjs'],
  integrity: ['--test', 'learning\\S059\\tests\\integrity.test.cjs'],
  syntax: ['learning\\S059\\tests\\syntax.cjs'],
};
if (!/^(red|green|browser|integrity|syntax)(-\d{3})?$/.test(stage || '')) {
  throw new Error('Choose an explicit red, green, browser, syntax or integrity capture');
}
if (commandStage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Browser proof capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1');
}
const destination = path.join(lesson, 'evidence', 'raw', stage);
if (fs.existsSync(destination)) throw new Error('Existing raw provenance is immutable; do not overwrite a run');
fs.mkdirSync(destination, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const startedAtUtc = new Date().toISOString();
const result = spawnSync(process.execPath, commands[commandStage], {
  cwd: root, env: process.env, encoding: null, timeout: 180000, windowsHide: true,
});
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(destination, 'stdout.txt'), stdout);
fs.writeFileSync(path.join(destination, 'stderr.txt'), stderr);
fs.writeFileSync(path.join(destination, 'run.json'), JSON.stringify({
  stage, commandStage, argv: [process.execPath, ...commands[commandStage]], cwd: root,
  startedAtUtc, finishedAtUtc: new Date().toISOString(),
  exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
  node: process.version, stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
}, null, 2) + '\n');
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = result.status === null ? 1 : result.status;
