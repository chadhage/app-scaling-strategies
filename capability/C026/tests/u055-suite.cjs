'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write('U055 requires an enumerated test-file set.\n');
  process.exitCode = 2;
} else {
  const reporter = pathToFileURL(path.join(__dirname, 'u055-reporter.cjs')).href;
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `--test-reporter=${reporter}`, ...files], {
    env: { ...process.env }, windowsHide: true, timeout: 1800000, maxBuffer: 64 * 1024 * 1024
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exitCode = result.status ?? 2;
}
