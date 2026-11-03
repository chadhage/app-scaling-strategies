'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const files = ['model.js', 'app.js', ...fs.readdirSync(__dirname)
  .filter((file) => /\.(?:js|cjs)$/.test(file)).sort().map((file) => path.join('tests', file))];
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: lesson, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    failed += 1;
    process.stderr.write(`${file}: ${result.error ? result.error.message : result.stderr}\n`);
  }
}
console.log(`Syntax: ${files.length - failed}/${files.length} JavaScript/CommonJS files passed; read-only.`);
process.exitCode = failed ? 1 : 0;
