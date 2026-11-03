'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { root } = require('./proof.cjs');
const files = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() && entry.name !== 'evidence' ? files(path.join(directory, entry.name))
    : entry.isFile() && /\.(?:c?js)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
const checked = files(root);
for (const file of checked) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`${path.relative(root, file)}: ${result.stderr}`);
}
for (const file of ['model.js', 'lesson.js']) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
console.log(`Syntax passed for ${checked.length} owned JavaScript files, including both browser scripts.`);
