'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
  .filter((file) => /\.(?:js|cjs)$/.test(file));
const checks = files(root).sort().map((file) => {
  const result = spawnSync(process.execPath, ['--check', file], { timeout: 15000, encoding: 'utf8' });
  return {
    file: path.relative(root, file), status: result.status, stdout: result.stdout || '',
    stderr: result.stderr || '', error: result.error ? String(result.error) : null,
  };
});
console.log(JSON.stringify({ runtime: process.version, readOnly: true, checks }, null, 2));
if (checks.some((check) => check.status !== 0 || check.error)) process.exitCode = 1;
