'use strict';

// K-C004: the archived RED is intact and says what the card claims, read only from the archive itself:
// both files failed the 85% branch bar under the existing tests, and the transcripts match their recorded digests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const directory = path.resolve(__dirname, '..', 'evidence', 'k-c004-branch-coverage');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256Pattern = /^[a-f0-9]{64}$/;

function readTranscript(record, stream) {
  const entry = record.transcripts[stream];
  const compressed = fs.readFileSync(path.join(directory, ...entry.path.split('\\')));
  assert.equal(compressed.length, entry.gzipBytes);
  assert.equal(sha256(compressed), entry.gzipSha256);
  const raw = gunzipSync(compressed);
  assert.equal(raw.length, entry.bytes);
  assert.equal(sha256(raw), entry.sha256);
  return raw.toString('utf8');
}

for (const [name, file, branchPercent, uncoveredLines] of [
  ['red-01-plan-fixtures', 'plan-fixtures.js', '70.00', '6-7'],
  ['red-02-plan-provenance', 'plan-provenance.js', '83.33', '4']
]) {
  test(`archived RED ${name}: the L-0004 command exited 1 because ${file} was below the branch bar`, () => {
    const record = JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
    assert.equal(record.name, name);
    assert.equal(record.exitCode, 1);
    assert.equal(record.expectedExitCode, 1);
    assert.equal(record.signal, null);
    assert.equal(record.spawnError, null);
    assert.deepEqual(record.environmentRemoved, ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']);
    assert.ok(record.command.includes(`--test-coverage-include=capability/C004/${file}`));
    for (const kind of ['lines', 'branches', 'functions']) assert.ok(record.command.includes(`--test-coverage-${kind}=85`));
    assert.ok(record.command.includes('capability\\C004\\tests\\plan.test.cjs'));
    assert.ok(record.command.includes('capability\\C004\\tests\\integrity.test.cjs'));
    assert.ok(!record.command.some(argument => argument.includes('k-c004')), 'the RED ran the existing tests only');

    assert.ok(record.inputs.length >= 4);
    for (const input of record.inputs) {
      assert.ok(input.bytes > 0, input.path);
      assert.match(input.rawSha256, sha256Pattern, input.path);
      assert.match(input.crlfToLfSha256, sha256Pattern, input.path);
    }

    const stdout = readTranscript(record, 'stdout');
    assert.equal(readTranscript(record, 'stderr'), '');
    assert.match(stdout, new RegExp(`${branchPercent.replace('.', '\\.')}% branch coverage does not meet threshold of 85%`));
    assert.doesNotMatch(stdout, /% (line|function) coverage does not meet threshold/);
    assert.match(stdout, /^# fail 0$/m, 'the existing tests themselves all passed');
    const row = stdout.split(/\r?\n/).find(line => line.includes(` ${file} |`));
    assert.ok(row, `coverage row for ${file}`);
    const cells = row.replace(/^#\s+/, '').split('|').map(cell => cell.trim());
    assert.deepEqual(cells.slice(0, 1), [file]);
    assert.equal(cells[2], branchPercent);
    assert.equal(cells[4], uncoveredLines);
    assert.ok(Number(cells[1]) >= 85, 'lines were already at the bar');
    assert.ok(Number(cells[3]) >= 85, 'functions were already at the bar');
    assert.ok(Number(cells[2]) < 85, 'branches were below the bar');
    assert.deepEqual(record.summary.coverage[0], {
      file, lines: Number(cells[1]), branches: Number(cells[2]), functions: Number(cells[3]), uncoveredLines
    });
  });
}

test('the baseline of the other measurable production file is archived and was already above the bar', () => {
  const record = JSON.parse(fs.readFileSync(path.join(directory, 'baseline-03-plan-model.json'), 'utf8'));
  assert.equal(record.exitCode, 0);
  assert.equal(record.expectedExitCode, 0);
  assert.ok(record.command.includes('--test-coverage-include=capability/C004/plan-model.js'));
  const stdout = readTranscript(record, 'stdout');
  assert.doesNotMatch(stdout, /coverage does not meet threshold/);
  const [row] = record.summary.coverage;
  assert.equal(row.file, 'plan-model.js');
  for (const kind of ['lines', 'branches', 'functions']) assert.ok(row[kind] >= 85, `${kind} ${row[kind]}`);
  assert.match(stdout, new RegExp(`plan-model\\.js \\| +${row.lines.toFixed(2)} \\| +${row.branches.toFixed(2)} \\| +${row.functions.toFixed(2)} \\|`));
});
