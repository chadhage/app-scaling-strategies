'use strict';

// The imports of C022 are read-only, pinned and the ONLY code it takes from other namespaces. Hermetic: it reads working bytes (raw or
// LF-normalized, accepted either way, L-0188) and loads modules; the recomputation against git is tests\anchor.cjs (archived evidence).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const imports = require('../imports.json');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const PRODUCTION = ['contract.js', 'identity.cjs', 'store.cjs', 'service.cjs', 'server.cjs', 'page.js'];

test('every imported accepted file matches its pins by raw or LF-normalized bytes, and the pin metadata is coherent', () => {
  assert.equal(imports.schema, 'C022-imports/1');
  assert.equal(imports.dependencies.length, 7);
  for (const dep of imports.dependencies) {
    const bytes = fs.readFileSync(path.join(repo, dep.path));
    assert.ok(sha(bytes) === dep.raw || sha(lf(bytes)) === dep.lf, `${dep.path} drifted from its pin`);
    assert.equal(dep.git, dep.lf, 'the accepted Git blob is the LF-canonical form');
    assert.match(dep.commit, /^[0-9a-f]{40}$/);
    assert.equal(dep.tag.split('/').at(-1), dep.commit.slice(0, 12), dep.path);
    assert.match(dep.path, /^(capability\/C009\/|capability\/C020\/|testing\/browser\/)/, 'only the named accepted producers');
  }
  assert.equal(imports.accepted.C009.commit, 'f95cc52a29cf643fd443b80e5c0b112556feb548');
  assert.equal(imports.accepted.C020.tag, 'kanban/C020/2dc471daab3f');
});

test('C022 production code loads exactly the pinned accepted files from other namespaces and nothing else', () => {
  const script = `
    for (const file of ${JSON.stringify(PRODUCTION.filter((name) => name !== 'page.js'))}) require(${JSON.stringify(root + path.sep)} + file);
    const mine = ${JSON.stringify(root + path.sep)};
    const cap = ${JSON.stringify(path.join(repo, 'capability') + path.sep)};
    console.log(JSON.stringify(Object.keys(require.cache).filter((f) => f.startsWith(cap) && !f.startsWith(mine)).map((f) => f.slice(${repo.length + 1}).replaceAll('\\\\', '/')).sort()));`;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: repo, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr);
  const used = imports.dependencies.filter((dep) => dep.path.startsWith('capability/')).map((dep) => dep.path).sort();
  assert.deepEqual(JSON.parse(run.stdout), used);
});

test('production sources require only Node built-ins, their own files and the pinned imports: no other namespace, no network, no child process', () => {
  const allowed = new Set(imports.dependencies.filter((dep) => dep.path.startsWith('capability/')).map((dep) => `../${dep.path.split('/').slice(-2).join('/')}`));
  for (const file of PRODUCTION) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, request] of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      assert.ok(request.startsWith('node:') || request.startsWith('./') || allowed.has(request), `${file} requires ${request}`);
    }
    assert.doesNotMatch(source, /child_process|node:https|node:net'|node:dns|node:tls|XMLHttpRequest|WebSocket|importScripts|\.azure|az login|azd |process\.env/, file);
  }
});

test('the importer contract: everything C022 takes from C009 http-io.cjs exists with the shape C022 relies on, and the false README line does not', () => {
  const io = require('../../C009/http-io.cjs');
  for (const name of ['createResponder', 'createLanes', 'localGuard', 'hasBody', 'readBody', 'canStopReading', 'clientErrorCode', 'isFinished']) {
    assert.equal(typeof io[name], 'function', name);
  }
  assert.equal(Object.isFrozen(io), true);
  const admit = io.createLanes({ depth: 4 });
  assert.equal(typeof admit, 'function');
  assert.equal(admit.length, 3, 'admit(request, response, task)');
  assert.equal(admit.refuse.length, 2, 'admit.refuse(socket, code): it takes TWO arguments (the C009 README line with { immediate } is false, review F14)');
  assert.doesNotMatch(fs.readFileSync(path.join(repo, 'capability', 'C009', 'http-io.cjs'), 'utf8'), /immediate/);
  const queue = require('../../C009/queue.cjs').createQueue();
  assert.equal(typeof queue.run, 'function');
  assert.equal(queue.size(), 0);
  const { CODES } = require('../../C009/codes.cjs');
  const mine = require('../contract.js').CODES;
  for (const code of ['EXPECTATION_FAILED', 'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'REQUEST_TIMEOUT', 'METHOD_NOT_ALLOWED']) {
    assert.equal(CODES[code][0], mine[code][0], `${code}: the Node-own answer of C009 and the code table of C022 agree on the status`);
  }
});

test('the C020 profiles come through the accepted getProfileV2 only, and no other C020 file is touched', () => {
  const { getProfileV1, getProfileV2 } = require('../../C020/profiles.cjs');
  assert.deepEqual(getProfileV2({ profileId: 'synthetic-001' }).profile, getProfileV1({ profileId: 'synthetic-001' }).profile);
  assert.equal(getProfileV2({ profileId: 'synthetic-001' }).stamp.implementation, 'v2');
  assert.throws(() => getProfileV2({ profileId: 'synthetic-999' }), { code: 'UNKNOWN_PROFILE' });
  for (const tenantProfiles of Object.values(require('../contract.js').profileIds)) for (const profileId of tenantProfiles) assert.equal(getProfileV2({ profileId }).apiContract, 'getProfile/1');
});

test('the gates not imported, and why, are written down', () => {
  assert.match(imports.c009ReadmeFalseLine, /immediate/);
  assert.match(imports.policy, /never edits an imported file/);
});
