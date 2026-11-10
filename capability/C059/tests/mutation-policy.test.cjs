'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { classify, counters } = require('./mutate-classify.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const reportFile = path.resolve(repository, process.env.C059_MUTATION_POLICY_REPORT ?? 'capability\\C059\\evidence\\raw\\mutgen-report-10.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = () => JSON.parse(fs.readFileSync(reportFile, 'utf8'));

test('D2/D3 every mutation decision preserves actual per-file TAP, counters and the named causal failure, not just an exit code', () => {
  const data = report();
  assert.ok(data.results.length > 0);
  for (const result of data.results) {
    assert.ok(Array.isArray(result.runs) && result.runs.length > 0, `${result.label}: actual file runs are retained`);
    const decisions = result.runs.map((run) => {
      const read = (stream) => {
        const entry = run.transcripts[stream];
        const gzip = fs.readFileSync(path.join(path.dirname(reportFile), entry.path));
        assert.equal(sha(gzip), entry.gzipSha256);
        const raw = zlib.gunzipSync(gzip);
        assert.equal(sha(raw), entry.sha256);
        assert.equal(raw.length, entry.bytes);
        return raw.toString('utf8');
      };
      const text = read('stdout') + read('stderr');
      const verdict = classify({ code: run.exitCode, text });
      assert.deepEqual(run.summary, counters(text));
      assert.equal(run.status, verdict.status);
      assert.deepEqual(run.named, verdict.named);
      return verdict;
    });
    if (result.killed) assert.ok(decisions.some((decision) => decision.status === 'killed' && decision.named.some((name) => result.failingTests.includes(name))), `${result.label}: a named causal assertion is in the recorded TAP`);
    if (result.status === 'survived') assert.ok(decisions.every((decision) => decision.status === 'survived'));
  }
});

test('D2 every completed mutant restores and records the exact pristine tree, including after a child crash', () => {
  const data = report();
  assert.ok(data.results.length > 0);
  for (const result of data.results) {
    assert.match(result.pristineDigest ?? '', /^[0-9a-f]{64}$/, result.label);
    assert.equal(result.restoredDigest, result.pristineDigest, result.label);
  }
});

test('D2 equivalent platform claims have actual passing runs of their current demonstration on the mutated tree', () => {
  const data = report();
  for (const result of data.results.filter((item) => item.status === 'survived' && item.proof === 'demonstrated')) {
    assert.ok(result.proofExecution?.status === 'survived', `${result.label}: runnable demonstration executed and passed`);
    assert.ok(result.proofExecution.tests > 0, `${result.label}: not an unloaded or empty file`);
    assert.ok(result.runs.some((run) => run.suite === result.proofExecution.suite && run.status === 'survived'));
  }
  assert.equal(data.equivalent.filter((item) => item.survived && item.proof === 'reasoning').length, 0, 'no reasoning-only equivalent is promoted to a demonstrated fact');
});

test('D3 the documented 900000 ms cap and no load-based proof are part of the actual campaign policy', () => {
  const data = report();
  assert.equal(data.testTimeoutMs, 900000);
  assert.equal(data.workers <= 2 && data.workers >= 1, true);
  assert.equal(data.undecided, 0);
});
