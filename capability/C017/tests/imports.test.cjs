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
  assert.equal(sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), imports.browserHelperRawSha256);
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
