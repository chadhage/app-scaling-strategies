'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkPublisher } = require('..\\pins.cjs');
const boundary = checkPublisher();
const output = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(__dirname, 'publisher-boundary.ps1')], {
  timeout: 180000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
});
const observed = JSON.parse(output.toString('utf8'));
assert.equal(observed.count, 51);
assert.ok(observed.checks.every((check) => check.passed === true));
assert.equal(observed.actualGitWrites, 0);
assert.equal(observed.whitespaceUsedRealGitNoIndex, true);
const after = checkPublisher();
assert.equal(after.actualSha256, boundary.actualSha256);
console.log(JSON.stringify({ ...observed, currentPublisherBoundary: boundary }, null, 2));
