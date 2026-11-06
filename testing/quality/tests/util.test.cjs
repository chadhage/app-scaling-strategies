'use strict';
// Direct tests of the shared helpers: they carry the rules, so their edge cases are pinned here.
const { assert, test } = require('./support.cjs');
const u = require('../util.cjs');

test('type guards', () => {
  assert.ok(u.isObj({}) && !u.isObj(null) && !u.isObj([]) && !u.isObj('x'));
  assert.ok(u.isNum(0) && !u.isNum(NaN) && !u.isNum(Infinity) && !u.isNum('1'));
  assert.ok(u.isStr('a') && !u.isStr('  ') && !u.isStr(3));
  assert.ok(u.isArr([]) && !u.isArr({}));
});

test('approx and round tolerate float noise but not real differences', () => {
  assert.ok(u.approx(0.1 + 0.2, 0.3, 1e-9));
  assert.ok(!u.approx(1, 1.001, 1e-6));
  assert.ok(!u.approx('1', 1));
  assert.equal(u.round(1.0000004, 6), 1);
});

test('ceilingFor follows ceil(worst x 1.25 / 5) x 5 and reproduces the reviewer figures', () => {
  assert.equal(u.ceilingFor(55.054), 70);
  assert.equal(u.ceilingFor(56.074), 75);
  assert.equal(u.ceilingFor(57.354), 75);
  assert.equal(u.ceilingFor(11.0318), 15);
  assert.equal(u.ceilingFor(0.88828), 5);
  assert.equal(u.ceilingFor(4), 5);
  assert.equal(u.ceilingFor(4.0001), 10);
});

test('integrityHash ignores the integrity and validation fields and keeps key order', () => {
  const a = { x: 1, y: { z: 2 }, integrity: { packetSha256: 'a' }, validation: { v: 1 } };
  const b = { x: 1, y: { z: 2 }, integrity: { packetSha256: 'b' } };
  assert.equal(u.integrityHash(a), u.integrityHash(b));
  assert.notEqual(u.integrityHash({ y: 1, x: 2 }), u.integrityHash({ x: 2, y: 1 }));
  assert.match(u.integrityHash(a), /^[0-9a-f]{64}$/);
});

test('makeSink collects findings in order', () => {
  const { findings, add } = u.makeSink();
  add('A', 'p', 'first');
  add('B', 'q', 'second');
  assert.deepEqual(findings.map((f) => f.code), ['A', 'B']);
});

test('walkStrings visits every string with its path', () => {
  const seen = [];
  u.walkStrings({ a: 'x', b: [{ c: 'y' }, 3, null], d: { e: 'z' } }, (s, p) => seen.push(`${p}=${s}`));
  assert.deepEqual(seen, ['a=x', 'b[0].c=y', 'd.e=z']);
});

test('planStatements gathers commands from every section and the script, and ignores junk', () => {
  const plan = {
    guards: [{ commands: ['az account show'] }, null],
    armingSequence: [{ commands: ['az group exists --name x'] }],
    deletionOrder: [{ commands: ['az group delete --name x', 7] }],
    verification: [{}], rollback: 'nope',
    teardown: { job: { script: ['Assert-Lease'] } }
  };
  const paths = u.planStatements(plan).map((s) => s.path);
  assert.deepEqual(paths, ['cleanupAndRollback.guards[0].commands[0]', 'cleanupAndRollback.armingSequence[0].commands[0]', 'cleanupAndRollback.deletionOrder[0].commands[0]', 'cleanupAndRollback.teardown.job.script[0]']);
  assert.deepEqual(u.planStatements({}), []);
  const legacy = u.planStatements({ deletionOrder: [{ command: 'az group delete --name x' }], verification: [{ how: 'az group exists --name x' }] }).map((s) => s.path);
  assert.deepEqual(legacy, ['cleanupAndRollback.deletionOrder[0].command', 'cleanupAndRollback.verification[0].how']);
});

test('azInvocations finds az commands but not the word az inside quoted text', () => {
  assert.deepEqual(u.azInvocations('az group delete --name x --yes').map((i) => i.command), ['group delete']);
  assert.deepEqual(u.azInvocations("if ((az account show --query id -o tsv) -ne $s) { throw 'the az session differs' }").map((i) => i.command), ['account show']);
  assert.deepEqual(u.azInvocations('Assert-Lease; az webapp delete --name a; az group exists --name b').map((i) => i.command), ['webapp delete', 'group exists']);
  assert.deepEqual(u.azInvocations('$g = az group show --name $G -o json | ConvertFrom-Json').map((i) => i.command), ['group show']);
  assert.deepEqual(u.azInvocations('az graph query -q "resources | where x == \'y\'" --subscriptions s').map((i) => i.statement.includes('--subscriptions')), [true]);
  assert.deepEqual(u.azInvocations('Write-Host maze'), []);
});

test('dayAge counts whole UTC days', () => {
  assert.equal(u.dayAge('2026-11-04', '2026-11-11T23:59:59Z'), 7);
  assert.equal(u.dayAge('2026-11-04', '2026-11-12T00:00:00Z'), 8);
  assert.equal(u.dayAge('2026-11-04', '2026-11-04T10:00:00Z'), 0);
});
