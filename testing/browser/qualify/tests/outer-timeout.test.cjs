'use strict';

// N2 of the second review: mutant M10 (the outer bound of every adapter call never fires) was killed only by the mutation
// harness's external timeout, because a test that waits for a never-answering adapter hangs forever. Here every adapter call that
// can hang is run in a CHILD process with a hard external limit, all children at once, so a missing bound fails an assertion that
// names the adapter within one limit instead of hanging the file.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const CHILD = path.join(__dirname, 'fixtures', 'never-answers.cjs');
const HARD_LIMIT_MS = 15000;

const CASES = [
  ['now', true, []],
  ['readQualified', false, ['QUALIFIED_MAJORS_INVALID']],
  ['candidates', false, ['EDGE_NOT_FOUND']],
  ['statFile', false, ['EDGE_NOT_FOUND']],
  ['sha256', false, ['SHA256_TIMEOUT']],
  ['signature', false, ['SIGNATURE_TIMEOUT']],
  ['fileVersion', false, ['VERSION_TIMEOUT']],
  ['sha256#2', false, ['SHA256_TIMEOUT']],
  ['statFile#2', false, ['EDGE_CHANGED_DURING_CHECK']],
];

const start = (target) => new Promise((resolve) => {
  execFile(process.execPath, [CHILD, target], { encoding: 'utf8', timeout: HARD_LIMIT_MS, windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
});
const RUNS = new Map(CASES.map(([target]) => [target, start(target)]));

for (const [target, ok, codes] of CASES) {
  test(`OUTER BOUND: an adapter that never answers (${target}) ends the check within its bound and fails closed`, async () => {
    const result = await RUNS.get(target);
    assert.equal(result.error, null, `${target}: the outer bound of 300 ms never fired (no answer within ${HARD_LIMIT_MS} ms): ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), { ok, reasonCodes: codes });
  });
}
