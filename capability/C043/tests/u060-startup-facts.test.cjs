'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { publish } = require('./u060-startup-facts.cjs');
const { scratch, cleanup } = require('./support.cjs');
const code = fs.readFileSync(path.join(__dirname, 'u060-startup-facts.cjs'), 'utf8');

function controlled(stage, collision = false) {
  const destination = path.join(__dirname, 'scratch', 'fixture-atomic', 'worker-202.start.json');
  const pending = path.join(path.dirname(destination), '.worker-202.start.json.fixture-uuid.pending');
  const neighbour = path.join(path.dirname(destination), 'unrelated.json');
  const bytes = Buffer.from('{"unchanged":true}');
  const files = new Map([[neighbour, bytes]]);
  if (collision) files.set(pending, bytes);
  const fail = (value) => { throw Object.assign(new Error(value), { code: value }); };
  const io = {
    existsSync: (file) => files.has(file),
    writeFileSync(file, value) {
      if (files.has(file)) return fail('EEXIST');
      files.set(file, Buffer.alloc(0));
      if (stage === 'write') return fail('ENOSPC');
      files.set(file, Buffer.from(value));
    },
    linkSync(from, to) {
      if (stage === 'link') return fail('EIO');
      if (files.has(to)) return fail('EEXIST');
      files.set(to, Buffer.from(files.get(from)));
    },
    unlinkSync: (file) => files.delete(file),
  };
  const fakeRequire = (name) => name === 'node:fs' ? io : name === 'node:crypto' ? { randomUUID: () => 'fixture-uuid' } : require(name);
  const module = { exports: {} };
  vm.compileFunction(code, ['require', 'module'])(fakeRequire, module);
  return { publish: module.exports.publish, files, destination, pending, neighbour, bytes };
}

test('U060 startup facts: two live namespaces preserve each other and a neighbour in FIFO/LIFO repeated cleanup', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const dirs = [scratch(), scratch()];
    const neighbour = scratch();
    try {
      fs.writeFileSync(path.join(neighbour, 'fact.json'), '{"neighbour":true}');
      const expected = dirs.map((directory, index) => {
        const fact = { pid: index + 201, token: `fixture-${index}`, identityRecorded: true };
        publish(path.join(directory, 'fact.json'), fact);
        assert.deepEqual(fs.readdirSync(directory), ['fact.json']);
        return fact;
      });
      cleanup(dirs[order[0]]);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dirs[order[1]], 'fact.json'), 'utf8')), expected[order[1]]);
      cleanup(dirs[order[0]]);
      assert.equal(fs.readFileSync(path.join(neighbour, 'fact.json'), 'utf8'), '{"neighbour":true}');
      cleanup(dirs[order[1]]);
    } finally { cleanup(...dirs, neighbour); }
  }
});
test('U060 startup facts: duplicate final publication is refused without replacing existing identity bytes', () => {
  const directory = scratch();
  try {
    const file = path.join(directory, 'fact.json');
    const fact = { pid: 201, token: 'fixture-first', identityRecorded: true };
    publish(file, fact);
    const before = fs.readFileSync(file);
    assert.throws(() => publish(file, { pid: 202, token: 'fixture-other', identityRecorded: true }), { code: 'EEXIST' });
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(directory), ['fact.json']);
  } finally { cleanup(directory); }
});
test('U060 startup facts: failed write/link publishes nothing, surfaces the error and removes only its pending bytes', () => {
  for (const [stage, error] of [['write', 'ENOSPC'], ['link', 'EIO']]) {
    const state = controlled(stage);
    assert.throws(() => state.publish(state.destination, { pid: 201 }), { code: error });
    assert.equal(state.files.has(state.destination), false);
    assert.equal(state.files.has(state.pending), false);
    assert.deepEqual(state.files.get(state.neighbour), state.bytes);
  }
});
test('U060 startup facts: a preexisting pending-name collision is not adopted or deleted', () => {
  const state = controlled(null, true);
  assert.throws(() => state.publish(state.destination, { pid: 201 }), { code: 'EEXIST' });
  assert.equal(state.files.has(state.destination), false);
  assert.deepEqual(state.files.get(state.pending), state.bytes);
  assert.deepEqual(state.files.get(state.neighbour), state.bytes);
});
