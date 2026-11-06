'use strict';

// Test tooling, not production code (review N5, self-review line 9): a real session must be closed in a finally block EVEN WHEN A CHECK FAILS. This script runs
// tests\browser.cjs as a child with C059_BROWSER_INJECT_FAILURE=1, which fails an assertion right after the real headless Edge session was opened, and asserts that
// the child exited 1 with the injected message, that its finally block closed the session (the page reports itself closed) and that it printed no result.
// Run it in the same heavy-run slot as tests\browser.cjs: node capability\C059\tests\browser-cleanup.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const env = { ...process.env, C059_BROWSER_INJECT_FAILURE: '1' };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
const run = spawnSync(process.execPath, [path.join(__dirname, 'browser.cjs')], { env, encoding: 'utf8', windowsHide: true, timeout: 600000 });
assert.equal(run.status, 1, `the injected failure must fail the run: exit ${run.status} ${run.stderr}`);
assert.match(run.stderr, /injected failure: the real session must still be closed in finally/, 'the failure is the injected one');
assert.match(run.stdout, /^PASS the installed Edge is Microsoft-signed and within the qualified major/m, 'a real Edge was qualified before the failure');
assert.match(run.stdout, /\{"cleanup":\{"sessionClosed":true,"pageClosed":true\}\}/, 'the finally block closed the real session after the failure');
assert.doesNotMatch(run.stdout, /"result":"ok"/, 'a failed run prints no result');
console.log(JSON.stringify({ result: 'ok', injected: true, exit: run.status, cleanup: 'the real session was closed in finally after an injected failure' }));
