'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const imports = require('../imports.json');
const s = require('./support.cjs');

const repo = path.resolve(s.root, '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
// The pinned files of the U018 qualify helper. Read defensively so that an imports.json without them (the published one of the third fix, which is the
// subject of the RED fix-imports) fails by ASSERTION in each test below and never by a TypeError.
const qualifyFiles = imports.qualifyHelper ? imports.qualifyHelper.files : [];

test('every imported accepted file matches its pins by raw or LF-normalized bytes, and the pin metadata is coherent', () => {
  assert.equal(imports.schema, 'C017-imports/1');
  for (const dep of imports.dependencies) {
    const bytes = fs.readFileSync(path.join(repo, dep.path));
    assert.ok(sha(bytes) === dep.raw || sha(lf(bytes)) === dep.lf, `${dep.path} drifted from its pin`);
    assert.equal(dep.git, dep.lf, 'the accepted Git blob is the LF-canonical form');
    assert.match(dep.commit, /^[0-9a-f]{40}$/);
    assert.equal(dep.tag, `kanban/${dep.card}/${dep.commit.slice(0, 12)}`);
    assert.equal(imports.accepted[dep.card].commit === dep.commit || imports.accepted[dep.card].tag === dep.tag, true);
  }
  const helper = imports.browserHelper;
  const bytes = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.ok(sha(bytes) === helper.raw || sha(lf(bytes)) === helper.lf, 'the browser helper drifted from its pin');
  assert.equal(helper.git, helper.lf, 'the accepted Git blob is the LF-canonical form');
  // F34 of the fifth review: the real-Edge scripts also import U018 qualifyEdge(), which is pinned file by file like every other import.
  assert.ok(qualifyFiles.length >= 6, 'qualify.cjs, the three modules it loads and the sealed qualified list are pinned in imports.json (qualifyHelper)');
  for (const file of qualifyFiles) {
    const content = fs.readFileSync(path.join(repo, file.path));
    assert.ok(sha(content) === file.raw || sha(lf(content)) === file.lf, `${file.path} drifted from its pin`);
    assert.equal(file.git, file.lf, 'the accepted Git blob is the LF-canonical form');
    assert.match(file.commit, /^[0-9a-f]{40}$/);
    assert.equal(file.tag, `kanban/U018/${file.commit.slice(0, 12)}`);
  }
});

test('every import of the test tooling (tests\\*.cjs and tests\\fixtures\\*.cjs) that leaves the namespace is a pinned file: an accepted dependency, the isolated browser helper or a file of the qualify helper (F34)', () => {
  const pinned = new Set([...imports.dependencies.map((d) => d.path), imports.browserHelper.path, ...qualifyFiles.map((file) => file.path)]);
  const found = new Map();
  for (const dir of [__dirname, path.join(__dirname, 'fixtures')]) {
    for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.cjs'))) {
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      for (const [, request] of source.matchAll(/require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) {
        const target = path.resolve(dir, request);
        if (target === s.root || target.startsWith(s.root + path.sep)) continue;
        found.set(path.relative(repo, target), `${path.relative(s.root, path.join(dir, name))}`);
      }
    }
  }
  assert.ok(found.size >= 3, `the scan finds the imports that leave the namespace (${[...found.keys()].join(', ')})`);
  for (const [target, by] of found) assert.ok(pinned.has(target), `${by} imports ${target}, which imports.json does not pin`);
});

test('the files that U018 qualify.cjs loads are exactly the pinned ones, and the sealed qualified list it reads is pinned too', () => {
  const script = `
    require(${JSON.stringify(path.join(repo, 'testing', 'browser', 'qualify', 'qualify.cjs'))});
    const base = ${JSON.stringify(path.join(repo, 'testing', 'browser', 'qualify') + path.sep)};
    console.log(JSON.stringify(Object.keys(require.cache).filter((f) => f.startsWith(base)).map((f) => f.slice(${repo.length + 1})).sort()));`;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.NODE_OPTIONS;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: repo, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr);
  const modules = qualifyFiles.map((file) => file.path).filter((file) => file.endsWith('.cjs')).sort();
  assert.deepEqual(JSON.parse(run.stdout), modules);
  assert.ok(qualifyFiles.some((file) => file.path.endsWith('qualified.json')), 'the data file qualifyEdge() reads is pinned');
});

test('C017 production code loads exactly the pinned accepted files from other namespaces and nothing else', () => {
  const script = `
    require('${path.join(s.root, 'journal.cjs').replaceAll('\\', '\\\\')}');
    require('${path.join(s.root, 'engine.cjs').replaceAll('\\', '\\\\')}');
    require('${path.join(s.root, 'server.cjs').replaceAll('\\', '\\\\')}');
    require('${path.join(s.root, 'cli.cjs').replaceAll('\\', '\\\\')}');
    const mine = ${JSON.stringify(s.root + path.sep)};
    const cap = ${JSON.stringify(path.join(repo, 'capability') + path.sep)};
    console.log(JSON.stringify(Object.keys(require.cache).filter((f) => f.startsWith(cap) && !f.startsWith(mine)).map((f) => f.slice(${repo.length + 1})).sort()));`;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: repo, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), imports.dependencies.map((d) => d.path).sort());
});

test('production sources require only Node built-ins, their own files and the pinned imports (no unaccepted namespace, no network, no child process)', () => {
  const production = ['contract.js', 'reconcile.cjs', 'journal.cjs', 'engine.cjs', 'server.cjs', 'cli.cjs', 'page.js'];
  const allowed = new Set(imports.dependencies.map((d) => d.path.split('\\').slice(-2).join('/')));
  for (const file of production) {
    const source = fs.readFileSync(path.join(s.root, file), 'utf8');
    for (const [, request] of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const ok = request.startsWith('node:') || request.startsWith('./') || [...allowed].some((entry) => request.endsWith(entry));
      assert.ok(ok, `${file} requires ${request}`);
    }
    assert.doesNotMatch(source, /child_process|node:https|node:net'|node:dns|node:tls|XMLHttpRequest|WebSocket|importScripts|C042|\.azure|az login|azd /, file);
  }
});

test('the gates that are not imported are documented with a reason', () => {
  assert.deepEqual(Object.keys(imports.gatesNotImported).sort(), ['C016', 'C019', 'C035', 'C036']);
  for (const reason of Object.values(imports.gatesNotImported)) assert.ok(reason.length > 60);
});
