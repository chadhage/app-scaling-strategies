'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
for (const name of ['schedule.js', 'lesson.js', 'schedule.test.cjs', 'invariants.test.cjs',
  'integrity.test.cjs', 'browser.test.cjs', 'tools\\capture.cjs', 'tools\\syntax.cjs']) {
  const result = spawnSync(process.execPath, ['--check', path.resolve(__dirname, '..', name)],
    { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.exitCode = 1;
  } else console.log(`Syntax OK: ${name}`);
}
