'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const redRoot = path.join(root, 'evidence', 'red');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const runs = fs.readdirSync(redRoot).filter((name) => /^run-\d+$/.test(name)).sort();

test('the retained RED runs are intact, behavioral failures, and the naive stubs they ran against are unchanged', () => {
  assert.ok(runs.length >= 3, 'three RED runs are retained: core, cli, findings');
  for (const run of runs) {
    const directory = path.join(redRoot, run);
    const record = JSON.parse(fs.readFileSync(path.join(directory, 'record.json'), 'utf8'));
    assert.equal(record.exitCode, 1, run);
    assert.ok(record.assertionErrors > 0, `${run} fails by assertion, not by a missing module`);
    for (const stream of ['stdout', 'stderr']) {
      const raw = gunzipSync(fs.readFileSync(path.join(directory, `${stream}.gz`)));
      assert.equal(hash(raw), record[`${stream}Sha256`], `${run} ${stream}`);
    }
    const stdout = gunzipSync(fs.readFileSync(path.join(directory, 'stdout.gz'))).toString('utf8');
    assert.match(stdout, /code: 'ERR_ASSERTION'/);
    assert.doesNotMatch(stdout, /Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND/);
    for (const entry of record.sourceHashes.filter((item) => item.path.includes(`${path.sep}red${path.sep}stub${path.sep}`))) {
      assert.equal(hash(fs.readFileSync(path.join(repository, entry.path))), entry.sha256, `${run} stub ${entry.path}`);
    }
  }
});

test('the first RED ran the core suites against the naive stubs and the later runs name their own subject', () => {
  const records = Object.fromEntries(runs.map((run) => [run, JSON.parse(fs.readFileSync(path.join(redRoot, run, 'record.json'), 'utf8'))]));
  assert.match(records['run-01'].subjectOverride, /evidence\\red\\stub$/);
  assert.match(records['run-02'].subjectOverride, /evidence\\red\\stub$/);
  assert.equal(records['run-03'].subjectOverride, null, 'run-03 is a finding against the then-current production code');
  for (const record of Object.values(records)) assert.deepEqual(record.command.slice(0, 2), ['node', '--test']);
});
