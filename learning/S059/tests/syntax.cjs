'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const files = [
  'model.js', 'lesson.js', ...fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs')).map((file) => path.join('tests', file)),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(lesson, file)], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Syntax check failed: ${file}\n`);
    process.exitCode = 1;
    break;
  }
  console.log(`Syntax OK: ${file}`);
}
