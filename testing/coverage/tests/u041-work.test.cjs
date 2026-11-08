'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./u041-support.cjs');
const { naiveMatch } = require('./naive-glob.cjs');

function cpuRun(operation, repetitions) {
  let matches = 0;
  const start = process.cpuUsage();
  for (let index = 0; index < repetitions; index += 1) matches += Number(operation());
  const used = process.cpuUsage(start);
  return { cpuMicros: used.user + used.system, matches, repetitions };
}

test('U041 A08/A09: actual matcher CPU work is observed against a naive control in the SAME run', (t) => {
  const { compileGlob } = load('glob.cjs');
  const pattern = '*';
  const input = 'a'.repeat(1024);
  const matcher = compileGlob(pattern);
  for (let index = 0; index < 64; index += 1) {
    assert.equal(matcher.test(input), true);
    assert.equal(naiveMatch(pattern, input).matched, true);
  }
  const measured = cpuRun(() => matcher.test(input), 512);
  // Windows CPU accounting is quantized. More control calls provide a nonzero denominator without any wall-clock deadline.
  const control = cpuRun(() => naiveMatch(pattern, input).matched, 65536);
  assert.equal(measured.matches, measured.repetitions);
  assert.equal(control.matches, control.repetitions);
  assert.equal(control.cpuMicros > 0, true, 'the naive control must accumulate observable CPU work');
  const ratio = measured.cpuMicros * control.repetitions / (control.cpuMicros * measured.repetitions);
  t.diagnostic(JSON.stringify({ pattern, characters: input.length, measured, control, cpuRatio: ratio, ratioLimit: 64 }));
  assert.equal(ratio <= 64, true, `A08/A09 hidden work: same-input CPU ratio ${ratio}, limit 64; not elapsed time`);
  const outcome = matcher.measure(input);
  assert.deepEqual([outcome.matched, outcome.consumed, outcome.steps], [true, input.length, 1 + 2 * input.length]);
});
