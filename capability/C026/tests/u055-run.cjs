'use strict';

const path = require('node:path');
const { run } = require('node:test');
const reporter = require('./u055-reporter.cjs');

delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const runner = run({ files: [path.join(__dirname, 'u055-behavior.test.cjs')], concurrency: 1 });
runner.on('test:fail', () => { process.exitCode = 1; });
runner.compose(reporter).pipe(process.stdout);
