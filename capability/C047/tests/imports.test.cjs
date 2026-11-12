'use strict';
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { assert, subject, fixture, login, request, denied, world } = require('./kit.cjs');
const own = path.resolve(process.env.C047_SUBJECT || path.join(__dirname, '..'));
const manifest = JSON.parse(fs.readFileSync(path.join(own, 'imports.json')));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('all twelve actually loaded accepted production imports match explicit Git/LF/CRLF forms and OIDs', () => {
  const capability = path.dirname(own);
  const actual = Object.keys(require.cache).filter(file => file.startsWith(capability + path.sep) && !file.startsWith(own + path.sep))
    .map(file => 'capability/' + path.relative(capability, file).replaceAll('\\', '/')).sort();
  assert.equal(manifest.entries.length, 12, 'EXACT_ACCEPTED_TRANSITIVE_IMPORT_DOMAIN');
  assert.deepEqual(actual, manifest.entries.map(e => e.path).sort(), 'NO_FAKE_OR_UNPINNED_PRODUCTION_IMPORT');
  for (const entry of manifest.entries) {
    const bytes = fs.readFileSync(path.join(path.dirname(capability), ...entry.path.split('/')));
    assert.equal([entry.gitSha256, entry.lfSha256, entry.crlfSha256].includes(sha(bytes)), true, 'ACTUAL_PUBLISHED_IMPORT_FORM:' + entry.path);
    assert.match(entry.gitBlobOid, /^[0-9a-f]{40}$/, 'EXPLICIT_PUBLISHED_BLOB_OID');
    assert.match(entry.publicationCommit, /^[0-9a-f]{40}$/, 'EXPLICIT_ACTUAL_PRODUCER_PUBLICATION');
    assert.equal(sha(Buffer.from(bytes.toString().replace(/\r\n/g, '\n'))), entry.lfSha256, 'EXPLICIT_LF_FORM:' + entry.path);
    assert.equal(sha(Buffer.from(bytes.toString().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'))), entry.crlfSha256, 'EXPLICIT_CRLF_FORM:' + entry.path);
  }
  assert.equal(manifest.entries.find(e => e.card === 'C022').publicationCommit, '23b4bc747509618e8c734e6a7a36da3b7f0d4201', 'ACCEPTED_ORIGINAL_C022_NOT_A_FAKE_DEPENDENCY');
  assert.equal(manifest.entries.find(e => e.card === 'C009').publicationCommit, 'b956cd0eee89e2afeec9bc64ef5a2bc9d05211f1', 'ACCEPTED_U053_C009_NAMESPACE');
  assert.equal(typeof subject.createApp, 'function', 'SANCTIONED_BRIDGE_EXPORTED');
});

test('same accepted user in two tenants has separate current preview authority', async () => {
  const f = await fixture();
  try {
    const alder = await login(f, 'dana'), birch = await login(f, 'dana', 'tenant-birch'), admin = await login(f, 'ada');
    assert.equal((await request(f, '/candidate', { token: alder.token })).status, 200, 'DUAL_USER_MEMBER_REAL_PREVIEW');
    denied(await request(f, '/candidate', { token: birch.token }), 403, 'ROLE_FORBIDDEN');
    const changed = await request(f, '/v1/admin/role', { method: 'POST', token: admin.token, body: { user: 'dana', role: 'viewer' } });
    assert.equal(changed.status, 200, 'OWN_TENANT_DEMOTION_SUCCEEDS');
    const before = world(f);
    denied(await request(f, '/candidate', { token: alder.token }), 403, 'ROLE_FORBIDDEN');
    denied(await request(f, '/candidate', { token: birch.token }), 403, 'ROLE_FORBIDDEN');
    assert.deepEqual(world(f), before, 'DUAL_TENANT_REFUSALS_HAVE_NO_EFFECT');
    assert.equal((await request(f, '/v1/session', { token: birch.token })).json.session.tenant, 'tenant-birch', 'OTHER_TENANT_SESSION_REMAINS_OWNED_AND_ACTIVE');
  } finally { await f.app.close(); }
});
