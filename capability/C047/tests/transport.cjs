'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), sha = b => crypto.createHash('sha256').update(b).digest('hex');
function files(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name), path.join(prefix, e.name)) : [path.join(prefix, e.name)]);
}
function transport(output) {
  assert.equal(fs.existsSync(output), false, 'OWN_TRANSPORT_ROOT_MUST_BE_NEW');
  fs.mkdirSync(output);
  const birth = fs.lstatSync(output, { bigint: true });
  const rootIdentity = { device: String(birth.dev), fileId: String(birth.ino), birthtimeNs: String(birth.birthtimeNs) };
  fs.writeFileSync(path.join(output, 'fixture-created-before-work.json'), JSON.stringify({ owner: 'worker-C047', path: output, rootIdentity,
    authority: 'successful exclusive mkdir observed before any private Git transport work', NOT_PUBLICATION: true }) + '\n', { flag: 'wx' });
  const repository = path.join(output, 'repository'), destination = path.join(repository, 'capability', 'C047'), checkout = path.join(output, 'checkout');
  fs.mkdirSync(destination, { recursive: true }); fs.mkdirSync(checkout);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
  env.GIT_CONFIG_GLOBAL = path.join(output, 'no-global-config'); env.GIT_CONFIG_SYSTEM = path.join(output, 'no-system-config');
  const git = args => cp.execFileSync('git', ['-c', 'core.autocrlf=true', ...args], { cwd: repository, env, stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024 });
  git(['init', '--quiet']);
  const selection = files(root);
  for (const rel of selection) { const to = path.join(destination, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(root, rel), to); }
  git(['add', '--', 'capability/C047']);
  git(['checkout-index', '--all', '--prefix=' + checkout + path.sep]);
  const rows = selection.map(rel => {
    const gitPath = 'capability/C047/' + rel.replaceAll('\\', '/'), original = fs.readFileSync(path.join(root, rel));
    const indexed = git(['show', ':' + gitPath]), checked = fs.readFileSync(path.join(checkout, 'capability', 'C047', rel));
    const textual = /\.(cjs|ps1|md|feature)$/.test(rel);
    const expected = textual ? Buffer.from(original.toString().replace(/\r\n/g, '\n')) : original;
    assert.deepEqual(indexed, expected, 'REAL_FILTERED_INDEX_BYTES:' + rel);
    assert.deepEqual(checked, expected, 'REAL_AUTORCRLF_CHECKOUT_BYTES:' + rel);
    return { path: rel.replaceAll('\\', '/'), bytes: original.length, rawSha256: sha(original), filteredSha256: sha(indexed), checkoutSha256: sha(checked),
      blobOid: git(['rev-parse', ':' + gitPath]).toString().trim(), policy: textual ? 'text eol=lf' : '-text raw preserved' };
  });
  const tree = git(['write-tree']).toString().trim();
  const patch = git(['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-color']);
  fs.writeFileSync(path.join(output, 'namespace.patch'), patch, { flag: 'wx' });
  const result = { schema: 'C047-exact-owned-private-Git-transport-fixture/1', NOT_PUBLICATION: true, commitCreated: false, claimedC047Head: null,
    coreAutocrlf: true, globalConfigurationChanged: false, tree, selectedFiles: selection.length, rootIdentityBeforeWork: rootIdentity,
    exactFilteredNamespacePatch: { path: 'namespace.patch', sha256: sha(patch), bytes: patch.length, parentOnlyApplicationAuthority: true }, rows };
  fs.rmSync(repository, { recursive: true }); fs.rmSync(checkout, { recursive: true });
  assert.equal(fs.existsSync(repository), false, 'EXACT_OWN_PRIVATE_GIT_REPOSITORY_TRANSIENT_ABSENT');
  assert.equal(fs.existsSync(checkout), false, 'EXACT_OWN_PRIVATE_CHECKOUT_TRANSIENT_ABSENT');
  const after = fs.lstatSync(output, { bigint: true });
  assert.deepEqual({ device: String(after.dev), fileId: String(after.ino), birthtimeNs: String(after.birthtimeNs) }, rootIdentity, 'RETAINED_TRANSPORT_CORPUS_ROOT_IDENTITY_UNCHANGED');
  result.actualOwnTransientCleanup = { confirmed: true, repositoryAbsent: true, checkoutAbsent: true, sourcePatchAndReceiptsRetained: true };
  fs.writeFileSync(path.join(output, 'transport.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}
if (require.main === module) console.log(JSON.stringify(transport(path.resolve(process.argv[2]))));
module.exports = { files, transport, sha };
