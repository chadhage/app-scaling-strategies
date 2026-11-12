'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { files, sha } = require('./transport.cjs');
const { root, verifySelection } = require('./selection.cjs');
const output = process.env.C047_CAPTURE_DIR;
assert.equal(typeof output, 'string', 'EXPLICIT_OWN_FRESH_CAPTURE');
assert.equal(Date.parse(process.env.C047_WORKER_DEADLINE) - Date.now() >= 420000, true, 'FIXED_WORKER_DEADLINE_FRESH_ADMISSION');
verifySelection();
const physical = path.resolve(root, '..', '..'), ownFiles = files(root), imports = JSON.parse(fs.readFileSync(path.join(root, 'imports.json')));
const browser = JSON.parse(fs.readFileSync(path.join(root, 'browser-imports.json')));
const env = { ...process.env, NODE_V8_COVERAGE: '' };
delete env.NODE_TEST_CONTEXT; delete env.C047_ADMISSION; delete env.C047_WORKER_DEADLINE; delete env.C047_SUBJECT;
const forms = [];
for (const form of ['LF', 'CRLF']) {
  const tree = path.join(output, 'fresh-' + form.toLowerCase());
  assert.equal(fs.existsSync(tree), false, 'EXACT_OWN_FRESH_TREE_MUST_BE_NEW');
  fs.mkdirSync(tree);
  const born = fs.lstatSync(tree, { bigint: true }), rows = [];
  function copy(relative, bytes, textual, role, retainChangedSnapshot = true) {
    const deployed = textual ? Buffer.from(bytes.toString().replace(/\r\n/g, '\n').replace(/\n/g, form === 'LF' ? '\n' : '\r\n')) : bytes;
    const to = path.join(tree, ...relative.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, deployed, { flag: 'wx' });
    if (retainChangedSnapshot) {
      const historical = path.join(output, 'fresh-source-' + form.toLowerCase(), ...relative.split('/')) + '.source.txt';
      fs.mkdirSync(path.dirname(historical), { recursive: true }); fs.writeFileSync(historical, deployed, { flag: 'wx' });
    }
    rows.push({ path: relative, role, rawSha256: sha(bytes), deployedSha256: sha(deployed), bytes: deployed.length,
      form: textual ? form : 'exact raw data preserved', actuallyCopied: true,
      sourceRetention: retainChangedSnapshot ? 'exact .source.txt snapshot in this capture' : 'unchanged exact existing private physical package corpus, bound in browser-imports.json' });
  }
  for (const relative of ownFiles) copy('capability/C047/' + relative.replaceAll('\\', '/'), fs.readFileSync(path.join(root, relative)),
    /\.(cjs|ps1|md|feature)$/.test(relative), 'every actual current C047 file');
  for (const entry of imports.entries) {
    const bytes = fs.readFileSync(path.join(physical, ...entry.path.split('/')));
    assert.equal([entry.gitSha256, entry.lfSha256, entry.crlfSha256].includes(sha(bytes)), true, 'ACTUAL_PINNED_PRODUCTION_IMPORT_BEFORE_FRESH');
    copy(entry.path, bytes, /\.(cjs|js)$/.test(entry.path), 'exact accepted producer, explicit qualified executable form');
  }
  for (const entry of browser.acceptedHelperEntries) {
    const bytes = fs.readFileSync(path.join(physical, ...entry.path.split('/')));
    assert.equal(sha(bytes), entry.physicalCopySha256, 'ACCEPTED_NATIVE_INPUT_CURRENT_RAW_BEFORE_FRESH');
    copy(entry.path, bytes, entry.path.endsWith('.cjs'), entry.sealedPolicyOrDataRawPreserved ? 'sealed policy data raw untouched' : 'accepted helper/source data');
  }
  for (const entry of browser.existingPackageFiles) copy('testing/browser/node_modules/' + entry.path,
    fs.readFileSync(path.join(physical, 'testing', 'browser', 'node_modules', ...entry.path.split('/'))), false, 'existing installed vendor bytes untouched, not first-party production', false);
  const runs = [];
  try {
    for (const mode of ['suite', 'coverage']) {
      const args = [path.join(tree, 'capability', 'C047', 'verify.cjs'), mode], startedAtUtc = new Date().toISOString();
      const result = cp.spawnSync(process.execPath, args, { cwd: tree, env, windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
      const prefix = 'fresh-' + form.toLowerCase() + '-' + mode;
      fs.writeFileSync(path.join(output, prefix + '.stdout.raw'), result.stdout || '', { flag: 'wx' });
      fs.writeFileSync(path.join(output, prefix + '.stderr.raw'), result.stderr || '', { flag: 'wx' });
      const record = { mode, arguments: args, startedAtUtc, finishedAtUtc: new Date().toISOString(), exitCode: result.status,
        error: result.error ? { code: result.error.code, message: result.error.message } : null,
        stdoutSha256: sha(result.stdout || ''), stderrSha256: sha(result.stderr || ''),
        childPid: result.pid, synchronouslyFullyReaped: !result.error, observedBirth: null, futureKillAuthority: false,
        localPublicVerificationWatchdogMs: 180000, expiredWorkerGoConsumedByPublicVerify: false };
      runs.push(record);
      assert.equal(result.error, undefined, 'FRESH_LOCAL_WATCHDOG_NOT_A_PASS:' + form + ':' + mode);
      assert.equal(result.status, 0, 'FRESH_COMPLETE_CURRENT_SUITE_AND_FULL_FILE_COVERAGE:' + form + ':' + mode);
    }
    forms.push({ form, rows, runs, allActualOwnFiles: ownFiles.length, allImportedFiles: imports.entries.length,
      sealedPolicyAndRawHistoryNormalized: false, construction: 'physical qualified working/data forms, NOT a published/newHEAD Git archive' });
  } finally {
    const current = fs.lstatSync(tree, { bigint: true });
    assert.equal(String(current.dev) + ':' + String(current.ino) + ':' + String(current.birthtimeNs),
      String(born.dev) + ':' + String(born.ino) + ':' + String(born.birthtimeNs), 'EXACT_OWN_FRESH_ROOT_IDENTITY_BEFORE_CLEANUP');
    fs.rmSync(tree, { recursive: true });
    assert.equal(fs.existsSync(tree), false, 'EXACT_OWN_FRESH_TRANSIENT_TREE_ABSENT');
    fs.writeFileSync(path.join(output, 'fresh-' + form.toLowerCase() + '.json'), JSON.stringify({ form, rows, runs, cleanupConfirmed: true }, null, 2) + '\n', { flag: 'wx' });
  }
}
assert.deepEqual(files(root), ownFiles, 'NO_SOURCE_FILE_ADDED_OR_HIDDEN_DURING_FRESH_VERIFICATION');
const report = { schema: 'C047-private-complete-LF-CRLF-qualified-forms/1', forms, publishedHeadClaimed: null,
  actualNewHeadBlobVerification: 'parent-only after actual publication', eachOwnTransientTreeRemoved: true };
fs.writeFileSync(path.join(output, 'fresh.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ forms: forms.map(row => ({ form: row.form, actualOwnFiles: row.allActualOwnFiles, runs: row.runs.map(run => ({ mode: run.mode, exitCode: run.exitCode })) })),
  publishedHeadClaimed: null, eachOwnTransientTreeRemoved: true }));
