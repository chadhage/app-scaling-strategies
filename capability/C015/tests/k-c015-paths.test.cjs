'use strict';

// Specified in K-C015.feature: fixture paths are confined to the owned namespace and never follow links.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { cardRoot, demoNamespace, resolveNamespace, assertSafePath, within } = require('..\\paths.cjs');

function code(expected) {
  return (error) => error.code === expected && error.name === 'C015FixtureError';
}

function newFixture() {
  const location = resolveNamespace(`test-${randomUUID()}`);
  fs.mkdirSync(location.base, { recursive: true });
  const created = [];
  const owned = (relative) => {
    const target = path.resolve(location.root, relative);
    if (target === location.root || !within(location.root, target)) throw new Error('Only a child of the unique test namespace may be created.');
    return target;
  };
  return {
    location,
    owned,
    mkdir(relative) {
      fs.mkdirSync(relative ? owned(relative) : location.root, { recursive: true });
      created.push({ kind: 'directory', target: relative ? owned(relative) : location.root });
    },
    file(relative, bytes = 'synthetic') {
      const target = owned(relative);
      fs.writeFileSync(target, bytes);
      created.push({ kind: 'file', target });
      return target;
    },
    hardlink(sourceRelative, targetRelative) {
      const target = owned(targetRelative);
      fs.linkSync(owned(sourceRelative), target);
      created.push({ kind: 'file', target });
    },
    junction(targetRelative, linkRelative) {
      const link = owned(linkRelative);
      fs.symlinkSync(owned(targetRelative), link, 'junction');
      created.push({ kind: 'link', target: link });
    },
    cleanup() {
      for (const entry of created.reverse()) {
        if (!fs.existsSync(entry.target) && entry.kind !== 'link') continue;
        if (entry.kind === 'directory') fs.rmdirSync(entry.target);
        else fs.unlinkSync(entry.target);
      }
      for (const directory of [location.root]) if (fs.existsSync(directory)) fs.rmdirSync(directory);
    }
  };
}

test('only the demo namespace and unique version-4 UUID test namespaces resolve, each beneath its own owned category root', () => {
  const demo = resolveNamespace(demoNamespace);
  assert.deepEqual({ ...demo }, {
    namespace: 'synthetic-restart-v1', testOnly: false,
    base: path.join(cardRoot, 'fixtures'), root: path.join(cardRoot, 'fixtures', 'synthetic-restart-v1')
  });
  const unique = `test-${randomUUID()}`;
  const test1 = resolveNamespace(unique);
  assert.equal(test1.testOnly, true);
  assert.equal(test1.base, path.join(cardRoot, 'test-scratch'));
  assert.equal(test1.root, path.join(cardRoot, 'test-scratch', unique));
  assert.ok(Object.isFrozen(demo) && Object.isFrozen(test1));
  for (const bad of [undefined, null, 5, {}, '', 'synthetic-restart-v2', 'test-', `${unique}x`, unique.toUpperCase(),
    'test-00000000-0000-1000-8000-000000000000', 'test-00000000-0000-4000-c000-000000000000', '..\\fixtures', `${unique}\\..`, 'C:\\Windows']) {
    assert.throws(() => resolveNamespace(bad), code('UNKNOWN_FIXTURE_ID'), String(bad));
  }
});

test('within accepts the root and its descendants and rejects parents, siblings and other roots', () => {
  const base = path.join(cardRoot, 'test-scratch', 'one');
  assert.equal(within(base, path.join(base, 'a', 'b')), true);
  assert.equal(within(base, path.join(base, '..two')), true);
  assert.equal(within(base, base), true);
  assert.equal(within(base, path.dirname(base)), false);
  assert.equal(within(base, path.join(path.dirname(base), 'two')), false);
  assert.equal(within(base, path.join(base, '..', 'two')), false);
  assert.equal(within(base, path.parse(base).root), false);
  assert.equal(within(base, path.join(path.parse(base).root, 'elsewhere')), false);
});

test('targets outside the selected fixture are a closed scope failure before any filesystem access', () => {
  const fixture = newFixture();
  try {
    for (const target of [
      path.join(cardRoot, 'README.md'), path.join(cardRoot, '..', 'C016'), cardRoot, path.dirname(fixture.location.base),
      path.join(fixture.location.base, `test-${randomUUID()}`), path.join(cardRoot, 'fixtures', 'synthetic-restart-v1', 'synthetic-run-001'),
      path.parse(cardRoot).root, `${fixture.location.root}-sibling`
    ]) {
      assert.throws(() => assertSafePath(fixture.location, target), code('PATH_SCOPE'), target);
    }
    assert.equal(fs.existsSync(fixture.location.root), false);
  } finally {
    fixture.cleanup();
  }
});

test('absent targets report null while real directories and regular files report their stats under the selected fixture', () => {
  const fixture = newFixture();
  try {
    assert.equal(assertSafePath(fixture.location, fixture.location.root), null);
    assert.equal(assertSafePath(fixture.location, fixture.location.base, 'directory').isDirectory(), true);
    fixture.mkdir('');
    fixture.mkdir('synthetic-run-001');
    fixture.file('synthetic-run-001\\epoch-001.json');
    assert.equal(assertSafePath(fixture.location, fixture.location.root, 'directory').isDirectory(), true);
    assert.equal(assertSafePath(fixture.location, fixture.owned('synthetic-run-001')).isDirectory(), true);
    assert.equal(assertSafePath(fixture.location, fixture.owned('synthetic-run-001\\epoch-001.json'), 'file').nlink, 1);
    assert.equal(assertSafePath(fixture.location, fixture.owned('synthetic-run-001\\epoch-002.json'), 'file'), null);
    assert.equal(assertSafePath(fixture.location, fixture.owned('missing\\deeper\\file.json')), null);
  } finally {
    fixture.cleanup();
  }
});

test('the wrong kind of existing entry and a file posing as an ancestor are closed unsafe-path failures', () => {
  const fixture = newFixture();
  try {
    fixture.mkdir('');
    fixture.mkdir('synthetic-run-001');
    fixture.file('ancestor.txt');
    fixture.file('synthetic-run-001\\epoch-001.json');
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('ancestor.txt'), 'directory'), code('UNSAFE_PATH'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('ancestor.txt\\child.json'), 'file'), code('UNSAFE_PATH'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('ancestor.txt\\child.json')), code('UNSAFE_PATH'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('synthetic-run-001'), 'file'), code('UNSAFE_FILE'));
    assert.equal(assertSafePath(fixture.location, fixture.owned('synthetic-run-001\\epoch-001.json'), 'file').isFile(), true);
  } finally {
    fixture.cleanup();
  }
});

test('hard-linked files and Windows junctions are rejected without following either, as target or as ancestor', () => {
  const fixture = newFixture();
  try {
    fixture.mkdir('');
    fixture.mkdir('real');
    fixture.file('real\\state.json');
    fixture.hardlink('real\\state.json', 'linked.json');
    fixture.junction('real', 'junction');
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('linked.json'), 'file'), code('UNSAFE_FILE'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('real\\state.json'), 'file'), code('UNSAFE_FILE'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('junction')), code('UNSAFE_PATH'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('junction'), 'directory'), code('UNSAFE_PATH'));
    assert.throws(() => assertSafePath(fixture.location, fixture.owned('junction\\state.json'), 'file'), code('UNSAFE_PATH'));
    assert.deepEqual(fs.readdirSync(fixture.owned('real')), ['state.json']);
  } finally {
    fixture.cleanup();
  }
});

test('a filesystem error other than a missing entry is not mistaken for absence', () => {
  const fixture = newFixture();
  try {
    fixture.mkdir('');
    assert.throws(() => assertSafePath(fixture.location, path.join(fixture.location.root, 'bad\0name')), (error) => error.code === 'ERR_INVALID_ARG_VALUE');
  } finally {
    fixture.cleanup();
  }
});

test('an owned root that resolves through a link is a closed unsafe-path failure for every target', () => {
  const location = resolveNamespace(`test-${randomUUID()}`);
  const original = fs.lstatSync;
  fs.lstatSync = function lstatSync(target, ...rest) {
    const stat = Reflect.apply(original, this, [target, ...rest]);
    if (path.resolve(String(target)) === cardRoot) return Object.create(stat, { isSymbolicLink: { value: () => true } });
    return stat;
  };
  try {
    assert.throws(() => assertSafePath(location, location.root), code('UNSAFE_PATH'));
  } finally {
    fs.lstatSync = original;
  }
  assert.equal(assertSafePath(location, location.root), null);
});
