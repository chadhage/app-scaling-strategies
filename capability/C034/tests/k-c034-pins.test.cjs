'use strict';

// Specified in K-C034.feature: pinned sources and the saved trace fail closed on every unsafe, drifted or unknown input.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { freshLoad, withFs, shadow } = require('./fixtures/fresh-modules.cjs');
const trace = require('..\\trace.js');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pinsPath = require.resolve('..\\pins.cjs');
const importsPath = require.resolve('..\\imports.json');
const savedPath = require.resolve('..\\saved.cjs');
const imports = JSON.parse(fs.readFileSync(importsPath, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const code = (expected) => (error) => error.code === expected && error.message === expected;

function loadPins(overrides) {
  return freshLoad(pinsPath, { [importsPath]: { ...imports, ...overrides } });
}
function scratch() {
  const directory = path.join(__dirname, `k-scratch-${randomUUID()}`);
  fs.mkdirSync(directory);
  const created = [];
  return {
    directory,
    file(name, bytes = 'fixture\r\n') {
      const target = path.join(directory, name);
      fs.writeFileSync(target, bytes);
      created.push(['file', target]);
      return target;
    },
    hardlink(source, name) {
      const target = path.join(directory, name);
      fs.linkSync(source, target);
      created.push(['file', target]);
      return target;
    },
    junction(target, name) {
      const link = path.join(directory, name);
      fs.symlinkSync(target, link, 'junction');
      created.push(['link', link]);
      return link;
    },
    entry(target, overrides = {}) {
      const bytes = fs.readFileSync(target);
      return { card: 'C020', path: path.relative(repository, target), raw: sha(bytes), lf: sha(lf(bytes)), git: sha(lf(bytes)), ...overrides };
    },
    cleanup() {
      for (const [, target] of created.reverse()) fs.unlinkSync(target);
      fs.rmdirSync(directory);
    }
  };
}

test('a pinned file is read once with its exact raw and line-ending-normalized pins and nothing else is readable', () => {
  const space = scratch();
  try {
    const file = space.file('pinned.txt', 'one\r\ntwo\r\n');
    const pins = loadPins({ dependencies: [space.entry(file)] });
    assert.deepEqual(pins.readPinned(pins.pins.dependencies[0]), fs.readFileSync(file));
    assert.throws(() => pins.readPinned({ ...pins.pins.dependencies[0] }), code('CLOSED_PIN_REQUIRED'));
    for (const wrong of [{ raw: '0'.repeat(64) }, { lf: '0'.repeat(64) }]) {
      const drifted = loadPins({ dependencies: [space.entry(file, wrong)] });
      assert.throws(() => drifted.readPinned(drifted.pins.dependencies[0]), code('SOURCE_RAW_OR_LF_PIN_MISMATCH'));
    }
  } finally {
    space.cleanup();
  }
});

test('a pin outside the capability tree is refused before any file is opened', () => {
  for (const outside of ['..\\outside.txt', '.docs\\wiki\\kanban.md', 'capability', 'C:\\Windows\\win.ini']) {
    const pins = loadPins({ dependencies: [{ card: 'C020', path: outside, raw: '0'.repeat(64), lf: '0'.repeat(64), git: '0'.repeat(64) }] });
    assert.throws(() => pins.readPinned(pins.pins.dependencies[0]), code('SOURCE_PATH_SCOPE'), outside);
  }
});

test('links, non-files, hard links and oversize files are never read as pinned sources', () => {
  const space = scratch();
  try {
    fs.mkdirSync(path.join(space.directory, 'real'));
    const inside = path.join(space.directory, 'real', 'inside.txt');
    fs.writeFileSync(inside, 'inside\r\n');
    const link = space.junction(path.join(space.directory, 'real'), 'link');
    const file = space.file('file.txt');
    space.hardlink(file, 'linked.txt');
    const big = space.file('big.txt', Buffer.alloc(262145, 0x61));
    const pins = loadPins({ dependencies: [
      space.entry(inside, { path: path.relative(repository, path.join(link, 'inside.txt')) }),
      { card: 'C020', path: path.relative(repository, space.directory), raw: '0'.repeat(64), lf: '0'.repeat(64), git: '0'.repeat(64) },
      space.entry(file),
      space.entry(big)
    ] });
    const [throughJunction, directory, hardLinked, oversize] = pins.pins.dependencies;
    assert.throws(() => pins.readPinned(throughJunction), code('UNSAFE_SOURCE_PATH'));
    assert.throws(() => pins.readPinned(directory), code('UNSAFE_SOURCE_FILE'));
    assert.throws(() => pins.readPinned(hardLinked), code('UNSAFE_SOURCE_FILE'));
    assert.throws(() => pins.readPinned(oversize), code('UNSAFE_SOURCE_FILE'));
  } finally {
    fs.rmSync(path.join(space.directory, 'real'), { recursive: true, force: true });
    space.cleanup();
  }
});

test('a pinned file that changes identity or content while it is read is refused', () => {
  const space = scratch();
  try {
    const file = space.file('pinned.txt');
    const pins = loadPins({ dependencies: [space.entry(file)] });
    const entry = pins.pins.dependencies[0];
    assert.throws(() => withFs({ fstatSync: (original) => (fd, ...rest) => {
      const stat = Reflect.apply(original, fs, [fd, ...rest]);
      return shadow(stat, { size: stat.size + 1 });
    } }, () => pins.readPinned(entry)), code('SOURCE_CHANGED'));
    let calls = 0;
    assert.throws(() => withFs({ fstatSync: (original) => (fd, ...rest) => {
      const stat = Reflect.apply(original, fs, [fd, ...rest]);
      calls += 1;
      return calls === 2 ? shadow(stat, { mtimeMs: stat.mtimeMs + 1 }) : stat;
    } }, () => pins.readPinned(entry)), code('SOURCE_CHANGED'));
    assert.deepEqual(pins.readPinned(entry), fs.readFileSync(file));
  } finally {
    space.cleanup();
  }
});

test('an accepted Git blob is required and must hash to its pin, while unknown saved-source IDs are refused', () => {
  const pins = loadPins({ dependencies: [{ ...imports.dependencies[0], git: '0'.repeat(64) }] });
  assert.throws(() => pins.checkImports(), code('ACCEPTED_GIT_PIN_MISMATCH'));
  const space = scratch();
  try {
    const file = space.file('not-in-git.txt');
    const unpublished = loadPins({ dependencies: [space.entry(file)] });
    assert.throws(() => unpublished.checkImports(), code('ACCEPTED_GIT_BLOB_REQUIRED'));
  } finally {
    space.cleanup();
  }
  const real = require('..\\pins.cjs');
  for (const unknown of ['unknown', undefined, 5, 'toString', '']) assert.throws(() => real.historicalPin(unknown), code('UNKNOWN_SAVED_SOURCE'), String(unknown));
  for (const known of ['report', 'closed-history', 'held-snapshot']) assert.ok(real.historicalPin(known).path.includes('C033'), known);
});

test('the saved trace loads only from its exact regular, single-link, in-place bytes', () => {
  const directory = path.join(root, 'evidence', 'raw', 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116');
  const json = path.join(directory, 'bundle.json');
  const script = path.join(directory, 'bundle.js');
  const bundle = freshLoad(savedPath);
  assert.deepEqual(bundle.traces.map((entry) => entry.id), trace.ids);
  assert.ok(Object.isFrozen(bundle) && Object.isFrozen(bundle.traces[0]));
  const only = (file, make) => (original) => (target, ...rest) => {
    const stat = Reflect.apply(original, fs, [target, ...rest]);
    return path.resolve(String(target)) === file ? make(stat) : stat;
  };
  for (const [name, patches] of [
    ['hard link', { lstatSync: only(json, (stat) => shadow(stat, { nlink: 2 })) }],
    ['not a file', { lstatSync: only(script, (stat) => shadow(stat, { isFile: () => false })) }],
    ['oversize', { lstatSync: only(json, (stat) => shadow(stat, { size: trace.MAX_BYTES + 1 })) }],
    ['directory link', { lstatSync: only(directory, (stat) => shadow(stat, { isSymbolicLink: () => true })) }],
    ['moved real path', { realpathSync: (original) => Object.assign((target, ...rest) => (path.resolve(String(target)) === json ? `${json}.moved` : Reflect.apply(original, fs, [target, ...rest])), original) }]
  ]) {
    assert.throws(() => withFs(patches, () => freshLoad(savedPath)), code('UNSAFE_SAVED_TRACE_FILE'), name);
  }
  for (const file of [json, script]) {
    assert.throws(() => withFs({ readFileSync: (original) => (target, ...rest) => {
      const bytes = Reflect.apply(original, fs, [target, ...rest]);
      return typeof target === 'string' && path.resolve(target) === file ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes;
    } }, () => freshLoad(savedPath)), code('SAVED_TRACE_BYTE_MISMATCH'), path.basename(file));
  }
  assert.equal(require.cache[savedPath] === undefined || require.cache[savedPath].loaded, true);
});
