'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fs, path, subject, load, startNode, startBarrier, passingFixture, makeScratch, dispose } = require('./u041-support.cjs');

test('U041 P1/FU3: --json spellings share one scalar rule, including empty and repeated arguments', () => {
  const { parseArgs } = load('gate.cjs');
  const spaced = parseArgs(['--root', 'r', '--json', 'out with spaces.json']);
  assert.deepEqual(parseArgs(['--root', 'r', '--json=out with spaces.json']), spaced);
  assert.equal(parseArgs(['--root', 'r', '--json=--odd.json']).json, '--odd.json');
  for (const args of [['--json', ''], ['--json=']]) {
    assert.throws(() => parseArgs(['--root', 'r', ...args]), (error) => error.code === 'USAGE' && /needs a value/.test(error.message));
  }
  for (const args of [
    ['--json', 'a.json', '--json=b.json'], ['--json=a.json', '--json', 'b.json'], ['--json=a.json', '--json=b.json']
  ]) {
    assert.throws(() => parseArgs(['--root', 'r', ...args]), (error) => error.code === 'USAGE' && /more than once/.test(error.message));
  }
});

test('U041 P1/FU3: real passing gates honor both --json promises and refuse both empty spellings', async (t) => {
  const base = makeScratch('u041-json');
  t.after(() => dispose(base));
  const root = passingFixture(path.join(base, 'fixture'));
  const gate = path.join(subject, 'gate.cjs');
  const launch = async (json) => {
    const process = startNode([gate, '--root', root, '--scratch', path.join(base, 'runs'), ...json], { cwd: base });
    try { return await process.done; } finally { await process.close(); }
  };
  for (const [name, args] of [
    ['spaced.json', ['--json', path.join(base, 'spaced.json')]],
    ['equals.json', [`--json=${path.join(base, 'equals.json')}`]],
    ['--odd.json', ['--json=--odd.json']]
  ]) {
    const run = await launch(args);
    assert.equal(run.status, 0, `${name}: ${run.stderr}`);
    const stdout = JSON.parse(run.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(base, name), 'utf8')), stdout);
    assert.deepEqual([stdout.pass, stdout.fullBar], [true, true]);
  }
  const before = fs.readdirSync(base).sort();
  for (const args of [['--json', ''], ['--json=']]) {
    const run = await launch(args);
    assert.equal(run.status, 2, run.stderr);
    assert.deepEqual([JSON.parse(run.stdout).pass, JSON.parse(run.stdout).error.code], [false, 'USAGE']);
    assert.match(JSON.parse(run.stdout).error.message, /needs a value/);
    assert.deepEqual(fs.readdirSync(base).sort(), before);
  }
});

for (const order of [['first', 'second'], ['second', 'first']]) {
  test(`U041 P2/FU1: two REAL gates share one --json path, ${order.join(' then ')}, and the loser never replaces the winner`, async () => {
    const base = makeScratch('u041-race');
    const barrier = await startBarrier();
    const children = [];
    try {
      const root = passingFixture(path.join(base, 'fixture'), true);
      const report = path.join(base, 'shared.json');
      const neighbour = path.join(base, 'neighbour.json');
      fs.writeFileSync(neighbour, '{"precious":true}\n');
      const launch = (label) => startNode([
        path.join(subject, 'gate.cjs'), '--root', root, '--json', report, '--scratch', path.join(base, label)
      ], { cwd: base, env: { U041_BARRIER_PORT: String(barrier.port), U041_LABEL: label } });
      const first = launch('first');
      children.push(first);
      await barrier.ready('first');
      const second = launch('second');
      children.push(second);
      await barrier.ready('second');
      const instances = { first, second };
      barrier.release(order[0]);
      const early = await instances[order[0]].done;
      const interim = fs.readFileSync(report);
      barrier.release(order[1]);
      const late = await instances[order[1]].done;
      const outcomes = { [order[0]]: early, [order[1]]: late };
      tDiagnostic(outcomes);
      assert.deepEqual([outcomes.first.status, outcomes.second.status], [1, 0], 'one displaced writer, one genuine passing writer');
      assert.equal(JSON.parse(outcomes.first.stdout).error.code, 'REPORT_CHANGED');
      const winner = JSON.parse(outcomes.second.stdout);
      assert.deepEqual([winner.pass, winner.fullBar], [true, true]);
      assert.deepEqual(JSON.parse(fs.readFileSync(report, 'utf8')), winner, 'the surviving writer owns the report');
      if (order[0] === 'second') assert.deepEqual(fs.readFileSync(report), interim, 'the later conflict does not change a single winner byte');
      assert.equal(fs.readFileSync(neighbour, 'utf8'), '{"precious":true}\n');
    } finally {
      await barrier.close();
      for (const child of children) await child.close();
      await barrier.close();
      dispose(base);
    }
  });
}

function tDiagnostic(outcomes) {
  for (const [label, run] of Object.entries(outcomes)) {
    console.log(`U041 concurrent ${label}: exit=${run.status}; ${run.stdout}`);
  }
}
