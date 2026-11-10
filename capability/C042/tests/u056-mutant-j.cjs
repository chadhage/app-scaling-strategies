'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('./u039-lib.cjs');

const title = 'mutant J: dropping a request releases its lane entry before the event-loop barrier';
const repository = path.resolve(__dirname, '..', '..', '..');
const file = path.join('capability', 'C042', 'evidence', 'u056-residuals', 'mutant-J-drop-does-not-release.cjs.txt');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');
const find = '      release();\n      return undefined;';
assert.equal(source.split(find).length - 1, 1, 'J must replace exactly one dropped-request release, regardless of checkout line endings');
const mutant = Buffer.from(source.replace(find, '      return undefined;'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
if (fs.existsSync(file)) assert.deepEqual(fs.readFileSync(file), mutant, 'the archived mutant is immutable');
else fs.writeFileSync(file, mutant, { flag: 'wx' });
if (process.argv.includes('--prepare')) {
  console.log(JSON.stringify({ kind: 'mutant-J-prepared', file, sha256: sha(mutant), replacements: 1 }));
} else {
  const run = (subject) => {
    const args = ['--test', '--test-concurrency=1', path.join('capability', 'C042', 'tests', 'u056-lane.test.cjs')];
    const result = spawnSync(process.execPath, args, { cwd: repository, env: lib.childEnv({ U039_SUBJECT: subject }), encoding: 'utf8', windowsHide: true, timeout: 60000 });
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    assert.equal(result.error, undefined, 'a timeout or environment failure is not a kill');
    assert.equal(result.signal, null, 'a signal is not a kill');
    return result;
  };
  const control = run('real');
  assert.equal(control.status, 0);
  assert.match(control.stdout, /^# pass 1$/m);
  const changed = run(`file:${file}`);
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, new RegExp(`^not ok 1 - ${title}$`, 'm'));
  assert.equal((changed.stdout.match(/code: 'ERR_ASSERTION'/g) ?? []).length, 1);
  assert.match(changed.stdout, /all four handlers settled after the response-close microtasks/);
  assert.doesNotMatch(changed.stdout, /testTimeoutFailure|timed out|TypeError|ReferenceError|SyntaxError|Cannot find module/);
  console.log(JSON.stringify({ kind: 'mutant-J-outcome', replacements: 1, sourceLfSha256: sha(Buffer.from(source)), mutantSha256: sha(mutant),
    control: { exitCode: 0, pass: 1 }, mutant: { exitCode: 1, fail: 1, assertionFailures: 1, namedTest: title },
    verdict: 'KILLED_BY_NAMED_ASSERTION', timeoutAsKill: false, barrier: 'first response close, then the next setImmediate; promise microtasks settle before that barrier' }));
}
